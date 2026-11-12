#!/usr/bin/env python3
"""兼容原数据结构导出命令；四科统一使用 export_wangdao_images.py。"""
from __future__ import annotations

import argparse
from pathlib import Path

from export_wangdao_images import export


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=Path.home() / "Downloads/数据结构大题.pdf")
    export(parser.parse_args().pdf)
