package com.example.kuaiji;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
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
            call.reject("APK_NOT_FOUND", "APK 文件不存在，请重新下载");
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        PackageInfo archiveInfo = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (archiveInfo == null) {
            call.reject("APK_INVALID", "下载的安装包无效，请重新下载");
            return;
        }
        if (archiveInfo.applicationInfo != null) {
            archiveInfo.applicationInfo.sourceDir = apk.getAbsolutePath();
            archiveInfo.applicationInfo.publicSourceDir = apk.getAbsolutePath();
        }

        long incomingCode = archiveInfoVersionCode(archiveInfo);
        String incomingName = archiveInfo.versionName != null ? archiveInfo.versionName : "";
        String packageName = getContext().getPackageName();
        if (!packageName.equals(archiveInfo.packageName)) {
            call.reject(
                    "APK_PACKAGE_MISMATCH",
                    "安装包与当前应用不匹配，请勿安装来路不明的文件"
            );
            return;
        }

        try {
            PackageInfo installed = pm.getPackageInfo(packageName, 0);
            long installedCode = archiveInfoVersionCode(installed);
            String installedName =
                    installed.versionName != null ? installed.versionName : "";
            if (incomingCode <= installedCode) {
                call.reject(
                        "APK_NOT_NEWER",
                        "下载的安装包版本为 "
                                + incomingName
                                + "（versionCode "
                                + incomingCode
                                + "），与已安装的 "
                                + installedName
                                + "（versionCode "
                                + installedCode
                                + "）相同或更旧。"
                                + " 请确认下载站 APK 与 releases.json 版本号一致，或重新上传正确的安装包。"
                );
                return;
            }
        } catch (PackageManager.NameNotFoundException e) {
            /* 首次安装，继续 */
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
                    e.getMessage() != null ? e.getMessage() : "无法打开安装界面"
            );
        }
    }

    private static long archiveInfoVersionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }
}
