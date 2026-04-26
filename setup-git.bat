@echo off
chcp 65001 >nul
REM ===============================================================
REM  IT 料號管理系統 — Git 初始化 + 推送至 GitHub 一鍵腳本 (Windows)
REM  Usage:
REM    setup-git.bat                     僅做本地 git init + commit
REM    setup-git.bat <GitHub-Repo-URL>   初始化並推送至指定 Repo
REM  Example:
REM    setup-git.bat https://github.com/microsfc/it-parts-system.git
REM ===============================================================

setlocal

echo.
echo ┌─────────────────────────────────────────────────────────────┐
echo │  IT 代理商料號管理系統 — Git 初始化                         │
echo └─────────────────────────────────────────────────────────────┘
echo.

cd /d "%~dp0"

REM 移除任何先前殘留的 .git
if exist ".git" (
  echo [清理] 移除先前的 .git 目錄...
  rmdir /s /q .git
)

echo [1/4] git init ...
git init -b main
if errorlevel 1 goto :err

echo [2/4] git add ...
git add .
if errorlevel 1 goto :err

echo [3/4] git commit ...
git -c user.email="microsfc@gmail.com" -c user.name="Sean" commit -m "Initial commit: IT 代理商料號管理系統 (Angular + Node.js + SQLite)"
if errorlevel 1 goto :err

if "%~1"=="" (
  echo.
  echo [完成] 已建立本地 Repo (尚未 push)。
  echo        如要推送至 GitHub，請執行:
  echo            setup-git.bat https://github.com/<account>/<repo>.git
  echo.
  goto :eof
)

echo [4/4] git remote add origin %~1 ...
git remote add origin %~1
git push -u origin main
if errorlevel 1 (
  echo.
  echo [錯誤] 推送失敗。
  echo  - 請確認 Repo URL 正確且為空
  echo  - 若是 HTTPS，密碼提示需貼 Personal Access Token (PAT)
  echo    申請 PAT: https://github.com/settings/tokens
  goto :eof
)

echo.
echo [成功] 已推送至 %~1
goto :eof

:err
echo.
echo [錯誤] 步驟失敗，請檢查 Git 是否已安裝 (https://git-scm.com)
exit /b 1
