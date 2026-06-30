package com.example.kuaiji;

import android.Manifest;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.LayoutInflater;
import android.view.View;
import android.view.Window;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** 账单拍照、语音记账：在用户点击时申请相机 / 相册 / 麦克风权限 */
@CapacitorPlugin(
        name = "KuaijiPermissions",
        permissions = {
            @Permission(strings = {Manifest.permission.CAMERA}, alias = "camera"),
            @Permission(
                    strings = {Manifest.permission.READ_MEDIA_IMAGES},
                    alias = "photos"),
            @Permission(
                    strings = {Manifest.permission.READ_EXTERNAL_STORAGE},
                    alias = "photosLegacy"),
            @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        })
public class KuaijiPermissionsPlugin extends Plugin {

    private static final String MIC_TITLE = "需要使用麦克风";
    private static final String MIC_MESSAGE = "需要根据说话录入，需要麦克风权限";

    private static final String CAMERA_TITLE = "需要使用相机";
    private static final String CAMERA_MESSAGE = "需要使用相机拍摄账单识别账单";

    private static final String PHOTOS_TITLE = "需要访问图库";
    private static final String PHOTOS_MESSAGE = "需要访问图库选择照片识别账单";

    private static final String CAMERA_PHOTOS_TITLE = "需要使用相机和图库";
    private static final String CAMERA_PHOTOS_MESSAGE =
            "需要使用相机拍摄账单识别账单；需要访问图库选择照片识别账单";

    private interface RationaleAction {
        void run();
    }

    /** 在系统授权弹窗前展示用途说明，与「允许/取消」合为一次应用内请求 */
    private void showPermissionRationale(
            int iconRes,
            String title,
            String message,
            RationaleAction onAllow,
            RationaleAction onDeny) {
        if (getActivity() == null) {
            onDeny.run();
            return;
        }
        getActivity()
                .runOnUiThread(
                        () -> {
                            View view =
                                    LayoutInflater.from(getActivity())
                                            .inflate(R.layout.dialog_permission_rationale, null);
                            ImageView icon = view.findViewById(R.id.permission_icon);
                            TextView titleView = view.findViewById(R.id.permission_title);
                            TextView messageView = view.findViewById(R.id.permission_message);
                            TextView btnCancel = view.findViewById(R.id.btn_permission_cancel);
                            TextView btnAllow = view.findViewById(R.id.btn_permission_allow);

                            icon.setImageResource(iconRes);
                            titleView.setText(title);
                            messageView.setText(message);

                            AlertDialog dialog =
                                    new AlertDialog.Builder(
                                                    getActivity(), R.style.KuaijiPermissionDialog)
                                            .setView(view)
                                            .setCancelable(false)
                                            .create();

                            btnCancel.setOnClickListener(
                                    v -> {
                                        dialog.dismiss();
                                        onDeny.run();
                                    });
                            btnAllow.setOnClickListener(
                                    v -> {
                                        dialog.dismiss();
                                        onAllow.run();
                                    });

                            dialog.show();
                            Window window = dialog.getWindow();
                            if (window != null) {
                                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                            }
                        });
    }

    /** 用户点「禁止」且不再询问时才算永久拒绝；返回/取消仍可再次申请 */
    private boolean isMicrophonePermanentlyDenied() {
        PermissionState state = getPermissionState("microphone");
        if (state == PermissionState.GRANTED || state == PermissionState.PROMPT) {
            return false;
        }
        return getActivity() == null
                || !ActivityCompat.shouldShowRequestPermissionRationale(
                        getActivity(), Manifest.permission.RECORD_AUDIO);
    }

    private JSObject microphoneStatusResult() {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean blocked = !granted && isMicrophonePermanentlyDenied();
        boolean canRequest = !granted && !blocked;

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("canRequest", canRequest);
        ret.put("blocked", blocked);
        return ret;
    }

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
        showPermissionRationale(
                R.drawable.ic_permission_camera,
                CAMERA_TITLE,
                CAMERA_MESSAGE,
                () -> requestPermissionForAlias("camera", call, "cameraCallback"),
                () -> {
                    JSObject ret = new JSObject();
                    ret.put("granted", false);
                    call.resolve(ret);
                });
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
        showPermissionRationale(
                R.drawable.ic_permission_photos,
                PHOTOS_TITLE,
                PHOTOS_MESSAGE,
                () -> requestPermissionForAlias(alias, call, "photosCallback"),
                () -> {
                    JSObject ret = new JSObject();
                    ret.put("granted", false);
                    call.resolve(ret);
                });
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

        final boolean needCamera = !cameraOk;
        final boolean needPhotos = !photosOk;
        final String title;
        final String message;
        final int iconRes;
        if (needCamera && needPhotos) {
            title = CAMERA_PHOTOS_TITLE;
            message = CAMERA_PHOTOS_MESSAGE;
            iconRes = R.drawable.ic_permission_camera_photos;
        } else if (needCamera) {
            title = CAMERA_TITLE;
            message = CAMERA_MESSAGE;
            iconRes = R.drawable.ic_permission_camera;
        } else {
            title = PHOTOS_TITLE;
            message = PHOTOS_MESSAGE;
            iconRes = R.drawable.ic_permission_photos;
        }

        java.util.ArrayList<String> aliases = new java.util.ArrayList<>();
        if (needCamera) aliases.add("camera");
        if (needPhotos) aliases.add(photos);

        showPermissionRationale(
                iconRes,
                title,
                message,
                () ->
                        requestPermissionForAliases(
                                aliases.toArray(new String[0]),
                                call,
                                "cameraAndPhotosCallback"),
                () ->
                        call.resolve(
                                combinedResult(
                                        getPermissionState("camera"),
                                        getPermissionState(photos))));
    }

    @PermissionCallback
    private void cameraAndPhotosCallback(PluginCall call) {
        String photos = photosAlias();
        call.resolve(
                combinedResult(
                        getPermissionState("camera"),
                        getPermissionState(photos)));
    }

    @PluginMethod
    public void getMicrophoneStatus(PluginCall call) {
        call.resolve(microphoneStatusResult());
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (isMicrophonePermanentlyDenied()) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("blocked", true);
            call.resolve(ret);
            return;
        }

        showPermissionRationale(
                R.drawable.ic_permission_mic,
                MIC_TITLE,
                MIC_MESSAGE,
                () -> requestPermissionForAlias("microphone", call, "microphoneCallback"),
                () -> {
                    JSObject ret = new JSObject();
                    ret.put("granted", false);
                    ret.put("blocked", false);
                    call.resolve(ret);
                });
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("blocked", !granted && isMicrophonePermanentlyDenied());
        call.resolve(ret);
    }
}
