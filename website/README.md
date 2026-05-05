# 记账本 · 官网（下载页）

极简静态站 + Nginx + 可选上传服务，色调与 App（stone 中性色）一致。

## 启动

```bash
cd website
cp .env.example .env
# 编辑 .env：设置 UPLOAD_TOKEN（足够长的随机串），否则网页内上传不可用
docker compose up -d --build
```

更新代码后务必带 **`--build`** 重建 `uploader` 镜像，否则浏览器里仍可能是旧接口（例如删除报 HTTP 404）。

浏览器访问：`http://<服务器IP>:8080`（端口用 `.env` 里 `WEB_PORT`，默认 `8080`）。

### 登录或上传接口返回 404

1. 在服务器 **`website`** 目录执行 **`git pull`** 后 **`docker compose up -d --build`**（同时重建 `uploader` 并重启 `web`，使 Nginx 加载含 **`location ^~ /api/`** 的配置）。
2. 宿主机自检：  
   `curl -sS http://127.0.0.1:8080/api/health`  
   应返回 JSON（含 `uploadEnabled`）。若此处 404，说明 **Nginx 未把 `/api/` 转到 uploader** 或端口不是 compose 映射端口。
3. 容器内自检（uploader 是否监听）：  
   `docker compose exec uploader node -e "fetch('http://127.0.0.1:3005/api/health').then(r=>r.text()).then(console.log)"`  
   应打印 JSON；若失败，检查 **`docker compose ps`** 中 `uploader` 是否 **Up**。

## 管理后台（登录后上传 / 删除）

1. 在 **`website/.env`** 中设置 **`UPLOAD_TOKEN`**。
2. 打开首页 → **管理后台** → 输入令牌 → **登录**（令牌保存在浏览器 `sessionStorage`，关闭浏览器后需重新登录）。
3. 登录后出现 **版本管理**：可**连续上传**多个 APK；下方 **版本列表** 中每条在登录状态下显示 **删除**（同步更新 `releases.json` 并删除 `downloads/` 中文件）。
4. **退出登录** 后访客仅可下载，看不到删除按钮，也无法调用需鉴权的接口。

限制：单文件最大 **200MB**；仅接受扩展名为 **`.apk`** 的文件名。

API 摘要：

- `POST /api/auth/login` — JSON `{ "token": "…" }` 校验令牌。
- `POST /api/upload` — `multipart/form-data`，头 `Authorization: Bearer <UPLOAD_TOKEN>`。
- `POST /api/release/delete` — JSON `{ "file": "xxx.apk" }`，头 `Authorization: Bearer <UPLOAD_TOKEN>`。

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
