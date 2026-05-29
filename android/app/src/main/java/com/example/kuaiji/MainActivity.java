package com.example.kuaiji;

import android.Manifest;
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
import com.getcapacitor.PluginHandle;

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
        registerPlugin(KuaijiPermissionsPlugin.class);
        registerPlugin(NumberAuthPlugin.class);
        registerPlugin(AlipayPlugin.class);
        super.onCreate(savedInstanceState);
        applyWebViewSettings();
        new Handler(Looper.getMainLooper()).post(this::applyWebViewSettings);
        new Handler(Looper.getMainLooper()).postDelayed(this::applyWebViewSettings, 300);
        scheduleNumberAuthWarmUp();
    }

    /** 进入 App 即后台预取号+掩码，登录页可秒显号码 */
    private void scheduleNumberAuthWarmUp() {
        new Handler(Looper.getMainLooper())
                .postDelayed(
                        () -> {
                            Bridge bridge = getBridge();
                            if (bridge == null) return;
                            PluginHandle handle = bridge.getPlugin("NumberAuth");
                            if (handle != null
                                    && handle.getInstance() instanceof NumberAuthPlugin) {
                                ((NumberAuthPlugin) handle.getInstance()).warmUpInBackground();
                            }
                        },
                        1200);
    }

    /** 混合内容策略；WebView 文本缩放固定 100%，字体大小由应用内「设置」控制（html font-size） */
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
        bridge.getWebView().getSettings().setTextZoom(100);
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
