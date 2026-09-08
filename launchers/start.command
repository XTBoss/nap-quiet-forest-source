#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$ROOT/server.py" "$ROOT"
fi

echo "========================================"
echo "  安静小森林"
echo "========================================"
echo

if command -v php >/dev/null 2>&1; then
  echo "正在打开浏览器：http://127.0.0.1:43147/"
  echo
  echo "请不要关闭这个窗口。"
  echo "当前缺少 Python，记录只能保存在浏览器里，不会写入 data 文件夹。"
  echo
  (sleep 0.6 && open "http://127.0.0.1:43147/") &
  exec php -S 127.0.0.1:43147 -t "$ROOT"
fi

if command -v ruby >/dev/null 2>&1; then
  echo "正在打开浏览器：http://127.0.0.1:43147/"
  echo
  echo "请不要关闭这个窗口。"
  echo "当前缺少 Python，记录只能保存在浏览器里，不会写入 data 文件夹。"
  echo
  (sleep 0.6 && open "http://127.0.0.1:43147/") &
  exec ruby -run -e httpd "$ROOT" -p 43147
fi

echo "这台电脑缺少启动所需的组件（Python / PHP / Ruby）。"
echo "请换一台电脑，或把这个文件夹发回给提供文件的人。"
read -r _
exit 1
