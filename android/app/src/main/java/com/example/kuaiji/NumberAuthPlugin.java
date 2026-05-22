package com.example.kuaiji;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.TextUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.mobile.auth.gatewayauth.AuthUIConfig;
import com.mobile.auth.gatewayauth.OnLoginPhoneListener;
import com.mobile.auth.gatewayauth.PhoneNumberAuthHelper;
import com.mobile.auth.gatewayauth.PreLoginResultListener;
import com.mobile.auth.gatewayauth.ResultCode;
import com.mobile.auth.gatewayauth.TokenResultListener;
import com.mobile.auth.gatewayauth.model.LoginPhoneInfo;
import com.mobile.auth.gatewayauth.model.TokenRet;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * 阿里云号码认证（一键登录）Capacitor 桥接。
 * 密钥：android/local.properties → ALIYUN_AUTH_SECRET（控制台「方案密钥」）
 */
@CapacitorPlugin(name = "NumberAuth")
public class NumberAuthPlugin extends Plugin {

    private static final int LOGIN_TIMEOUT_MS = 15000;
    private static final int PRELOGIN_TIMEOUT_MS = 8000;
    private static final int MASK_PHONE_TIMEOUT_SEC = 4;

    private PhoneNumberAuthHelper authHelper;
    private String carrierVendor = "";
    private String maskedPhone = "";
    private String lastAuthSecret = "";
    private boolean envOk = false;
    private PluginCall pendingCall;

    private static String parseMaskedPhone(String raw) {
        if (TextUtils.isEmpty(raw)) return "";
        String t = raw.trim();
        if (t.startsWith("{")) {
            try {
                JSONObject o = new JSONObject(t);
                String[] keys = {"maskPhone", "maskedPhone", "securityPhone", "number", "phone"};
                for (String k : keys) {
                    String v = o.optString(k, "");
                    if (!TextUtils.isEmpty(v)) return v;
                }
            } catch (Exception ignored) {
            }
        }
        if (t.contains("*") || (t.length() >= 11 && t.startsWith("1"))) return normalizeMaskDisplay(t);
        return "";
    }

    /** 展示格式：前三位 + *** + 后四位 */
    private static String normalizeMaskDisplay(String mask) {
        if (TextUtils.isEmpty(mask)) return "";
        String t = mask.trim();
        if (t.matches("^1\\d{10}$")) {
            return t.substring(0, 3) + "***" + t.substring(7);
        }
        if (t.matches("^1\\d{2}\\*+\\d{4}$")) {
            return t.replaceAll("\\*+", "***");
        }
        return t;
    }

    /** 预取号成功后通过 SDK 内部接口获取脱敏号（accelerate 回调通常只有运营商简称） */
    private String fetchLoginMaskPhone(PhoneNumberAuthHelper helper, String secret) {
        if (TextUtils.isEmpty(secret)) return "";
        try {
            Field proxyField = PhoneNumberAuthHelper.class.getDeclaredField("e");
            proxyField.setAccessible(true);
            Object proxy = proxyField.get(helper);
            if (proxy == null) return "";

            final String[] holder = new String[1];
            final CountDownLatch latch = new CountDownLatch(1);
            OnLoginPhoneListener listener =
                    new OnLoginPhoneListener() {
                        @Override
                        public void onGetLoginPhone(LoginPhoneInfo info) {
                            if (info != null && !TextUtils.isEmpty(info.getPhoneNumber())) {
                                holder[0] = info.getPhoneNumber();
                            }
                            latch.countDown();
                        }

                        @Override
                        public void onGetFailed(String s) {
                            latch.countDown();
                        }
                    };

            java.lang.reflect.Method getMask =
                    proxy.getClass()
                            .getMethod(
                                    "getLoginMaskPhone",
                                    int.class,
                                    String.class,
                                    OnLoginPhoneListener.class,
                                    boolean.class,
                                    boolean.class,
                                    String.class);
            getMask.invoke(
                    proxy,
                    PhoneNumberAuthHelper.SERVICE_TYPE_LOGIN,
                    secret,
                    listener,
                    true,
                    true,
                    "");
            latch.await(MASK_PHONE_TIMEOUT_SEC, TimeUnit.SECONDS);
            return normalizeMaskDisplay(holder[0] != null ? holder[0] : "");
        } catch (Exception ignored) {
            return "";
        }
    }

    private void applyKuaijiAuthUi(PhoneNumberAuthHelper helper) {
        int authPageOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        if (Build.VERSION.SDK_INT == 26) {
            authPageOrientation = ActivityInfo.SCREEN_ORIENTATION_BEHIND;
        }
        GradientDrawable logBtnBg = new GradientDrawable();
        logBtnBg.setColor(Color.parseColor("#10b981"));
        logBtnBg.setCornerRadius(48f);
        helper.setAuthUIConfig(
                new AuthUIConfig.Builder()
                        .setAppPrivacyColor(
                                Color.parseColor("#10b981"), Color.parseColor("#6b7280"))
                        .setPrivacyState(true)
                        .setCheckboxHidden(true)
                        .setNavHidden(true)
                        .setSwitchAccHidden(true)
                        .setLogBtnText("本机号码一键登录")
                        .setLogBtnBackgroundDrawable(logBtnBg)
                        .setLogBtnHeight(48)
                        .setLogBtnTextColor(Color.WHITE)
                        .setNumberColor(Color.parseColor("#1c1917"))
                        .setNumberSize(28)
                        .setSloganTextColor(Color.parseColor("#6b7280"))
                        .setVendorPrivacyPrefix("《")
                        .setVendorPrivacySuffix("》")
                        .setScreenOrientation(authPageOrientation)
                        .create());
        helper.expandAuthPageCheckedScope(true);
    }

    private static String carrierLabel(String vendor) {
        if (vendor == null) return "";
        switch (vendor.toUpperCase()) {
            case "CMCC":
                return "中国移动";
            case "CUCC":
                return "中国联通";
            case "CTCC":
                return "中国电信";
            default:
                return vendor;
        }
    }

    private static String carrierServiceLine(String vendor) {
        String label = carrierLabel(vendor);
        if (label.isEmpty()) return "运营商提供认证服务";
        return label + "提供认证服务";
    }

    private PhoneNumberAuthHelper getOrCreateHelper() {
        if (authHelper == null) {
            authHelper =
                    PhoneNumberAuthHelper.getInstance(
                            getContext().getApplicationContext(),
                            new TokenResultListener() {
                                @Override
                                public void onTokenSuccess(String s) {}

                                @Override
                                public void onTokenFailed(String s) {}
                            });
            authHelper.getReporter().setLoggerEnable(false);
        }
        return authHelper;
    }

    private String resolveSecret(PluginCall call) {
        String secret = call.getString("secret");
        if (TextUtils.isEmpty(secret)) {
            secret = BuildConfig.ALIYUN_AUTH_SECRET;
        }
        return secret != null ? secret.trim() : "";
    }

    private Activity requireActivity(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY");
            return null;
        }
        return activity;
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        String secret = resolveSecret(call);
        if (secret.isEmpty()) {
            call.reject(
                    "NO_SECRET",
                    "请在 android/local.properties 配置 ALIYUN_AUTH_SECRET（号码认证控制台方案密钥）");
            return;
        }
        Activity activity = requireActivity(call);
        if (activity == null) return;

        activity.runOnUiThread(
                () -> {
                    try {
                        PhoneNumberAuthHelper helper = getOrCreateHelper();
                        helper.setAuthSDKInfo(secret);
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("INIT_FAILED", e.getMessage() != null ? e.getMessage() : "初始化失败");
                    }
                });
    }

    @PluginMethod
    public void preLogin(PluginCall call) {
        String secret = resolveSecret(call);
        if (secret.isEmpty()) {
            call.reject("NO_SECRET", "未配置 ALIYUN_AUTH_SECRET");
            return;
        }
        Activity activity = requireActivity(call);
        if (activity == null) return;

        pendingCall = call;
        lastAuthSecret = secret;
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    maskedPhone = "";
                    helper.setAuthListener(
                            new TokenResultListener() {
                                @Override
                                public void onTokenSuccess(String s) {
                                    try {
                                        TokenRet ret = TokenRet.fromJson(s);
                                        if (ResultCode.CODE_ERROR_ENV_CHECK_SUCCESS.equals(
                                                ret.getCode())) {
                                            envOk = true;
                                            runAccelerate(helper);
                                        }
                                    } catch (Exception e) {
                                        finishPreLogin(false, "", e.getMessage());
                                    }
                                }

                                @Override
                                public void onTokenFailed(String s) {
                                    envOk = false;
                                    finishPreLogin(false, "", s);
                                }
                            });
                    helper.checkEnvAvailable(PhoneNumberAuthHelper.SERVICE_TYPE_LOGIN);
                });
    }

    private void runAccelerate(PhoneNumberAuthHelper helper) {
        helper.accelerateLoginPage(
                PRELOGIN_TIMEOUT_MS,
                new PreLoginResultListener() {
                    @Override
                    public void onTokenSuccess(String vendor) {
                        carrierVendor = vendor != null ? vendor : "";
                        String mask = parseMaskedPhone(vendor);
                        if (mask.isEmpty()) {
                            mask = fetchLoginMaskPhone(helper, lastAuthSecret);
                        }
                        if (!mask.isEmpty()) maskedPhone = mask;
                        finishPreLogin(true, carrierVendor, null);
                    }

                    @Override
                    public void onTokenFailed(String vendor, String msg) {
                        carrierVendor = vendor != null ? vendor : "";
                        finishPreLogin(envOk, carrierVendor, msg);
                    }
                });
    }

    private void finishPreLogin(boolean available, String vendor, String err) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("carrier", carrierLabel(vendor));
        ret.put("carrierHint", carrierServiceLine(vendor));
        if (!maskedPhone.isEmpty()) ret.put("maskedPhone", maskedPhone);
        if (err != null) ret.put("error", err);
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> call.resolve(ret));
        } else {
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void login(PluginCall call) {
        String secret = resolveSecret(call);
        if (secret.isEmpty()) {
            call.reject("NO_SECRET", "未配置 ALIYUN_AUTH_SECRET");
            return;
        }
        Activity activity = requireActivity(call);
        if (activity == null) return;

        pendingCall = call;
        lastAuthSecret = secret;
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    applyKuaijiAuthUi(helper);
                    helper.setProtocolChecked(true);
                    helper.setAuthListener(
                            new TokenResultListener() {
                                @Override
                                public void onTokenSuccess(String s) {
                                    try {
                                        TokenRet ret = TokenRet.fromJson(s);
                                        if (ResultCode.CODE_START_AUTHPAGE_SUCCESS.equals(
                                                ret.getCode())) {
                                            return;
                                        }
                                        if (ResultCode.CODE_SUCCESS.equals(ret.getCode())
                                                && !TextUtils.isEmpty(ret.getToken())) {
                                            helper.hideLoginLoading();
                                            helper.quitLoginPage();
                                            finishLogin(true, ret.getToken(), null);
                                            helper.setAuthListener(null);
                                        }
                                    } catch (Exception e) {
                                        helper.hideLoginLoading();
                                        helper.quitLoginPage();
                                        finishLogin(false, null, e.getMessage());
                                        helper.setAuthListener(null);
                                    }
                                }

                                @Override
                                public void onTokenFailed(String s) {
                                    helper.hideLoginLoading();
                                    String msg = s;
                                    try {
                                        TokenRet ret = TokenRet.fromJson(s);
                                        if (ResultCode.CODE_ERROR_USER_CANCEL.equals(
                                                ret.getCode())) {
                                            msg = "USER_CANCEL";
                                        }
                                    } catch (Exception ignored) {
                                    }
                                    finishLogin(false, null, msg);
                                    helper.setAuthListener(null);
                                    helper.quitLoginPage();
                                }
                            });
                    helper.getLoginToken(activity, LOGIN_TIMEOUT_MS);
                });
    }

    private void finishLogin(boolean ok, String token, String err) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        Runnable done =
                () -> {
                    if (ok && token != null) {
                        JSObject ret = new JSObject();
                        ret.put("accessToken", token);
                        call.resolve(ret);
                    } else {
                        call.reject("LOGIN_FAILED", err != null ? err : "一键登录失败");
                    }
                };
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(done);
        } else {
            done.run();
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
