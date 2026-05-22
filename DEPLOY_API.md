# 生产 API 更新（解决 HTTP 404）

App 默认请求：`http://8.153.12.131:3001`

若一键登录报 **HTTP 404**，说明该机器上的 API 容器仍是旧版本，**没有** `POST /auth/oneclick/login`。

## 在服务器上执行（仓库根目录 `kuaiji`）

```bash
chmod +x update.sh
./update.sh
```

或手动：

```bash
git pull
docker compose up -d --build
```

## 验证是否更新成功

```bash
curl -s http://127.0.0.1:3001/health
```

应包含：

```json
{"ok":true,"smsLogin":true,"oneClickLogin":true}
```

再测一键登录接口（应返回 400，而不是 404）：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3001/auth/oneclick/login \
  -H "Content-Type: application/json" -d '{"accessToken":"test"}'
```

输出 `400` 表示路由已存在；`404` 表示仍需重建 API 镜像。

## 环境变量

`docker-compose.yml` 中需配置（与短信共用）：

- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`

可在服务器 `kuaiji/.env` 中写入后重新 `docker compose up -d --build`。
