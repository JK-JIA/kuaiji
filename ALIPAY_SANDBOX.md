# 支付宝沙箱 · 会员支付联调

正式收款需个体工商户/企业资质并开通正式 APP 支付。开发阶段使用[沙箱环境](https://opendocs.alipay.com/open/00dn7d?pathHash=f5e7ce65)联调。

## 1. 服务端 `.env` 配置

在项目根目录 `.env`（勿提交 Git）写入沙箱参数：

```env
ALIPAY_SANDBOX=true
ALIPAY_APP_ID=9021000164606067
ALIPAY_PRIVATE_KEY=沙箱应用私钥整段
ALIPAY_PUBLIC_KEY=沙箱支付宝公钥整段
ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_NOTIFY_URL=https://kuaijipf.com/api/payment/alipay/notify
```

密钥在开放平台 → **沙箱应用** → 开发信息 → **系统默认密钥** 中获取。

部署后重启 API：

```bash
docker compose up -d --build
```

验证：

```bash
curl -s http://127.0.0.1:3001/health
```

应包含 `"alipayPay":true,"alipaySandbox":true`。

## 2. 手机端：安装沙箱支付宝

1. 打开 [沙箱调试说明](https://opendocs.alipay.com/open/00dn7d?pathHash=f5e7ce65)
2. 下载并安装 **支付宝沙箱版** App（Android）
3. 在沙箱控制台获取 **沙箱买家账号** 与登录密码

## 3. 打包 Android 并测试

```bash
npm run build
npx cap sync android
# Android Studio 或 gradlew assembleDebug 安装到手机
```

App 内：**设置 → 升级专业版**，应看到三档支付宝购买：

| 套餐 | 价格 |
|------|------|
| 1个月 | ¥29.90 |
| 3个月 | ¥79.90 |
| 1年 | ¥299.00 |

支付流程：创建订单 → 唤起沙箱支付宝 → 沙箱买家账号付款 → 服务端开通会员。

## 4. 异步通知

`ALIPAY_NOTIFY_URL` 须公网 HTTPS 可达。沙箱也会 POST 到该地址；若本地联调可先依赖 App 内 **查单接口**（`/api/membership/purchase/status`）确认支付。

确保 `https://kuaijipf.com` 反代到 ledger-api 的 `/api/payment/alipay/notify`。

## 5. 切换正式环境

个体户执照下来、正式 APP 支付签约完成后：

```env
ALIPAY_SANDBOX=false
ALIPAY_APP_ID=正式应用APPID
ALIPAY_PRIVATE_KEY=正式应用私钥
ALIPAY_PUBLIC_KEY=正式支付宝公钥
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
```

应用需 **已上线**，且包名/签名与控制台一致（见 [android/SIGNING.md](./android/SIGNING.md)）。
