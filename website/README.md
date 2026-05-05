# 记账本 · 官网（下载页）

极简静态站 + Nginx，色调与 App（stone 中性色）一致。用于对外提供各版本 APK 下载。

## 启动

```bash
cd website
docker compose up -d
```

浏览器访问：`http://<服务器IP>:8080`（默认端口可在同目录创建 `.env` 写入 `WEB_PORT=80` 后重启）。

## 发布新版本

1. 将 APK 复制到本目录 **`downloads/`**（文件名与 JSON 里一致，建议 `kuaiji-v1.x.x.apk`）。
2. 编辑 **`public/releases.json`**，在 `items` 数组**靠前位置**插入新版本（页面按数组顺序从上到下展示）：

```json
{
  "version": "1.0.5",
  "file": "kuaiji-v1.0.5.apk",
  "date": "2026-05-06",
  "channel": "debug",
  "notes": "可选：更新说明"
}
```

3. 无需重建镜像；若已运行 `docker compose up -d`，改完文件后刷新网页即可（必要时强刷或清缓存）。

## 目录说明

| 路径 | 作用 |
|------|------|
| `public/` | 首页、`releases.json`、样式与脚本 |
| `downloads/` | 实际 APK 文件（默认不提交到 Git） |
| `nginx/default.conf` | Nginx 配置；APK 在容器内路径为 `/var/www/downloads`，对外 URL 仍为 `/downloads/` |

说明：`public` 以只读方式挂载时，不能把 `downloads` 再挂到其子目录，否则会报 read-only file system；因此 compose 将 `downloads/` 单独挂载到 `/var/www/downloads`。

## 与主项目关系

本目录独立部署，不参与账本 API；仅提供安装包下载入口。
