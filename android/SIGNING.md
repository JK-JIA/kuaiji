# Android 应用包名与签名

第三方平台（支付宝、阿里云号码认证等）会校验 **同一套 APK 签名证书**。包名与签名必须与**实际安装到手机上的 APK** 一致，否则支付、一键登录等会失败。

> 获取方式：安装 APK 到手机 → 使用 [GenSignature.apk](https://opendocs.alipay.com/open/215/105104)（支付宝文档附带）→ 输入包名 → 复制签名。  
> 参考：[应用平台信息如何配置（Android 版）](https://opendocs.alipay.com/support/01rgk5)

---

## 当前应用（已实测）

| 项目 | 值 |
|------|-----|
| **应用包名** | `com.example.kuaiji` |
| **应用签名 MD5**（支付宝等） | `f3dcc304f480fafd4e6010590a535425` |

- 包名来源：`android/app/build.gradle` → `applicationId`，与 `capacitor.config.ts` → `appId` 一致。
- 签名来源：GenSignature 对**已安装 APK** 读取，2026-05-24 实测。

---

## 支付宝 vs 阿里云：为什么「看起来一样」？

两者校验的是**同一张签名证书**，只是**展示格式不同**：

| 平台 | 用途 | 签名格式 | 本应用填写 |
|------|------|----------|------------|
| **支付宝** | APP 支付、分享到支付宝 | **MD5**，32 位小写十六进制，无冒号 | `f3dcc304f480fafd4e6010590a535425` |
| **阿里云号码认证** | 本机号码一键登录 | **SHA1**，带冒号的大写十六进制 | 见下方说明 |

因此：

- **不是两个不同的签名**，而是同一张证书的两种哈希表示。
- 支付宝控制台填 **MD5**；阿里云控制台填 **SHA1**（字符串不同，绑定的是同一证书）。
- 务必用 GenSignature 对**同一 APK** 取 MD5；阿里云 SHA1 需对**同一 keystore / 同一 APK** 用 `keytool` 导出，勿混用另一台电脑的 debug 证书。

### 阿里云一键登录（SHA1）

在阿里云控制台 → 号码认证 → 方案管理 → Android 方案中填写：

- 包名：`com.example.kuaiji`
- 签名：**SHA1**（与上表 MD5 对应同一张证书，格式示例：`AA:BB:CC:...`）

若仅在本机 debug 打包，可用（证书路径因机器而异）：

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

查看输出中的 `SHA1:` 行。**换电脑或换 keystore 后 SHA1 / MD5 都会变，需同步更新各平台配置。**

---

## 其他配置关联

| 配置项 | 位置 |
|--------|------|
| 阿里云方案密钥 | `android/local.properties` → `ALIYUN_AUTH_SECRET`（勿提交 Git） |
| 服务端取号 | 项目根 `.env` → `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` |

---

## 注意事项

1. **以手机已装 APK 为准**：GenSignature 结果优先于本机 `keytool`（不同机器 debug 证书可能不同）。
2. **换签名证书必改配置**：上架若改用正式 keystore，需更新支付宝 MD5、阿里云 SHA1，并重新创建/更新方案。
3. **Release 当前策略**：`android/app/build.gradle` 中 release 暂用 `signingConfigs.debug`，与 debug 包签名相同；上线前建议配置正式 upload keystore。
