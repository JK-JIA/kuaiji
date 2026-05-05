package com.ledgernotes.app;

import android.os.Build;
import android.webkit.WebSettings;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Capacitor 页面源为 https://localhost，请求 http:// 的 API 时，WebView 会拦截「混合内容」，
 * 导致 fetch 报 Failed to fetch。此处允许混合内容；勿再 setWebChromeClient 覆盖 BridgeWebChromeClient。
 */
public class MainActivity extends BridgeActivity {

    private void applyWebViewNetworkPolicy() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        WebSettings settings = bridge.getWebView().getSettings();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebViewNetworkPolicy();
    }
}
