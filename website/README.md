# 记账本 · 官网（下载页）

极简静态站 + Nginx + 可选上传服务，色调与 App（stone 中性色）一致。

## 启动

```bash
cd website
cp .env.example .env
# 编辑 .env：设置 UPLOAD_TOKEN（足够长的随机串），否则网页内上传不可用
docker compose up -d --build
```

浏览器访问：`http://<服务器IP>:8080`（端口用 `.env` 里 `WEB_PORT`，默认 `8080`）。

## 网页内上传 APK

1. 在 **`website/.env`** 中设置 **`UPLOAD_TOKEN`**，与页面上填的「上传令牌」一致。
2. 打开首页，展开 **「上传新版本 APK」**，选择 APK、填写版本号等，提交。
3. 服务会把文件写入 **`downloads/`**，并把条目插入 **`public/releases.json`** 最前。

限制：单文件最大 **200MB**；仅接受扩展名为 **`.apk`** 的文件名（服务端会校验）。

也可使用 HTTP 头：`Authorization: Bearer <UPLOAD_TOKEN>` 调用 `POST /api/upload`（multipart）。

## 手动发布（不上传服务）

1. 将 APK 放到 **`downloads/`**。
2. 编辑 **`public/releases.json`**，在 `items` 数组靠前位置增加一条（展示顺序从上到下）。

## 目录说明

| 路径 | 作用 |
|------|------|
| `public/` | 首页、`releases.json`、静态资源 |
| `downloads/` | APK 文件（默认不提交到 Git） |
| `nginx/default.conf` | Nginx；`/api/` 反代到 `uploader`；`/downloads/` 走只读挂载 |
| `uploader/` | Node 上传服务镜像构建上下文 |

`public` 对 Nginx 只读挂载；`downloads` 单独挂到 `/var/www/downloads`，避免只读冲突。上传服务对 `public`、`downloads` 读写挂载以更新 `releases.json` 与保存 APK。

## 与主项目关系

本目录独立部署，不参与账本 API；仅提供安装包下载与发布入口。
