package com.ledgernotes.app;

import android.Manifest;
import android.content.res.Configuration;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Capacitor 页面源为 https://localhost，请求 http:// 的 API 时，WebView 会拦截「混合内容」，
 * 导致 fetch 报 Failed to fetch。此处允许混合内容；勿再 setWebChromeClient 覆盖 BridgeWebChromeClient。
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_RECORD_AUDIO = 0x5243; // 'RC'

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InstallApkPlugin.class);
        registerPlugin(KuaijiHttpPlugin.class);
        super.onCreate(savedInstanceState);
        applyWebViewSettings();
        new Handler(Looper.getMainLooper()).post(this::applyWebViewSettings);
        new Handler(Looper.getMainLooper()).postDelayed(this::applyWebViewSettings, 300);
    }

    /** 混合内容策略 + 跟随系统字体缩放（fontScale），应用内最多按 150% 放大 */
    private void applyWebViewSettings() {
        applyWebViewNetworkPolicy();
        applyWebViewTextZoom();
    }

    private void applyWebViewNetworkPolicy() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        WebSettings settings = bridge.getWebView().getSettings();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    private void applyWebViewTextZoom() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        float scale = getResources().getConfiguration().fontScale;
        float capped = Math.min(Math.max(scale, 1.0f), 1.5f);
        bridge.getWebView().getSettings().setTextZoom(Math.round(capped * 100f));
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyWebViewSettings();
    }

    /** 提前申请麦克风，避免 WebView 内 getUserMedia 直接报 Permission denied（仍依赖 Manifest 声明 MODIFY_AUDIO_SETTINGS） */
    private void ensureRecordAudioPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
    }

    @Override
    public void onStart() {
        super.onStart();
        ensureRecordAudioPermission();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebViewSettings();
    }
}
