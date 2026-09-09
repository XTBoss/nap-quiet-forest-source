#!/usr/bin/env python3
import json
import os
import re
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_HISTORY = 365
DATE_FILE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")
CLASSROOM_LOCK = threading.Lock()


def validate_classroom(value):
    if not isinstance(value, dict) or value.get("version") != 1:
        raise ValueError("invalid classroom")
    if type(value.get("revision")) is not int or not 0 <= value["revision"] <= 1_000_000:
        raise ValueError("invalid revision")
    if not isinstance(value.get("className"), str) or not value["className"].strip() or len(value["className"]) > 32:
        raise ValueError("invalid class name")
    if type(value.get("smilesPerSticker")) is not int or not 1 <= value["smilesPerSticker"] <= 100:
        raise ValueError("invalid exchange ratio")
    if not isinstance(value.get("students"), list) or len(value["students"]) > 120:
        raise ValueError("invalid students")
    if not isinstance(value.get("events"), list) or len(value["events"]) > 50000:
        raise ValueError("invalid events")
    student_ids = set()
    for student in value["students"]:
        if not isinstance(student, dict) or not isinstance(student.get("id"), str) or not student["id"] or student["id"] in student_ids:
            raise ValueError("invalid student id")
        if not isinstance(student.get("name"), str) or not student["name"].strip() or len(student["name"]) > 24:
            raise ValueError("invalid student name")
        if type(student.get("archived")) is not bool or not isinstance(student.get("avatar"), str):
            raise ValueError("invalid student")
        avatar = student["avatar"]
        if not re.fullmatch(r"preset:(?:[0-9]|[1-5][0-9])", avatar) and not (len(avatar) <= 24000 and re.fullmatch(r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", avatar)):
            raise ValueError("invalid avatar")
        student_ids.add(student["id"])
    balances = {identifier: dict(positive=0, negative=0, spent=0, clearedSmiles=0, clearedFrowns=0, stickers=0) for identifier in student_ids}
    stack, event_ids = [], set()
    fields = {"award": "positive", "deduct": "negative", "redeem": "spent", "clear-smile": "clearedSmiles", "clear-frown": "clearedFrowns"}
    for event in value["events"]:
        if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not event["id"] or event["id"] in event_ids:
            raise ValueError("invalid event id")
        event_ids.add(event["id"])
        if not isinstance(event.get("studentIds"), list) or not event["studentIds"] or len(set(event["studentIds"])) != len(event["studentIds"]) or not all(identifier in student_ids for identifier in event["studentIds"]):
            raise ValueError("invalid event students")
        if not isinstance(event.get("reason"), str) or len(event["reason"]) > 120:
            raise ValueError("invalid reason")
        datetime.fromisoformat(event["at"].replace("Z", "+00:00"))
        direction = 1
        if event.get("type") == "undo":
            target = stack.pop() if stack else None
            if not target or target["id"] != event.get("targetId") or target["studentIds"] != event["studentIds"]:
                raise ValueError("invalid undo")
            event, direction = target, -1
        else:
            if event.get("type") not in fields or type(event.get("amount")) is not int or not 1 <= event["amount"] <= 1000:
                raise ValueError("invalid action")
            if event["type"] == "redeem":
                stickers = event.get("stickers")
                if type(stickers) is not int or not 1 <= stickers <= 1000 or event["amount"] % stickers or not 1 <= event["amount"] / stickers <= 100:
                    raise ValueError("invalid redemption")
            stack.append(event)
        for identifier in event["studentIds"]:
            balance = balances[identifier]
            balance[fields[event["type"]]] += event["amount"] * direction
            if event["type"] == "redeem":
                balance["stickers"] += event["stickers"] * direction
            if not all(0 <= number <= 1_000_000 for number in balance.values()) or balance["positive"] // 5 < balance["spent"] + balance["clearedSmiles"] or balance["negative"] // 5 < balance["clearedFrowns"]:
                raise ValueError("insufficient balance")
    return value


def load_classroom(root):
    path = Path(root) / "data" / "classroom.json"
    return validate_classroom(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else None


def save_classroom(root, payload):
    value = validate_classroom(payload["data"])
    with CLASSROOM_LOCK:
        current = load_classroom(root)
        revision = current["revision"] if current else 0
        if type(payload.get("baseRevision")) is not int or payload["baseRevision"] != revision:
            raise FileExistsError("classroom changed in another window")
        value = {**value, "revision": revision + 1}
        validate_classroom(value)
        path = data_dir(root) / "classroom.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, path)
        return value


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
        if self._api_path() == "/api/classroom":
            try:
                self._send_json(200, {"data": load_classroom(self.root)})
            except Exception:
                self._send_json(500, {"error": "classroom could not be read"})
            return
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
        if self._api_path() == "/api/classroom":
            if method != "PUT":
                self._send_json(405, {"error": "method not allowed"})
                return True
            try:
                self._send_json(200, {"data": save_classroom(self.root, self._read_json())})
            except FileExistsError as error:
                self._send_json(409, {"error": str(error)})
            except Exception:
                self._send_json(400, {"error": "invalid classroom data"})
            return True
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
        if length > (12_000_000 if self._api_path() == "/api/classroom" else 1_000_000):
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
