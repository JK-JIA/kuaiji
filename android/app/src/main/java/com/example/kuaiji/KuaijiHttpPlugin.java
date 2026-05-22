package com.example.kuaiji;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 绕过 WebView 对 https→http 混合内容与部分 CORS 限制，用于拉取 releases.json 与 APK。
 */
@CapacitorPlugin(name = "KuaijiHttp")
public class KuaijiHttpPlugin extends Plugin {

    private static final int CONNECT_MS = 15000;
    private static final int READ_MS = 120000;
    private static final int MAX_TEXT_BYTES = 2 * 1024 * 1024;

    @PluginMethod
    public void getText(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("BAD_URL");
            return;
        }
        new Thread(
                () -> {
                    try {
                        String body = httpGetString(urlStr);
                        JSObject ret = new JSObject();
                        ret.put("body", body);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject(
                                "HTTP_GET_FAILED",
                                e.getMessage() != null ? e.getMessage() : "请求失败"
                        );
                    }
                })
                .start();
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String urlStr = call.getString("url");
        String filename = call.getString("filename", "kuaiji-latest.apk");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("BAD_URL");
            return;
        }
        if (getActivity() == null) {
            call.reject("NO_ACTIVITY");
            return;
        }
        new Thread(
                () -> {
                    try {
                        java.io.File out =
                                new java.io.File(getActivity().getCacheDir(), filename);
                        httpDownloadToFile(urlStr, out);
                        JSObject ret = new JSObject();
                        ret.put("path", out.getAbsolutePath());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject(
                                "HTTP_DOWNLOAD_FAILED",
                                e.getMessage() != null ? e.getMessage() : "下载失败"
                        );
                    }
                })
                .start();
    }

    private static String httpGetString(String urlStr) throws Exception {
        HttpURLConnection conn = openConnection(urlStr);
        conn.setRequestMethod("GET");
        int code = conn.getResponseCode();
        InputStream raw =
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
        if (raw == null) {
            conn.disconnect();
            throw new Exception("HTTP " + code);
        }
        try (InputStream in = new BufferedInputStream(raw);
                ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            int total = 0;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_TEXT_BYTES) {
                    throw new Exception("响应过大");
                }
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8.name());
        } finally {
            conn.disconnect();
        }
    }

    private static void httpDownloadToFile(String urlStr, java.io.File out) throws Exception {
        HttpURLConnection conn = openConnection(urlStr);
        conn.setRequestMethod("GET");
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            conn.disconnect();
            throw new Exception("HTTP " + code);
        }
        try (InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream fos = new FileOutputStream(out)) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) != -1) {
                fos.write(buf, 0, n);
            }
        } finally {
            conn.disconnect();
        }
    }

    private static HttpURLConnection openConnection(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(CONNECT_MS);
        conn.setReadTimeout(READ_MS);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "*/*");
        return conn;
    }
}
