#!/usr/bin/env python3
"""Generate all 软著鉴别材料 (程序 + 文档)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent


def main() -> None:
    if len(sys.argv) < 2:
        print("用法: python generate_copyright_all.py <输出目录> [config.json] [--owner 姓名]")
        sys.exit(1)

    args = sys.argv[1:]
    owner_override = None
    if "--owner" in args:
        idx = args.index("--owner")
        owner_override = args[idx + 1]
        owner_args = ["--owner", owner_override]
        args = args[:idx] + args[idx + 2 :]
    else:
        owner_args = []

    out_dir = Path(args[0]).expanduser().resolve()
    config = args[1] if len(args) > 1 else str(out_dir / "config.json")

    for name in ("generate_copyright_materials.py", "generate_copyright_manual.py"):
        script = SCRIPTS / name
        rc = subprocess.call([sys.executable, str(script), str(out_dir), config, *owner_args])
        if rc != 0:
            sys.exit(rc)
    print("全部材料已生成。")


if __name__ == "__main__":
    main()
