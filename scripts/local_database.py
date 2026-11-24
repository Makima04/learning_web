"""本地数据脚本与后端使用相同的数据库选择顺序。"""

import os
from pathlib import Path

URL_FILE = Path(__file__).resolve().parents[1] / ".local/database-url"


def database_url() -> str:
    configured = os.environ.get("EW_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if configured:
        return configured
    if URL_FILE.is_file():
        stored = URL_FILE.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    return "postgres://makima@localhost/english_web"
