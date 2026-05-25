package com.example.kuaiji;

import android.app.Activity;
import android.util.Log;
import com.alipay.sdk.app.PayTask;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 支付宝 APP 支付（沙箱/正式均通过 orderString 唤起） */
@CapacitorPlugin(name = "AlipayPay")
public class AlipayPlugin extends Plugin {

    private static final String TAG = "KuaijiAlipayPay";

    @PluginMethod
    public void pay(PluginCall call) {
        String orderString = call.getString("orderString");
        if (orderString == null || orderString.trim().isEmpty()) {
            call.reject("INVALID_ORDER", "缺少 orderString");
            return;
        }
        Boolean sandbox = call.getBoolean("sandbox", true);
        final boolean useSandbox = sandbox == null || sandbox;
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY");
            return;
        }

        final String trimmed = orderString.trim();
        final List<String> debugLines = new ArrayList<>();
        debugLines.add("payV2 sandbox=" + useSandbox);
        debugLines.add("orderString.len=" + trimmed.length());
        debugLines.add("orderString.head=" + head(trimmed, 160));
        logAppIdFromOrderString(trimmed, debugLines);

        new Thread(
                        () -> {
                            try {
                                PayTask payTask = new PayTask(activity);
                                Map<String, String> result =
                                        payTask.payV2(trimmed, useSandbox);
                                activity.runOnUiThread(
                                        () -> {
                                            String status =
                                                    result.get("resultStatus") != null
                                                            ? result.get("resultStatus")
                                                            : "";
                                            String memo =
                                                    result.get("memo") != null
                                                            ? result.get("memo")
                                                            : "";
                                            String rawResult =
                                                    result.get("result") != null
                                                            ? result.get("result")
                                                            : "";
                                            debugLines.add(
                                                    "resultStatus="
                                                            + status
                                                            + " memo="
                                                            + memo);
                                            if (rawResult != null && !rawResult.isEmpty()) {
                                                debugLines.add(
                                                        "result="
                                                                + head(rawResult, 240));
                                            }
                                            String debugLog = joinLines(debugLines);
                                            Log.i(TAG, debugLog);

                                            JSObject ret = new JSObject();
                                            ret.put("resultStatus", status);
                                            ret.put("memo", memo);
                                            ret.put("result", rawResult);
                                            ret.put("debugLog", debugLog);
                                            call.resolve(ret);
                                        });
                            } catch (Exception e) {
                                debugLines.add("exception=" + e.getClass().getName());
                                debugLines.add("message=" + String.valueOf(e.getMessage()));
                                String debugLog = joinLines(debugLines);
                                Log.e(TAG, debugLog, e);
                                activity.runOnUiThread(
                                        () -> {
                                            JSObject err = new JSObject();
                                            err.put("debugLog", debugLog);
                                            call.reject(
                                                    "PAY_EXCEPTION",
                                                    e.getMessage() != null
                                                            ? e.getMessage()
                                                            : e.getClass().getSimpleName(),
                                                    err);
                                        });
                            }
                        })
                .start();
    }

    private static String head(String s, int max) {
        if (s == null) return "";
        if (s.length() <= max) return s;
        return s.substring(0, max) + "…";
    }

    private static String joinLines(List<String> lines) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(lines.get(i));
        }
        return sb.toString();
    }

    private static void logAppIdFromOrderString(String orderString, List<String> debugLines) {
        try {
            String[] parts = orderString.split("&");
            for (String part : parts) {
                if (part.startsWith("app_id=")) {
                    debugLines.add("orderString." + part);
                    Log.i(TAG, part);
                    return;
                }
            }
            debugLines.add("orderString.app_id=NOT_FOUND");
        } catch (Exception e) {
            debugLines.add("parse app_id failed: " + e.getMessage());
        }
    }
}
