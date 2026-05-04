# 批发记账（个人账本）

**正式使用：Android APK + 后端（PostgreSQL）**；已登录时数据在服务器。项目不提供对外网页版：用 `npm run build` 得到的静态资源若用浏览器直接打开，只会看到「请使用 Android 应用」的提示。本地开发请用 `npm run dev`；若必须浏览器里调试生产包，构建前在 `.env` 中设置 `VITE_ALLOW_BROWSER=true`（勿用于公网站点）。

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

## 后端与数据

后端见仓库根目录 `docker-compose.yml`（PostgreSQL + API）。打 APK 前复制 `.env.example` 为 `.env`，配置 `VITE_API_URL` 指向你的 API（示例见 `.env.example`），再执行 `npm run build` 与 `npx cap sync`。登录后账本读写走服务端。

## 豆包智能解析

配置 API Key 与说明见 [DOUBAO_SETUP.md](./DOUBAO_SETUP.md)。
