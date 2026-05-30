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

    private static JSObject combinedResult(
            PermissionState camera, PermissionState photos) {
        JSObject ret = new JSObject();
        ret.put("camera", camera == PermissionState.GRANTED);
        ret.put("photos", photos == PermissionState.GRANTED);
        return ret;
    }

    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("camera", call, "cameraCallback");
    }

    @PermissionCallback
    private void cameraCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("camera") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPhotos(PluginCall call) {
        String alias = photosAlias();
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias(alias, call, "photosCallback");
    }

    @PermissionCallback
    private void photosCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState(photosAlias()) == PermissionState.GRANTED);
        call.resolve(ret);
    }

    /** 首次进入拍照：一次性申请相机 + 相册；已授权则直接返回 */
    @PluginMethod
    public void requestCameraAndPhotos(PluginCall call) {
        String photos = photosAlias();
        boolean cameraOk = getPermissionState("camera") == PermissionState.GRANTED;
        boolean photosOk = getPermissionState(photos) == PermissionState.GRANTED;
        if (cameraOk && photosOk) {
            call.resolve(combinedResult(PermissionState.GRANTED, PermissionState.GRANTED));
            return;
        }

        java.util.ArrayList<String> aliases = new java.util.ArrayList<>();
        if (!cameraOk) aliases.add("camera");
        if (!photosOk) aliases.add(photos);
        requestPermissionForAliases(
                aliases.toArray(new String[0]), call, "cameraAndPhotosCallback");
    }

    @PermissionCallback
    private void cameraAndPhotosCallback(PluginCall call) {
        String photos = photosAlias();
        call.resolve(
                combinedResult(
                        getPermissionState("camera"),
                        getPermissionState(photos)));
    }
}
