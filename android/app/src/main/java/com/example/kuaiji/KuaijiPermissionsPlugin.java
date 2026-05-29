package com.example.kuaiji;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** 账单拍照：在用户点击时申请相机 / 相册权限 */
@CapacitorPlugin(
        name = "KuaijiPermissions",
        permissions = {
            @Permission(strings = {Manifest.permission.CAMERA}, alias = "camera"),
            @Permission(
                    strings = {Manifest.permission.READ_MEDIA_IMAGES},
                    alias = "photos"),
            @Permission(
                    strings = {Manifest.permission.READ_EXTERNAL_STORAGE},
                    alias = "photosLegacy")
        })
public class KuaijiPermissionsPlugin extends Plugin {

    private static String photosAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "photos" : "photosLegacy";
    }

    private static JSObject grantedResult(boolean granted) {
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        return ret;
    }

    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve(grantedResult(true));
            return;
        }
        requestPermissionForAlias("camera", call, "cameraCallback");
    }

    @PermissionCallback
    private void cameraCallback(PluginCall call) {
        call.resolve(grantedResult(getPermissionState("camera") == PermissionState.GRANTED));
    }

    @PluginMethod
    public void requestPhotos(PluginCall call) {
        String alias = photosAlias();
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            call.resolve(grantedResult(true));
            return;
        }
        requestPermissionForAlias(alias, call, "photosCallback");
    }

    @PermissionCallback
    private void photosCallback(PluginCall call) {
        call.resolve(grantedResult(getPermissionState(photosAlias()) == PermissionState.GRANTED));
    }
}
