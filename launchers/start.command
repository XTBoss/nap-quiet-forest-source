#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

echo "========================================"
echo "  午睡小森林"
echo "========================================"
echo

start_python() {
  python3 - "$ROOT" <<'PY'
import os
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

root = sys.argv[1]
os.chdir(root)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

httpd = None
for port in range(43147, 43167):
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        break
    except OSError:
        continue

if httpd is None:
    print("无法启动：43147 附近的端口都被占用了。")
    print("请关掉其他午睡小森林窗口后再试。")
    input("按回车退出")
    sys.exit(1)

url = "http://127.0.0.1:%d/" % httpd.server_address[1]
print("正在打开浏览器：%s" % url)
print()
print("请不要关闭这个窗口。")
print("用完后，关掉这个窗口即可。")
print()
webbrowser.open(url)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    httpd.server_close()
PY
}

if command -v python3 >/dev/null 2>&1; then
  start_python
  exit $?
fi

if command -v php >/dev/null 2>&1; then
  echo "正在打开浏览器：http://127.0.0.1:43147/"
  echo
  echo "请不要关闭这个窗口。"
  echo "用完后，关掉这个窗口即可。"
  echo
  (sleep 0.6 && open "http://127.0.0.1:43147/") &
  exec php -S 127.0.0.1:43147 -t "$ROOT"
fi

if command -v ruby >/dev/null 2>&1; then
  echo "正在打开浏览器：http://127.0.0.1:43147/"
  echo
  echo "请不要关闭这个窗口。"
  echo "用完后，关掉这个窗口即可。"
  echo
  (sleep 0.6 && open "http://127.0.0.1:43147/") &
  exec ruby -run -e httpd "$ROOT" -p 43147
fi

echo "这台电脑缺少启动所需的组件（Python / PHP / Ruby）。"
echo "请换一台电脑，或把这个文件夹发回给提供文件的人。"
read -r _
exit 1
