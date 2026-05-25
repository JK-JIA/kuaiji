# kuaiji · 官网（https://kuaijipf.com/）

kuaiji 官方下载站：对外展示产品介绍，**仅提供最新版 APK** 下载；右上角 **管理员登录** 可发布安装包并查看业务数据（用户数、购买记录、会员有效期）。

## 启动

```bash
cd website
cp .env.example .env
# 编辑 .env：UPLOAD_TOKEN、LEDGER_API_URL、LEDGER_ADMIN_TOKEN
docker compose up -d --build
```

在 **ledger-api**（`kuaiji/server` 或项目根 `docker-compose` 的 `api` 环境）中增加 **`WEBSITE_ADMIN_TOKEN`**，值与 website 的 **`LEDGER_ADMIN_TOKEN`** 相同。二者缺一，管理后台「数据概览 / 购买记录 / 会员」会显示配置说明而无法拉数。

同机部署时 `LEDGER_API_URL` 可用 `http://127.0.0.1:3001`；改 env 后需 `docker compose up -d --build api` 与 `cd website && docker compose up -d --build uploader`。

浏览器访问：`http://<服务器IP>:8080`（`WEB_PORT` 默认 8080）。

## 页面

| 路径 | 说明 |
|------|------|
| `/` | 官网首页（基于 landing 设计），`#download` 仅链接 **releases.json 第一条带 `file` 的 APK** |
| `/admin.html` | 管理后台：登录 → 发布 APK / 数据概览 / 购买记录 / 会员列表 |
| `/privacy.html` `/terms.html` | 协议页 |

## 管理后台

1. **`UPLOAD_TOKEN`**：登录与上传鉴权。
2. **`LEDGER_API_URL`** + **`LEDGER_ADMIN_TOKEN`**：代理请求 ledger-api `GET /api/site-admin/overview`（需在 ledger 配置 **`WEBSITE_ADMIN_TOKEN`**）。

登录后可：

- **发布 APK**：写入 `downloads/` 并插入 `releases.json` 首位（官网只展示最新 APK）。
- **数据概览 / 购买记录 / 会员有效期**：来自业务 API（需上述环境变量）。

## API

- `GET /api/health` — `uploadEnabled`、`statsEnabled`
- `POST /api/auth/login` — `{ "token": "…" }`
- `POST /api/upload` — multipart，`file`（.apk）、`version`、可选 `versionCode`、`notes`；`Authorization: Bearer <UPLOAD_TOKEN>`
- `GET /api/admin/overview` — 需 Bearer，返回用户数、账本数、会员与订单列表（代理 ledger-api）

ledger-api 新增：

- `GET /api/site-admin/overview` — `Authorization: Bearer <WEBSITE_ADMIN_TOKEN>`

## 手动发布

1. APK 放入 **`downloads/`**。
2. 在 **`public/releases.json`** 的 `items` **最前面** 增加一条（含 `file` 字段）。

## 目录

| 路径 | 作用 |
|------|------|
| `public/` | 首页、管理页、`releases.json`、`assets/` |
| `downloads/` | APK（不提交 Git） |
| `nginx/` | 静态站 + `/api/` 反代 + `/downloads/` |
| `uploader/` | 上传与统计代理服务 |

## 部署提示

更新代码后执行 **`docker compose up -d --build`**。若仅改静态页，重启 `web` 即可；若改 `uploader/server.mjs` 或 ledger-api，需重建对应服务。
