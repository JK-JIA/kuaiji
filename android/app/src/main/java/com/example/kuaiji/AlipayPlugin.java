package com.example.kuaiji;

import android.app.Activity;
import com.alipay.sdk.app.PayTask;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;

/** 支付宝 APP 支付（沙箱/正式均通过 orderString 唤起） */
@CapacitorPlugin(name = "AlipayPay")
public class AlipayPlugin extends Plugin {

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

        new Thread(
                        () -> {
                            PayTask payTask = new PayTask(activity);
                            Map<String, String> result =
                                    payTask.payV2(orderString.trim(), useSandbox);
                            activity.runOnUiThread(
                                    () -> {
                                        JSObject ret = new JSObject();
                                        ret.put(
                                                "resultStatus",
                                                result.get("resultStatus") != null
                                                        ? result.get("resultStatus")
                                                        : "");
                                        ret.put(
                                                "memo",
                                                result.get("memo") != null
                                                        ? result.get("memo")
                                                        : "");
                                        ret.put(
                                                "result",
                                                result.get("result") != null
                                                        ? result.get("result")
                                                        : "");
                                        call.resolve(ret);
                                    });
                        })
                .start();
    }
}
