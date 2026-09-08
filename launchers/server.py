#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_HISTORY = 365
DATE_FILE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")


def data_dir(root):
    path = Path(root) / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def valid(item):
    return (
        isinstance(item, dict)
        and isinstance(item.get("endedAt"), str)
        and _finite(item.get("quietMs"))
        and _finite(item.get("planted"))
        and _finite(item.get("lost"))
        and _finite(item.get("big"))
    )


def _finite(value):
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def normalize(item):
    return {
        "endedAt": str(item["endedAt"]),
        "quietMs": int(round(float(item["quietMs"]))),
        "planted": int(float(item["planted"])),
        "lost": int(float(item["lost"])),
        "big": int(float(item["big"])),
        "demo": bool(item.get("demo")),
    }


def record_key(item):
    rec = normalize(item)
    demo = "1" if rec["demo"] else "0"
    return "|".join(
        [
            rec["endedAt"],
            str(rec["quietMs"]),
            str(rec["planted"]),
            str(rec["lost"]),
            str(rec["big"]),
            demo,
        ]
    )


def date_key(ended_at):
    text = ended_at.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return ""
    if dt.tzinfo is not None:
        dt = dt.astimezone()
    return dt.strftime("%Y-%m-%d")


def extract(payload):
    if valid(payload):
        return [normalize(payload)]
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("records") or payload.get("sessions") or []
    else:
        items = []
    return [normalize(item) for item in items if valid(item)]


def merge(existing, incoming=None):
    mapping = {}
    for item in extract(existing) + extract(incoming or []):
        key = record_key(item)
        if key not in mapping:
            mapping[key] = item
    records = sorted(mapping.values(), key=lambda item: item["endedAt"], reverse=True)
    return records[:MAX_HISTORY]


def load_all(root):
    records = []
    for path in data_dir(root).iterdir():
        if not path.is_file() or not DATE_FILE.match(path.name):
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        records.extend(extract(payload))
    return merge(records, [])


def write_all(root, records):
    folder = data_dir(root)
    for path in folder.iterdir():
        if path.is_file() and DATE_FILE.match(path.name):
            path.unlink()
    grouped = {}
    for item in merge(records, []):
        key = date_key(item["endedAt"])
        if not key:
            continue
        grouped.setdefault(key, []).append(item)
    for key, sessions in grouped.items():
        (folder / f"{key}.json").write_text(
            json.dumps({"date": key, "sessions": sessions}, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
    return load_all(root)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server, **kwargs):
        super().__init__(request, client_address, server, directory=server.quiet_root, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    @property
    def root(self):
        return self.server.quiet_root

    def do_GET(self):
        if self._api_path() == "/api/history":
            self._send_json(200, {"records": load_all(self.root)})
            return
        super().do_GET()

    def do_POST(self):
        if not self._handle_write("POST"):
            self.send_error(404)

    def do_PUT(self):
        if not self._handle_write("PUT"):
            self.send_error(404)

    def do_DELETE(self):
        if self._api_path() != "/api/history":
            self.send_error(404)
            return
        try:
            self._send_json(200, {"records": write_all(self.root, [])})
        except Exception:
            self._send_json(400, {"error": "bad request"})

    def _handle_write(self, method):
        if self._api_path() != "/api/history":
            return False
        try:
            payload = self._read_json()
            if method == "POST":
                records = write_all(self.root, merge([payload], load_all(self.root)))
            else:
                records = write_all(self.root, extract(payload))
            self._send_json(200, {"records": records})
        except Exception:
            self._send_json(400, {"error": "bad request"})
        return True

    def _api_path(self):
        return self.path.split("?", 1)[0]

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            raise ValueError("too large")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    os.chdir(root)
    httpd = None
    for port in range(43147, 43167):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            httpd.quiet_root = root
            break
        except OSError:
            continue
    if httpd is None:
        print("无法启动：43147 附近的端口都被占用了。")
        print("请关掉其他安静小森林窗口后再试。")
        input("按回车退出")
        sys.exit(1)

    url = "http://127.0.0.1:%d/" % httpd.server_address[1]
    print("========================================")
    print("  安静小森林")
    print("========================================")
    print()
    print("正在打开浏览器：%s" % url)
    print()
    print("请不要关闭这个窗口。")
    print("用完后，关掉这个窗口即可。")
    print("记录会写入旁边的 data 文件夹。")
    print()
    try:
        import webbrowser

        webbrowser.open(url)
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
