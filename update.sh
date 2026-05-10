#!/usr/bin/env bash
# 在仓库根目录执行：拉取最新代码并重建、启动 Docker Compose（db / api / redeem-daily）
# 用法：chmod +x update.sh && ./update.sh
# 依赖：git、docker（Compose V2：docker compose）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "[kuaiji-update] repo: $ROOT"
echo "[kuaiji-update] git pull..."
git pull

echo "[kuaiji-update] docker compose up -d --build..."
docker compose up -d --build --remove-orphans

echo "[kuaiji-update] running containers:"
docker compose ps

echo "[kuaiji-update] done."
