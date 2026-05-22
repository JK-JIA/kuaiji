package com.example.kuaiji;

import android.app.Activity;
import android.app.Application;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.mobile.auth.gatewayauth.AuthUIConfig;
import com.mobile.auth.gatewayauth.LoginAuthActivity;
import com.mobile.auth.gatewayauth.OnLoginPhoneListener;
import com.mobile.auth.gatewayauth.PhoneNumberAuthHelper;
import com.mobile.auth.gatewayauth.PreLoginResultListener;
import com.mobile.auth.gatewayauth.ResultCode;
import com.mobile.auth.gatewayauth.TokenResultListener;
import com.mobile.auth.gatewayauth.model.LoginPhoneInfo;
import com.mobile.auth.gatewayauth.model.TokenRet;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/**
 * 阿里云号码认证（一键登录）Capacitor 桥接。
 * 密钥：android/local.properties → ALIYUN_AUTH_SECRET（控制台「方案密钥」）
 */
@CapacitorPlugin(name = "NumberAuth")
public class NumberAuthPlugin extends Plugin {

    private static final int LOGIN_TIMEOUT_MS = 15000;
    private static final int PRELOGIN_TIMEOUT_MS = 5000;
    private static final int MASK_PHONE_TIMEOUT_SEC = 2;
    private static final long PRELOGIN_CACHE_TTL_MS = 5 * 60 * 1000L;

    private static JSObject cachedPreLogin;
    private static long cachedPreLoginAt;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile Activity resumedActivity;

    private PhoneNumberAuthHelper authHelper;
    private String carrierVendor = "";
    private String maskedPhone = "";
    private String lastAuthSecret = "";
    private boolean envOk = false;
    private PluginCall pendingCall;

    @Override
    public void load() {
        super.load();
        Application app = (Application) getContext().getApplicationContext();
        app.registerActivityLifecycleCallbacks(
                new Application.ActivityLifecycleCallbacks() {
                    @Override
                    public void onActivityResumed(Activity activity) {
                        resumedActivity = activity;
                    }

                    @Override
                    public void onActivityPaused(Activity activity) {
                        if (resumedActivity == activity) resumedActivity = null;
                    }

                    @Override
                    public void onActivityCreated(Activity activity, android.os.Bundle savedInstanceState) {}

                    @Override
                    public void onActivityStarted(Activity activity) {}

                    @Override
                    public void onActivityStopped(Activity activity) {}

                    @Override
                    public void onActivitySaveInstanceState(Activity activity, android.os.Bundle outState) {}

                    @Override
                    public void onActivityDestroyed(Activity activity) {}
                });
    }

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

    /** 预取号成功后通过 SDK 内部接口获取脱敏号 */
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

            Method getMask =
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
                        .setHiddenLoading(true)
                        .setNavHidden(true)
                        .setSwitchAccHidden(true)
                        .setLogoHidden(true)
                        .setSloganHidden(true)
                        .setStatusBarHidden(true)
                        .setLogBtnText("本机号码一键登录")
                        .setLogBtnBackgroundDrawable(logBtnBg)
                        .setLogBtnHeight(48)
                        .setLogBtnTextColor(Color.WHITE)
                        .setNumberColor(Color.parseColor("#1c1917"))
                        .setNumberSize(28)
                        .setSloganTextColor(Color.parseColor("#6b7280"))
                        .setVendorPrivacyPrefix("《")
                        .setVendorPrivacySuffix("》")
                        .setPageBackgroundDrawable(new ColorDrawable(Color.WHITE))
                        .setScreenOrientation(authPageOrientation)
                        .create());
        helper.expandAuthPageCheckedScope(true);
    }

    /** 授权页唤起后自动点「一键登录」，用户几乎无感 */
    private void scheduleAutoConfirmLogin() {
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 50);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 180);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 400);
    }

    private void tryAutoClickAuthLogin() {
        Activity act = resumedActivity;
        if (act == null) return;
        if (!(act instanceof LoginAuthActivity)
                && !"LoginAuthActivity".equals(act.getClass().getSimpleName())) {
            return;
        }
        int id = act.getResources().getIdentifier("authsdk_login_view", "id", act.getPackageName());
        if (id == 0) return;
        View v = act.findViewById(id);
        if (v != null && v.isShown() && v.isEnabled()) {
            v.performClick();
        }
    }

    private static String carrierLabel(String vendor) {
        if (vendor == null) return "";
        String v = vendor.trim();
        if (v.contains("电信") || "CTCC".equalsIgnoreCase(v)) return "中国电信";
        if (v.contains("移动") || "CMCC".equalsIgnoreCase(v)) return "中国移动";
        if (v.contains("联通") || "CUCC".equalsIgnoreCase(v)) return "中国联通";
        switch (v.toUpperCase()) {
            case "CMCC":
                return "中国移动";
            case "CUCC":
                return "中国联通";
            case "CTCC":
                return "中国电信";
            default:
                return v;
        }
    }

    private static String carrierServiceLine(String vendor) {
        String label = carrierLabel(vendor);
        if (label.isEmpty()) return "运营商提供认证服务";
        return label + "提供认证服务";
    }

    private void refreshCarrierFromHelper(PhoneNumberAuthHelper helper) {
        try {
            String name = helper.getCurrentCarrierName();
            if (!TextUtils.isEmpty(name)) {
                carrierVendor = name;
            }
        } catch (Exception ignored) {
        }
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

        lastAuthSecret = secret;
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

        if (cachedPreLogin != null
                && System.currentTimeMillis() - cachedPreLoginAt < PRELOGIN_CACHE_TTL_MS) {
            call.resolve(cachedPreLogin);
            return;
        }

        pendingCall = call;
        lastAuthSecret = secret;
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    maskedPhone = "";
                    refreshCarrierFromHelper(helper);
                    helper.setAuthListener(
                            new TokenResultListener() {
                                @Override
                                public void onTokenSuccess(String s) {
                                    try {
                                        TokenRet ret = TokenRet.fromJson(s);
                                        if (ResultCode.CODE_ERROR_ENV_CHECK_SUCCESS.equals(
                                                ret.getCode())) {
                                            envOk = true;
                                            runAccelerateParallel(helper);
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

    private void runAccelerateParallel(PhoneNumberAuthHelper helper) {
        final AtomicReference<String> maskAsync = new AtomicReference<>("");
        new Thread(
                        () -> {
                            String m = fetchLoginMaskPhone(helper, lastAuthSecret);
                            if (!m.isEmpty()) maskAsync.set(m);
                        },
                        "NumberAuth-mask")
                .start();

        tryAccelerateWithReflection(helper, maskAsync);
    }

    private void tryAccelerateWithReflection(
            PhoneNumberAuthHelper helper, AtomicReference<String> maskAsync) {
        try {
            Field proxyField = PhoneNumberAuthHelper.class.getDeclaredField("e");
            proxyField.setAccessible(true);
            Object proxy = proxyField.get(helper);
            if (proxy != null) {
                Method acc =
                        proxy.getClass()
                                .getMethod(
                                        "accelerateLoginPage",
                                        int.class,
                                        PreLoginResultListener.class,
                                        boolean.class);
                acc.invoke(
                        proxy,
                        PRELOGIN_TIMEOUT_MS,
                        buildAccelerateListener(helper, maskAsync),
                        true);
                return;
            }
        } catch (Exception ignored) {
        }
        helper.accelerateLoginPage(PRELOGIN_TIMEOUT_MS, buildAccelerateListener(helper, maskAsync));
    }

    private PreLoginResultListener buildAccelerateListener(
            PhoneNumberAuthHelper helper, AtomicReference<String> maskAsync) {
        return new PreLoginResultListener() {
            @Override
            public void onTokenSuccess(String vendor) {
                carrierVendor = !TextUtils.isEmpty(vendor) ? vendor : carrierVendor;
                String mask = parseMaskedPhone(vendor);
                if (mask.isEmpty()) {
                    mask = waitMaskAsync(maskAsync, 900);
                }
                if (!mask.isEmpty()) maskedPhone = mask;
                finishPreLogin(true, carrierVendor, null);
            }

            @Override
            public void onTokenFailed(String vendor, String msg) {
                String mask = waitMaskAsync(maskAsync, 400);
                if (!mask.isEmpty()) maskedPhone = mask;
                carrierVendor = !TextUtils.isEmpty(vendor) ? vendor : carrierVendor;
                finishPreLogin(envOk || !maskedPhone.isEmpty(), carrierVendor, msg);
            }
        };
    }

    private static String waitMaskAsync(AtomicReference<String> maskAsync, int maxWaitMs) {
        String mask = maskAsync.get();
        if (!mask.isEmpty()) return mask;
        int steps = Math.max(1, maxWaitMs / 100);
        for (int i = 0; i < steps; i++) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                break;
            }
            mask = maskAsync.get();
            if (!mask.isEmpty()) return mask;
        }
        return mask != null ? mask : "";
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

        cachedPreLogin = ret;
        cachedPreLoginAt = System.currentTimeMillis();

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
                                            scheduleAutoConfirmLogin();
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
