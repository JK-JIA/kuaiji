# 批发记账（个人账本）

React + Vite + Dexie（IndexedDB）本地记账；可选 Capacitor 打包 Android。

## 开发

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Android（Capacitor）

改完网页代码后**必须先编译并把最新页面拷进工程**，再打 APK，否则会一直用手机里旧的 HTML/JS（界面会像「只有勾选、没有金额框」这种老版本）。

```bash
npm run build
npx cap sync android
```

再用 Android Studio 打开 `android` 目录打安装包。若仍像旧版：先**卸载**手机上的旧应用再装（或提高 `versionCode`），避免 WebView 强缓存。

`npm run cap:android` 等同于 `build` + `cap sync` + 打开 Android Studio，一般改 UI 后走这一条即可。

记一笔里的语音录入请使用**系统输入法自带的语音**（话筒键），无需应用麦克风权限。

## 豆包智能解析

配置 API Key 与说明见 [DOUBAO_SETUP.md](./DOUBAO_SETUP.md)。
