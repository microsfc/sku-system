#!/usr/bin/env bash
# ===============================================================
#  IT 料號管理系統 — Git 初始化 + 推送至 GitHub 一鍵腳本 (Linux/macOS)
#  Usage:
#    ./setup-git.sh                      僅做本地 git init + commit
#    ./setup-git.sh <GitHub-Repo-URL>    初始化並推送至 GitHub
# ===============================================================
set -e

cd "$(dirname "$0")"

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  IT 代理商料號管理系統 — Git 初始化                         │"
echo "└─────────────────────────────────────────────────────────────┘"

if [ -d .git ]; then
  echo "[清理] 移除先前的 .git ..."
  rm -rf .git
fi

echo "[1/4] git init"
git init -b main

echo "[2/4] git add"
git add .

echo "[3/4] git commit"
git -c user.email="microsfc@gmail.com" -c user.name="Sean" \
    commit -m "Initial commit: IT 代理商料號管理系統 (Angular + Node.js + SQLite)"

if [ -z "$1" ]; then
  echo
  echo "[完成] 已建立本地 Repo。如要推送請執行:"
  echo "  ./setup-git.sh https://github.com/<account>/<repo>.git"
  exit 0
fi

echo "[4/4] git remote add + push"
git remote add origin "$1"
git push -u origin main
echo "[成功] 已推送至 $1"
