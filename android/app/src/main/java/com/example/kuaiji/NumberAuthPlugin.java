package com.example.kuaiji;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
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
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
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
    private static final int PRELOGIN_TIMEOUT_MS = 5000;
    private static final int MASK_PHONE_TIMEOUT_SEC = 2;
    private static final long PRELOGIN_CACHE_TTL_MS = 5 * 60 * 1000L;
    private static final long MASK_DISK_CACHE_TTL_MS = 7L * 24 * 60 * 60 * 1000L;
    private static final String PREFS_NUMBER_AUTH = "kuaiji_number_auth";
    private static final String PREF_MASK_PHONE = "masked_phone";
    private static final String PREF_MASK_AT = "mask_at";
    private static final String PREF_CARRIER = "carrier_vendor";

    private static JSObject cachedPreLogin;
    private static long cachedPreLoginAt;
    private static final CopyOnWriteArrayList<String> DEBUG_LOGS = new CopyOnWriteArrayList<>();
    private static final int MAX_DEBUG_LOGS = 400;

    private boolean accelerateRetried;
    private volatile boolean warmUpInProgress;
    private volatile boolean accelerateDone;
    private long accelerateDoneAt;
    private volatile CountDownLatch warmUpLatch = new CountDownLatch(0);

    private final Object envGate = new Object();
    private int envPhase = 0;
    private final List<Runnable> envOkRunnables = new ArrayList<>();
    private final List<Runnable> envFailRunnables = new ArrayList<>();

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile Activity resumedActivity;
    private volatile Activity loginAuthActivity;

    private PhoneNumberAuthHelper authHelper;
    private String carrierVendor = "";
    private String maskedPhone = "";
    private String lastAuthSecret = "";
    private boolean envOk = false;
    private PluginCall pendingCall;
    private PluginCall pendingMaskCall;
    private volatile boolean maskProbeOnly;

    private void dbg(String msg) {
        String line =
                new SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(new Date()) + " " + msg;
        DEBUG_LOGS.add(line);
        while (DEBUG_LOGS.size() > MAX_DEBUG_LOGS) {
            DEBUG_LOGS.remove(0);
        }
        android.util.Log.d("NumberAuth", msg);
        JSObject data = new JSObject();
        data.put("line", line);
        notifyListeners("authDebugLog", data);
    }

    private static String debugLogText() {
        StringBuilder sb = new StringBuilder();
        for (String line : DEBUG_LOGS) {
            sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private static void attachDebug(JSObject ret) {
        if (ret != null) ret.put("debugLog", debugLogText());
    }

    private void runAfterEnvCheck(PhoneNumberAuthHelper helper, Runnable onOk, Runnable onFail) {
        synchronized (envGate) {
            if (envPhase == 2) {
                if (onOk != null) onOk.run();
                return;
            }
            if (envPhase == 3) {
                if (onFail != null) onFail.run();
                return;
            }
            if (onOk != null) envOkRunnables.add(onOk);
            if (onFail != null) envFailRunnables.add(onFail);
            if (envPhase == 1) return;
            envPhase = 1;
        }

        dbg("checkEnvAvailable 开始");
        helper.setAuthListener(
                new TokenResultListener() {
                    @Override
                    public void onTokenSuccess(String s) {
                        try {
                            TokenRet ret = TokenRet.fromJson(s);
                            String code = ret.getCode();
                            dbg("checkEnv onTokenSuccess code=" + code + " raw=" + truncate(s, 120));
                            if (ResultCode.CODE_ERROR_ENV_CHECK_SUCCESS.equals(code)) {
                                envOk = true;
                                drainEnvSuccess();
                            }
                        } catch (Exception e) {
                            dbg("checkEnv parse err: " + e.getMessage());
                            drainEnvFail();
                        }
                    }

                    @Override
                    public void onTokenFailed(String s) {
                        dbg("checkEnv onTokenFailed: " + truncate(s, 200));
                        envOk = false;
                        drainEnvFail();
                    }
                });
        helper.checkEnvAvailable(PhoneNumberAuthHelper.SERVICE_TYPE_LOGIN);
    }

    private void drainEnvSuccess() {
        List<Runnable> okList;
        synchronized (envGate) {
            envPhase = 2;
            okList = new ArrayList<>(envOkRunnables);
            envOkRunnables.clear();
            envFailRunnables.clear();
        }
        dbg("checkEnvAvailable 成功");
        Activity act = getActivity();
        if (act != null) {
            act.runOnUiThread(
                    () -> {
                        for (Runnable r : okList) r.run();
                    });
        } else {
            for (Runnable r : okList) r.run();
        }
    }

    private void drainEnvFail() {
        List<Runnable> failList;
        synchronized (envGate) {
            envPhase = 3;
            failList = new ArrayList<>(envFailRunnables);
            envOkRunnables.clear();
            envFailRunnables.clear();
        }
        Activity act = getActivity();
        if (act != null) {
            act.runOnUiThread(
                    () -> {
                        for (Runnable r : failList) r.run();
                    });
        } else {
            for (Runnable r : failList) r.run();
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    @Override
    public void load() {
        super.load();
        Application app = (Application) getContext().getApplicationContext();
        app.registerActivityLifecycleCallbacks(
                new Application.ActivityLifecycleCallbacks() {
                    @Override
                    public void onActivityResumed(Activity activity) {
                        resumedActivity = activity;
                        if (isLoginAuthActivity(activity)) {
                            loginAuthActivity = activity;
                        }
                    }

                    @Override
                    public void onActivityPaused(Activity activity) {
                        if (resumedActivity == activity) resumedActivity = null;
                    }

                    @Override
                    public void onActivityDestroyed(Activity activity) {
                        if (loginAuthActivity == activity) loginAuthActivity = null;
                    }

                    @Override
                    public void onActivityCreated(Activity activity, android.os.Bundle savedInstanceState) {}

                    @Override
                    public void onActivityStarted(Activity activity) {}

                    @Override
                    public void onActivityStopped(Activity activity) {}

                    @Override
                    public void onActivitySaveInstanceState(Activity activity, android.os.Bundle outState) {}

                });
    }

    private static boolean isLoginAuthActivity(Activity activity) {
        return activity instanceof LoginAuthActivity
                || "LoginAuthActivity".equals(activity.getClass().getSimpleName());
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

    /** 展示格式：前三位 + **** + 后四位（与运营商 SDK 一致） */
    private static String normalizeMaskDisplay(String mask) {
        if (TextUtils.isEmpty(mask)) return "";
        String t = mask.trim();
        if (t.matches("^1\\d{10}$")) {
            return t.substring(0, 3) + "****" + t.substring(7);
        }
        if (t.matches("^1\\d{2}\\*+\\d{4}$")) {
            return t.replaceAll("\\*+", "****");
        }
        return t;
    }

    /** 反射 getLoginMaskPhone（部分机型/运营商会 600009，失败则走授权页探测） */
    private String fetchLoginMaskPhone(PhoneNumberAuthHelper helper, String secret) {
        if (TextUtils.isEmpty(secret)) return "";
        final String[] holder = new String[1];
        final CountDownLatch latch = new CountDownLatch(1);
        Activity act = getActivity();
        Runnable work =
                () -> {
                    holder[0] = fetchLoginMaskPhoneOnMainThread(helper, secret);
                    latch.countDown();
                };
        if (act != null) {
            act.runOnUiThread(work);
        } else {
            work.run();
        }
        try {
            boolean completed = latch.await(MASK_PHONE_TIMEOUT_SEC, TimeUnit.SECONDS);
            if (!completed) dbg("fetchLoginMaskPhone 等待超时");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return holder[0] != null ? holder[0] : "";
    }

    private String fetchLoginMaskPhoneOnMainThread(PhoneNumberAuthHelper helper, String secret) {
        try {
            Field proxyField = PhoneNumberAuthHelper.class.getDeclaredField("e");
            proxyField.setAccessible(true);
            Object proxy = proxyField.get(helper);
            if (proxy == null) {
                dbg("fetchLoginMaskPhone: proxy 为空");
                return "";
            }
            OnLoginPhoneListener listener =
                    new OnLoginPhoneListener() {
                        @Override
                        public void onGetLoginPhone(LoginPhoneInfo info) {
                            if (info != null && !TextUtils.isEmpty(info.getPhoneNumber())) {
                                dbg("getLoginMaskPhone 回调: " + info.getPhoneNumber());
                            } else {
                                dbg("getLoginMaskPhone 回调无号码");
                            }
                        }

                        @Override
                        public void onGetFailed(String s) {
                            dbg("getLoginMaskPhone 回调失败: " + truncate(s, 160));
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
            String vendorKey = TextUtils.isEmpty(carrierVendor) ? "" : carrierVendor;
            boolean[][] boolTries = {{false, false}, {true, false}, {false, true}};
            for (boolean[] pair : boolTries) {
                final String[] sync = new String[1];
                final CountDownLatch one = new CountDownLatch(1);
                OnLoginPhoneListener wrapped =
                        new OnLoginPhoneListener() {
                            @Override
                            public void onGetLoginPhone(LoginPhoneInfo info) {
                                listener.onGetLoginPhone(info);
                                if (info != null && !TextUtils.isEmpty(info.getPhoneNumber())) {
                                    sync[0] = info.getPhoneNumber();
                                }
                                one.countDown();
                            }

                            @Override
                            public void onGetFailed(String s) {
                                listener.onGetFailed(s);
                                one.countDown();
                            }
                        };
                Object ret =
                        getMask.invoke(
                                proxy,
                                PhoneNumberAuthHelper.SERVICE_TYPE_LOGIN,
                                secret,
                                wrapped,
                                pair[0],
                                pair[1],
                                vendorKey);
                one.await(MASK_PHONE_TIMEOUT_SEC, TimeUnit.SECONDS);
                String parsed = parseMaskedPhone(sync[0]);
                if (parsed.isEmpty() && ret instanceof String) {
                    parsed = parseMaskedPhone((String) ret);
                }
                if (!parsed.isEmpty()) {
                    dbg(
                            "getLoginMaskPhone 成功 bool="
                                    + pair[0]
                                    + ","
                                    + pair[1]
                                    + " -> "
                                    + parsed);
                    return normalizeMaskDisplay(parsed);
                }
            }
        } catch (Exception e) {
            dbg("fetchLoginMaskPhone 异常: " + e.getClass().getSimpleName() + " " + e.getMessage());
        }
        return "";
    }

    private static void collectTextViews(View root, List<TextView> out) {
        if (root instanceof TextView) {
            out.add((TextView) root);
        }
        if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) {
                collectTextViews(g.getChildAt(i), out);
            }
        }
    }

    private String scrapeMaskFromAuthActivity(Activity act) {
        if (act == null) return "";
        String[] idNames = {
            "authsdk_number_view",
            "authsdk_tv_number",
            "authsdk_phone_view",
            "phone_tv",
            "number_tv",
            "mobile_number"
        };
        for (String name : idNames) {
            int id = act.getResources().getIdentifier(name, "id", act.getPackageName());
            if (id == 0) continue;
            View v = act.findViewById(id);
            if (v instanceof TextView) {
                String parsed = parseMaskedPhone(((TextView) v).getText().toString());
                if (!parsed.isEmpty()) {
                    dbg("授权页 id=" + name + " -> " + parsed);
                    return normalizeMaskDisplay(parsed);
                }
            }
        }
        List<TextView> texts = new ArrayList<>();
        collectTextViews(act.getWindow().getDecorView(), texts);
        for (TextView tv : texts) {
            CharSequence cs = tv.getText();
            if (cs == null) continue;
            String parsed = parseMaskedPhone(cs.toString());
            if (!parsed.isEmpty()) {
                dbg("授权页 TextView -> " + parsed);
                return normalizeMaskDisplay(parsed);
            }
        }
        return "";
    }

    /**
     * 官方 Demo 在授权页展示掩码。getLoginMaskPhone 常 600009 时，短暂拉起透明授权页读取号码后关闭。
     */
    private void probeMaskFromAuthPage(PhoneNumberAuthHelper helper, Runnable onDone) {
        Activity activity = getActivity();
        if (activity == null) {
            dbg("probeMaskFromAuthPage: 无 Activity");
            onDone.run();
            return;
        }
        dbg("probeMaskFromAuthPage: 拉起透明授权页读取掩码 …");
        maskProbeOnly = true;
        applyKuaijiAuthUi(helper);
        helper.setProtocolChecked(true);
        Runnable finishProbe =
                () -> {
                    maskProbeOnly = false;
                    try {
                        helper.quitLoginPage();
                    } catch (Exception ignored) {
                    }
                    helper.setAuthListener(null);
                    onDone.run();
                };
        helper.setAuthListener(
                new TokenResultListener() {
                    @Override
                    public void onTokenSuccess(String s) {
                        try {
                            TokenRet ret = TokenRet.fromJson(s);
                            if (ResultCode.CODE_START_AUTHPAGE_SUCCESS.equals(ret.getCode())) {
                                dbg("probeMask: 授权页已拉起，抓取掩码 …");
                                scheduleScrapeMaskFromAuthPage(helper, finishProbe);
                                return;
                            }
                            if (ResultCode.CODE_SUCCESS.equals(ret.getCode())) {
                                dbg("probeMask: 意外拿到 token，关闭授权页");
                                finishProbe.run();
                            }
                        } catch (Exception e) {
                            dbg("probeMask parse: " + e.getMessage());
                            finishProbe.run();
                        }
                    }

                    @Override
                    public void onTokenFailed(String s) {
                        dbg("probeMask onTokenFailed: " + truncate(s, 160));
                        finishProbe.run();
                    }
                });
        helper.getLoginToken(activity, 8000);
        mainHandler.postDelayed(
                () -> {
                    if (maskProbeOnly) {
                        dbg("probeMask 超时，关闭授权页");
                        finishProbe.run();
                    }
                },
                8500);
    }

    private void scheduleScrapeMaskFromAuthPage(
            PhoneNumberAuthHelper helper, Runnable finishProbe) {
        Runnable scrape =
                () -> {
                    Activity act = resumedActivity;
                    if (act == null) act = loginAuthActivity;
                    if (act != null && isLoginAuthActivity(act)) {
                        String m = scrapeMaskFromAuthActivity(act);
                        if (!m.isEmpty()) {
                            maskedPhone = m;
                            pushMaskUpdate(m);
                            dbg("probeMask 成功: " + m);
                            finishProbe.run();
                            return;
                        }
                    }
                };
        mainHandler.postDelayed(scrape, 40);
        mainHandler.postDelayed(scrape, 120);
        mainHandler.postDelayed(scrape, 260);
        mainHandler.postDelayed(
                () -> {
                    scrape.run();
                    if (maskProbeOnly) finishProbe.run();
                },
                500);
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
                        .setPageBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT))
                        .setDialogWidth(1)
                        .setDialogHeight(1)
                        .setDialogAlpha(0.01f)
                        .setDialogOffsetX(0)
                        .setDialogOffsetY(0)
                        .setTapAuthPageMaskClosePage(false)
                        .setAuthPageActIn("no_anim", "no_anim")
                        .setAuthPageActOut("no_anim", "no_anim")
                        .setScreenOrientation(authPageOrientation)
                        .create());
        helper.expandAuthPageCheckedScope(true);
    }

    /** 授权页唤起后自动点「一键登录」，用户几乎无感 */
    private void scheduleAutoConfirmLogin() {
        if (maskProbeOnly) return;
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 0);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 60);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 150);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 320);
        mainHandler.postDelayed(this::tryAutoClickAuthLogin, 600);
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

    private void pushMaskUpdate(String mask) {
        if (TextUtils.isEmpty(mask)) return;
        maskedPhone = mask;
        saveMaskCache(mask);
        JSObject data = new JSObject();
        data.put("maskedPhone", mask);
        data.put("carrierHint", carrierServiceLine(carrierVendor));
        notifyListeners("maskPhoneUpdate", data);
    }

    private void loadMaskCache() {
        try {
            SharedPreferences p =
                    getContext()
                            .getSharedPreferences(PREFS_NUMBER_AUTH, Context.MODE_PRIVATE);
            long at = p.getLong(PREF_MASK_AT, 0);
            if (at <= 0 || System.currentTimeMillis() - at > MASK_DISK_CACHE_TTL_MS) return;
            String m = p.getString(PREF_MASK_PHONE, "");
            if (!TextUtils.isEmpty(m)) {
                maskedPhone = m;
                carrierVendor = p.getString(PREF_CARRIER, carrierVendor);
                dbg("磁盘缓存掩码: " + m);
            }
        } catch (Exception e) {
            dbg("loadMaskCache: " + e.getMessage());
        }
    }

    private void saveMaskCache(String mask) {
        try {
            getContext()
                    .getSharedPreferences(PREFS_NUMBER_AUTH, Context.MODE_PRIVATE)
                    .edit()
                    .putString(PREF_MASK_PHONE, mask)
                    .putString(PREF_CARRIER, carrierVendor != null ? carrierVendor : "")
                    .putLong(PREF_MASK_AT, System.currentTimeMillis())
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private void beginWarmUpLatch() {
        warmUpLatch = new CountDownLatch(1);
    }

    private void signalWarmUpDone() {
        warmUpInProgress = false;
        CountDownLatch latch = warmUpLatch;
        if (latch != null && latch.getCount() > 0) {
            latch.countDown();
        }
    }

    /** App 启动后由 MainActivity 调用，提前预取号+读掩码，登录页可秒开 */
    public void warmUpInBackground() {
        if (warmUpInProgress) return;
        Activity activity = getActivity();
        if (activity == null) return;
        String secret = BuildConfig.ALIYUN_AUTH_SECRET;
        if (secret == null || secret.trim().isEmpty()) return;
        if (!TextUtils.isEmpty(maskedPhone)
                && System.currentTimeMillis() - accelerateDoneAt < PRELOGIN_CACHE_TTL_MS) {
            return;
        }

        warmUpInProgress = true;
        beginWarmUpLatch();
        lastAuthSecret = secret.trim();
        loadMaskCache();
        if (!TextUtils.isEmpty(maskedPhone)) {
            pushMaskUpdate(maskedPhone);
            dbg("warmUp: 已有磁盘掩码，跳过预取");
            signalWarmUpDone();
            return;
        }

        dbg("warmUp: 开始后台预取 …");
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(lastAuthSecret);
                    runAfterEnvCheck(
                            helper,
                            () -> {
                                envOk = true;
                                runAccelerateThenFetchMask(helper, false);
                            },
                            () -> signalWarmUpDone());
                });
    }

    /** 跳过 getLoginMaskPhone（常 600009 且每次阻塞 5s×3），直接透明授权页抓取，约 0.5～1.5s */
    private void resolveMaskFast(PhoneNumberAuthHelper helper, boolean forGetMaskedOnly) {
        if (!TextUtils.isEmpty(maskedPhone)) {
            completeMaskResolve(forGetMaskedOnly);
            return;
        }
        Activity act = getActivity();
        if (act == null) {
            completeMaskResolve(forGetMaskedOnly);
            return;
        }
        dbg("resolveMaskFast: 授权页探测 …");
        act.runOnUiThread(
                () ->
                        probeMaskFromAuthPage(
                                helper,
                                () -> completeMaskResolve(forGetMaskedOnly)));
    }

    private void completeMaskResolve(boolean forGetMaskedOnly) {
        if (forGetMaskedOnly) {
            finishGetMaskedPhone(maskedPhone);
        } else {
            dbg("preLogin 最终掩码: " + (maskedPhone.isEmpty() ? "(空)" : maskedPhone));
            finishPreLogin(envOk || !maskedPhone.isEmpty(), carrierVendor, null);
        }
        signalWarmUpDone();
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

    private static void invalidatePreLoginCache() {
        cachedPreLogin = null;
        cachedPreLoginAt = 0;
    }

    private static boolean shouldUsePreLoginCache(JSObject cached) {
        if (cached == null) return false;
        String mask = cached.optString("maskedPhone", "");
        if (!TextUtils.isEmpty(mask)) return true;
        String err = cached.optString("error", "");
        if (err.contains("600026") || err.contains("600009")) return false;
        return cached.optBoolean("available", false);
    }

    /** 重置授权页/预取号状态，避免 600026 */
    private void resetAuthPageState(PhoneNumberAuthHelper helper) {
        try {
            helper.userControlAuthPageCancel();
        } catch (Exception ignored) {
        }
        try {
            helper.quitLoginPage();
            dbg("quitLoginPage");
        } catch (Exception e) {
            dbg("quitLoginPage 异常: " + e.getMessage());
        }
        try {
            helper.quitPrivacyPage();
        } catch (Exception ignored) {
        }
        try {
            helper.closeAuthPageReturnBack(true);
        } catch (Exception ignored) {
        }
        finishLoginAuthActivityIfAny();
    }

    private void finishLoginAuthActivityIfAny() {
        Activity auth = loginAuthActivity;
        if (auth != null && !auth.isFinishing()) {
            dbg("finish LoginAuthActivity（缓存实例）");
            auth.runOnUiThread(auth::finish);
            loginAuthActivity = null;
        }
        Activity resumed = resumedActivity;
        if (resumed != null && isLoginAuthActivity(resumed) && !resumed.isFinishing()) {
            dbg("finish LoginAuthActivity（当前 resumed）");
            resumed.runOnUiThread(resumed::finish);
        }
    }

    /**
     * 必须使用官方两参数 API。反射 accelerate(..., true) 会让 SDK 误判「授权页已加载」并返回 600026。
     */
    private void invokeAccelerateLoginPage(
            PhoneNumberAuthHelper helper, PreLoginResultListener listener) {
        dbg("accelerateLoginPage（官方 API，非反射 true）");
        helper.accelerateLoginPage(PRELOGIN_TIMEOUT_MS, listener);
    }

    private void resetAuthHelperInstance() {
        authHelper = null;
        loginAuthActivity = null;
        synchronized (envGate) {
            envPhase = 0;
            envOkRunnables.clear();
            envFailRunnables.clear();
        }
        dbg("已重建 PhoneNumberAuthHelper 实例");
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
                        dbg("initialize ok, hasSecret=true, sdk=" + PhoneNumberAuthHelper.getVersion());
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("hasSecret", true);
                        ret.put("sdkVersion", PhoneNumberAuthHelper.getVersion());
                        attachDebug(ret);
                        call.resolve(ret);
                    } catch (Exception e) {
                        dbg("initialize failed: " + e.getMessage());
                        call.reject("INIT_FAILED", e.getMessage() != null ? e.getMessage() : "初始化失败");
                    }
                });
    }

    @PluginMethod
    public void getCachedMask(PluginCall call) {
        loadMaskCache();
        JSObject ret = new JSObject();
        if (!TextUtils.isEmpty(maskedPhone)) ret.put("maskedPhone", maskedPhone);
        ret.put("carrier", carrierLabel(carrierVendor));
        ret.put("carrierHint", carrierServiceLine(carrierVendor));
        call.resolve(ret);
    }

    @PluginMethod
    public void getMaskedPhone(PluginCall call) {
        String secret = resolveSecret(call);
        if (secret.isEmpty()) {
            call.reject("NO_SECRET", "未配置 ALIYUN_AUTH_SECRET");
            return;
        }
        Activity activity = requireActivity(call);
        if (activity == null) return;

        if (!TextUtils.isEmpty(maskedPhone)) {
            dbg("getMaskedPhone 命中缓存: " + maskedPhone);
            JSObject ret = new JSObject();
            ret.put("maskedPhone", maskedPhone);
            ret.put("carrier", carrierLabel(carrierVendor));
            ret.put("carrierHint", carrierServiceLine(carrierVendor));
            attachDebug(ret);
            call.resolve(ret);
            return;
        }

        pendingMaskCall = call;
        lastAuthSecret = secret;
        dbg("getMaskedPhone 开始（先预取号再取掩码）");
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    refreshCarrierFromHelper(helper);
                    dbg("getMaskedPhone 当前运营商: " + carrierVendor);
                    runAfterEnvCheck(
                            helper,
                            () -> runAccelerateThenFetchMask(helper, true),
                            () -> finishGetMaskedPhone(""));
                });
    }

    private void finishGetMaskedPhone(String mask) {
        PluginCall call = pendingMaskCall;
        pendingMaskCall = null;
        if (call == null) return;

        JSObject ret = new JSObject();
        if (!TextUtils.isEmpty(mask)) ret.put("maskedPhone", mask);
        ret.put("carrier", carrierLabel(carrierVendor));
        ret.put("carrierHint", carrierServiceLine(carrierVendor));
        attachDebug(ret);

        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> call.resolve(ret));
        } else {
            call.resolve(ret);
        }
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
                && System.currentTimeMillis() - cachedPreLoginAt < PRELOGIN_CACHE_TTL_MS
                && shouldUsePreLoginCache(cachedPreLogin)) {
            dbg("preLogin 命中缓存, mask=" + cachedPreLogin.optString("maskedPhone", ""));
            call.resolve(cachedPreLogin);
            return;
        }
        if (cachedPreLogin != null) {
            dbg("preLogin 忽略无效缓存（无掩码或曾 600009/600026）");
            invalidatePreLoginCache();
        }

        loadMaskCache();
        if (!TextUtils.isEmpty(maskedPhone)) {
            dbg("preLogin 命中内存/磁盘掩码: " + maskedPhone);
            envOk = true;
            JSObject ret = new JSObject();
            ret.put("available", true);
            ret.put("carrier", carrierLabel(carrierVendor));
            ret.put("carrierHint", carrierServiceLine(carrierVendor));
            ret.put("maskedPhone", maskedPhone);
            attachDebug(ret);
            cachedPreLogin = ret;
            cachedPreLoginAt = System.currentTimeMillis();
            call.resolve(ret);
            if (!warmUpInProgress) warmUpInBackground();
            return;
        }

        if (warmUpInProgress) {
            pendingCall = call;
            lastAuthSecret = secret;
            dbg("preLogin 等待后台 warmUp …");
            final PluginCall waiting = call;
            final CountDownLatch latch = warmUpLatch;
            new Thread(
                            () -> {
                                try {
                                    latch.await(10, TimeUnit.SECONDS);
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                }
                                Activity a = getActivity();
                                if (a == null) return;
                                a.runOnUiThread(
                                        () -> {
                                            if (pendingCall != waiting) return;
                                            finishPreLogin(
                                                    envOk || !maskedPhone.isEmpty(),
                                                    carrierVendor,
                                                    null);
                                        });
                            },
                            "NumberAuth-preLogin-wait")
                    .start();
            return;
        }

        pendingCall = call;
        lastAuthSecret = secret;
        accelerateRetried = false;
        dbg("preLogin 开始");
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    refreshCarrierFromHelper(helper);
                    runAfterEnvCheck(
                            helper,
                            () -> {
                                envOk = true;
                                runAccelerateThenFetchMask(helper, false);
                            },
                            () -> finishPreLogin(false, carrierVendor, "环境检查失败"));
                });
    }

    /**
     * 必须先 accelerateLoginPage 成功，再 fetchLoginMaskPhone。
     * 并行调用会导致 600009；授权页未关会导致 600026。
     */
    private void runAccelerateThenFetchMask(PhoneNumberAuthHelper helper, boolean forGetMaskedOnly) {
        if (!TextUtils.isEmpty(maskedPhone)) {
            completeMaskResolve(forGetMaskedOnly);
            return;
        }
        if (accelerateDone
                && System.currentTimeMillis() - accelerateDoneAt < PRELOGIN_CACHE_TTL_MS) {
            dbg("已预取号，直接授权页读掩码");
            resolveMaskFast(helper, forGetMaskedOnly);
            return;
        }

        resetAuthPageState(helper);
        PreLoginResultListener listener =
                new PreLoginResultListener() {
                    @Override
                    public void onTokenSuccess(String vendor) {
                        carrierVendor = !TextUtils.isEmpty(vendor) ? vendor : carrierVendor;
                        refreshCarrierFromHelper(helper);
                        dbg("accelerate onTokenSuccess: " + truncate(vendor, 120));
                        String maskFromVendor = parseMaskedPhone(vendor);
                        if (!maskFromVendor.isEmpty()) {
                            maskedPhone = maskFromVendor;
                            pushMaskUpdate(maskFromVendor);
                            if (forGetMaskedOnly) {
                                finishGetMaskedPhone(maskFromVendor);
                            } else {
                                dbg("preLogin 完成 mask=" + maskedPhone);
                                finishPreLogin(true, carrierVendor, null);
                            }
                            return;
                        }
                        accelerateDone = true;
                        accelerateDoneAt = System.currentTimeMillis();
                        dbg("accelerate 成功，授权页读掩码 …");
                        resolveMaskFast(helper, forGetMaskedOnly);
                    }

                    @Override
                    public void onTokenFailed(String vendor, String msg) {
                        dbg("accelerate onTokenFailed: " + truncate(msg, 200));
                        carrierVendor = !TextUtils.isEmpty(vendor) ? vendor : carrierVendor;
                        if (!accelerateRetried
                                && msg != null
                                && (msg.contains("600026") || msg.contains("授权页已加载"))) {
                            accelerateRetried = true;
                            dbg("600026：重置 SDK 后延迟重试 accelerate …");
                            Activity act = getActivity();
                            Runnable retry =
                                    () -> {
                                        resetAuthHelperInstance();
                                        PhoneNumberAuthHelper h = getOrCreateHelper();
                                        if (!TextUtils.isEmpty(lastAuthSecret)) {
                                            h.setAuthSDKInfo(lastAuthSecret);
                                        }
                                        resetAuthPageState(h);
                                        mainHandler.postDelayed(
                                                () -> invokeAccelerateLoginPage(h, this), 500);
                                    };
                            if (act != null) {
                                mainHandler.postDelayed(retry, 200);
                            } else {
                                retry.run();
                            }
                            return;
                        }
                        if (forGetMaskedOnly) {
                            finishGetMaskedPhone("");
                        } else {
                            finishPreLogin(envOk, carrierVendor, msg);
                        }
                        signalWarmUpDone();
                    }
                };
        dbg(forGetMaskedOnly ? "getMaskedPhone: 预取号 …" : "preLogin: 预取号 …");
        invokeAccelerateLoginPage(helper, listener);
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
        attachDebug(ret);

        cachedPreLogin = ret;
        cachedPreLoginAt = System.currentTimeMillis();

        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> call.resolve(ret));
        } else {
            call.resolve(ret);
        }
        signalWarmUpDone();
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
        invalidatePreLoginCache();
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

    /**
     * 静默登录：直接通过 accelerateLoginPage 拿 token，不弹授权页，无闪屏。
     * 若预取 token 不可用则 reject("SILENT_UNAVAILABLE")，前端降级到 login()。
     */
    @PluginMethod
    public void loginSilent(PluginCall call) {
        String secret = resolveSecret(call);
        if (secret.isEmpty()) {
            call.reject("NO_SECRET", "未配置 ALIYUN_AUTH_SECRET");
            return;
        }
        Activity activity = requireActivity(call);
        if (activity == null) return;

        pendingCall = call;
        lastAuthSecret = secret;
        invalidatePreLoginCache();
        activity.runOnUiThread(
                () -> {
                    PhoneNumberAuthHelper helper = getOrCreateHelper();
                    helper.setAuthSDKInfo(secret);
                    helper.setProtocolChecked(true);

                    PreLoginResultListener listener =
                            new PreLoginResultListener() {
                                @Override
                                public void onTokenSuccess(String tokenOrVendor) {
                                    // accelerateLoginPage 成功时 tokenOrVendor 即为 accessToken
                                    if (!TextUtils.isEmpty(tokenOrVendor)
                                            && !tokenOrVendor.contains("CMCC")
                                            && !tokenOrVendor.contains("CUCC")
                                            && !tokenOrVendor.contains("CTCC")
                                            && tokenOrVendor.length() > 20) {
                                        finishLoginSilent(true, tokenOrVendor, null);
                                    } else {
                                        // 拿到的是运营商标识而非 token，降级
                                        finishLoginSilent(false, null, "SILENT_UNAVAILABLE");
                                    }
                                }

                                @Override
                                public void onTokenFailed(String vendor, String msg) {
                                    finishLoginSilent(false, null, "SILENT_UNAVAILABLE");
                                }
                            };

                    dbg("loginSilent: accelerateLoginPage（官方 API）");
                    helper.accelerateLoginPage(LOGIN_TIMEOUT_MS, listener);
                });
    }

    private void finishLoginSilent(boolean ok, String token, String err) {
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
                        call.reject(err != null ? err : "SILENT_UNAVAILABLE", "静默登录不可用");
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

    @PluginMethod
    public void getDebugLogs(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("log", debugLogText());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearDebugLogs(PluginCall call) {
        DEBUG_LOGS.clear();
        invalidatePreLoginCache();
        PhoneNumberAuthHelper helper = authHelper;
        if (helper != null) {
            try {
                helper.clearPreInfo();
            } catch (Exception ignored) {
            }
        }
        synchronized (envGate) {
            envPhase = 0;
            envOkRunnables.clear();
            envFailRunnables.clear();
        }
        dbg("日志已清空");
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
