package com.ledgernotes.app;

import android.Manifest;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 请求麦克风权限
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1);
    }

    @Override
    public void onStart() {
        super.onStart();
        
        // 配置 WebView 自动授予麦克风权限
        Bridge bridge = this.getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new android.webkit.WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    // 自动授予麦克风权限
                    request.grant(request.getResources());
                }
            });
        }
    }
}
