package com.ledgernotes.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * 从应用缓存目录安装已下载的 APK（需 FileProvider 与 REQUEST_INSTALL_PACKAGES）。
 */
@CapacitorPlugin(name = "InstallApk")
public class InstallApkPlugin extends Plugin {

    @PluginMethod
    public void installFromCache(PluginCall call) {
        String filename = call.getString("filename", "kuaiji-update.apk");
        if (getActivity() == null) {
            call.reject("NO_ACTIVITY");
            return;
        }
        File apk = new File(getActivity().getCacheDir(), filename);
        if (!apk.exists() || !apk.isFile()) {
            call.reject("APK_NOT_FOUND", "APK 文件不存在，请重新下载", null);
            return;
        }
        String authority = getContext().getPackageName() + ".fileprovider";
        Uri uri = FileProvider.getUriForFile(getContext(), authority, apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(
                    "INSTALL_INTENT_FAILED",
                    e.getMessage() != null ? e.getMessage() : "无法打开安装界面",
                    null
            );
        }
    }
}
