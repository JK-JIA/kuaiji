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
3. 登录后出现 **版本管理**：可**连续上传**多个 **APK（整包安装）** 或 **zip（网页热更新）**；下方 **版本列表** 中每条在登录状态下显示 **删除**（同步更新 `releases.json` 并删除 `downloads/` 中对应文件）。
4. **退出登录** 后访客仅可下载，看不到删除按钮，也无法调用需鉴权的接口。

限制：单文件最大 **200MB**；上传接口接受 **`.apk`** 与 **`.zip`**（由扩展名自动识别：apk 写入 `file` 字段，zip 写入 `bundle` 等字段，与 App 端逻辑一致）。

API 摘要：

- `POST /api/auth/login` — JSON `{ "token": "…" }` 校验令牌。
- `POST /api/upload` — `multipart/form-data`，字段 **`file`**（安装包），**`version`**（必填），可选 **`date`**、**`channel`**、**`notes`**、**`versionCode`**（仅 apk，写入 `releases.json` 的 `versionCode`）、**`bundleVersion`** / **`minNativeVersionCode`**（仅 zip）。头 `Authorization: Bearer <UPLOAD_TOKEN>`。响应含 **`kind`**: `"apk"` | `"zip"`。
- `POST /api/release/delete` — JSON **`{ "target": "xxx.apk" }`** 或 **`{ "target": "xxx.zip" }`**（兼容旧字段 **`file`** / **`bundle`**）。头 `Authorization: Bearer <UPLOAD_TOKEN>`。

## 手动发布（不上传服务）

1. 将 APK 放到 **`downloads/`**。
2. 编辑 **`public/releases.json`**，在 `items` 数组靠前位置增加一条（展示顺序从上到下）。

### 热更新（网页包，无需重装 APK）

自 **1.0.38** 起，App 内置 Capgo 热更新：用户只需下载 **zip 网页包** 并重启即可，**不会清空本地数据与登录状态**；仅当修改了原生层（新插件、Android 权限等）时才需要发布整包 APK。

1. 在**主项目**根目录执行 **`npm run bundle:ota`**（会先 `vite build`，再生成 zip；默认输出形如 **`com.ledgernotes.app_<版本>.zip`**，见终端提示）。
2. 将该 zip 上传到服务器的 **`downloads/`**：可在**管理后台**直接上传 zip，或通过 SFTP/手动放入（与 APK 同目录）。
3. 若不用管理后台，可在 **`releases.json`** 首条中增加字段，例如：

```json
{
  "version": "1.0.40",
  "versionCode": 38,
  "bundle": "com.ledgernotes.app_1.0.40.zip",
  "bundleVersion": "1.0.40",
  "minNativeVersionCode": 38,
  "file": "ledger-1.0.38.apk",
  "notes": "修统计；热更"
}
```

| 字段 | 说明 |
|------|------|
| `bundle` | 热更新 zip 在 `downloads/` 下的文件名（必填才走热更）。 |
| `bundleVersion` | 可选；与本地网页包比 semver，默认用 `version`。 |
| `minNativeVersionCode` | 可选；用户当前 **versionCode** 低于此值时**只提示整包 APK**，忽略热更。 |
| `file` | 可选；整包 APK；可与 `bundle` 并存，壳过旧时仍走 APK。 |

仅发小版本时，可只填 `bundle` + `version` / `bundleVersion`，不必每次上传 APK。

## 目录说明

| 路径 | 作用 |
|------|------|
| `public/` | 首页、`releases.json`、静态资源 |
| `downloads/` | APK / zip 热更包（默认不提交到 Git） |
| `nginx/default.conf` | Nginx；`/api/` 反代到 `uploader`；`/downloads/` 走只读挂载 |
| `uploader/` | Node 上传服务镜像构建上下文 |

`public` 对 Nginx 只读挂载；`downloads` 单独挂到 `/var/www/downloads`，避免只读冲突。上传服务对 `public`、`downloads` 读写挂载以更新 `releases.json` 并保存 **APK 与 zip**。

## 与主项目关系

本目录独立部署，不参与账本 API；仅提供安装包下载与发布入口。
