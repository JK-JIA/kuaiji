package com.example.kuaiji;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 方案 B：首次启动用隐藏 WebView 读取官网下载页 localStorage 中的邀请码。
 */
@CapacitorPlugin(name = "ReferralBridge")
public class ReferralBridgePlugin extends Plugin {

    private static final String DEFAULT_DOWNLOAD_URL = "https://kuaijipf.com/download";
    private static final String LS_KEY = "kuaiji_pending_invite_code";

    @PluginMethod
    public void getDeviceFingerprint(PluginCall call) {
        try {
            String androidId =
                    Settings.Secure.getString(
                            getContext().getContentResolver(),
                            Settings.Secure.ANDROID_ID);
            if (androidId == null || androidId.isEmpty()) {
                androidId = "unknown";
            }
            String raw = androidId + "|" + getContext().getPackageName();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            String fp = Base64.encodeToString(hash, Base64.NO_WRAP | Base64.URL_SAFE);
            JSObject ret = new JSObject();
            ret.put("fingerprint", fp);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "fingerprint failed");
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @PluginMethod
    public void readDownloadPageInvite(PluginCall call) {
        String url = call.getString("url", DEFAULT_DOWNLOAD_URL);
        Handler main = new Handler(Looper.getMainLooper());
        main.post(
                () -> {
                    try {
                        WebView webView = new WebView(getContext());
                        webView.setVisibility(View.GONE);
                        WebView.setWebContentsDebuggingEnabled(false);
                        webView.getSettings().setJavaScriptEnabled(true);
                        webView.getSettings().setDomStorageEnabled(true);

                        final boolean[] finished = {false};
                        webView.setWebViewClient(
                                new WebViewClient() {
                                    @Override
                                    public void onPageFinished(WebView view, String loadedUrl) {
                                        if (finished[0]) return;
                                        finished[0] = true;
                                        view.evaluateJavascript(
                                                "(function(){try{return localStorage.getItem('"
                                                        + LS_KEY
                                                        + "')||'';}catch(e){return '';}})();",
                                                value -> {
                                                    try {
                                                        String code = unwrapJsString(value);
                                                        JSObject ret = new JSObject();
                                                        ret.put("code", code != null ? code : "");
                                                        call.resolve(ret);
                                                    } catch (Exception e) {
                                                        call.reject(
                                                                e.getMessage() != null
                                                                        ? e.getMessage()
                                                                        : "read failed");
                                                    } finally {
                                                        view.destroy();
                                                    }
                                                });
                                    }
                                });

                        webView.loadUrl(url);
                        main.postDelayed(
                                () -> {
                                    if (!finished[0]) {
                                        finished[0] = true;
                                        try {
                                            webView.destroy();
                                        } catch (Exception ignored) {
                                        }
                                        JSObject ret = new JSObject();
                                        ret.put("code", "");
                                        call.resolve(ret);
                                    }
                                },
                                12_000);
                    } catch (Exception e) {
                        call.reject(e.getMessage() != null ? e.getMessage() : "webview failed");
                    }
                });
    }

    private static String unwrapJsString(String jsQuoted) {
        if (jsQuoted == null || "null".equals(jsQuoted)) return "";
        String s = jsQuoted.trim();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1);
            s = s.replace("\\\"", "\"").replace("\\\\", "\\");
        }
        return s.trim();
    }
}
