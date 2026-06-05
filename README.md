# 批发记账（个人账本）

此软件专注于为市场批发人员快捷记账核账，数据提供持久化存储，支持语音输入，ai自动识别记账，数据统计展示等功能

**正式使用：Android APK + 后端（MySQL）**；已登录时数据在服务器。项目不提供对外网页版：用 `npm run build` 得到的静态资源若用浏览器直接打开，只会看到「请使用 Android 应用」的提示。本地开发请用 `npm run dev`；若必须浏览器里调试生产包，构建前在 `.env` 中设置 `VITE_ALLOW_BROWSER=true`（勿用于公网站点）。

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

若 API 使用 **HTTP（非 HTTPS）**：`AndroidManifest.xml` 已开启 `usesCleartextTraffic`；`MainActivity` 中对 WebView 设置 `MIXED_CONTENT_ALWAYS_ALLOW`，否则在 **https://localhost** 页面里请求 `http://` 接口仍会被 WebView 拦截，表现为 `Failed to fetch`。生产环境建议为 API 配置 TLS。

**v1.0.4**：纯手动录入；设置页**账号密码登录**云端（需配置 `VITE_API_URL` 与自建后端）。不含应用内语音输入；若需豆包等扩展见 [DOUBAO_SETUP.md](./DOUBAO_SETUP.md)。

GitHub Release 说明草稿见 [RELEASE_NOTES_1.0.4.md](./RELEASE_NOTES_1.0.4.md)（发布时可复制到 Release 正文）。

## 后端与数据

根目录 `docker-compose.yml` 使用 **DaoCloud 镜像代理** 拉取 **MySQL 8** 与自构建 API，一条命令启动数据库与接口：

```bash
docker compose up -d --build
```

部署示例对外地址：**http://8.153.12.131:3001**（端口 `3001`）。首次启动后 API 会写入默认账号：**用户名 `admin`，密码 `123456`**（存于用户表的 `email` 字段，在设置页登录时「账号」填 `admin` 即可）。生产环境请尽快修改密码或新建账号，并修改 `JWT_SECRET` 与 MySQL `MYSQL_ROOT_PASSWORD`。

打 APK 前复制 `.env.example` 为 `.env`，确认 `VITE_API_URL` 指向你的 API（示例已填公网地址），再执行 `npm run build` 与 `npx cap sync`。新用户可在设置页使用「注册」并填写有效邮箱。

本地仅跑后端时，复制 `server/.env.example` 为 `server/.env`，将 `DATABASE_URL` 指向本机或容器内的 MySQL。在 `server` 目录先 `npm install`，再执行 **`npm run prisma:migrate`**（勿用裸 `npx prisma`，否则会拉到 Prisma 7 与项目 6.x 不兼容），然后 `npm run dev`。

## 豆包（可选）

仓库内仍保留豆包解析相关工具代码，当前 App 界面已关闭对应入口。若需自行接入，可参考 [DOUBAO_SETUP.md](./DOUBAO_SETUP.md)。

## 官网（APK 下载页）

独立目录 **[website](./website/)**：`docker compose` + Nginx + 管理后台；配置 `UPLOAD_TOKEN` 后可在页内登录并上传/删除版本。说明见 [website/README.md](./website/README.md)。
