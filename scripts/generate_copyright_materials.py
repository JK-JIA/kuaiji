#!/usr/bin/env python3
"""Generate 软著 程序鉴别材料 PDF (前30页 + 后30页, 一般交存)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = {
    "software_name": "批发快记软件",
    "version": "V1.0",
    "copyright_owner": "",
    "lines_per_page": 50,
    "pages_each_side": 30,
}

SOURCE_DIRS = [
    ROOT / "src",
    ROOT / "server" / "src",
    ROOT / "android" / "app" / "src" / "main" / "java",
]
SOURCE_GLOBS = ("*.ts", "*.tsx", "*.js", "*.jsx", "*.java")
EXCLUDE_PARTS = (
    "node_modules",
    "dist",
    ".git",
    "vite-env.d.ts",
)


def load_config(config_path: Path, owner_override: str | None = None) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if config_path.is_file():
        data = json.loads(config_path.read_text(encoding="utf-8-sig"))
        cfg.update({k: v for k, v in data.items() if v is not None})
    owner_file = config_path.parent / "著作权人.txt"
    if owner_file.is_file():
        file_owner = owner_file.read_text(encoding="utf-8").strip().splitlines()[0].strip()
        if file_owner and not file_owner.startswith("请") and "填写" not in file_owner:
            cfg["copyright_owner"] = file_owner
    if owner_override:
        cfg["copyright_owner"] = owner_override.strip()
    owner = (cfg.get("copyright_owner") or "").strip()
    if not owner or owner.startswith("请") or "填写" in owner or owner == "REPLACE_ME":
        print(
            "错误：请在 config.json 或 著作权人.txt 中填写 copyright_owner（与软著申请表「著作权人」完全一致）。",
            file=sys.stderr,
        )
        sys.exit(1)
    return cfg


def collect_source_lines() -> list[str]:
    files: list[Path] = []
    for base in SOURCE_DIRS:
        if not base.is_dir():
            continue
        for pattern in SOURCE_GLOBS:
            files.extend(base.rglob(pattern))
    files = sorted(
        {
            p.resolve()
            for p in files
            if not any(part in EXCLUDE_PARTS for part in p.parts)
        }
    )
    if not files:
        raise RuntimeError("未找到源代码文件")

    lines: list[str] = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        lines.append(f"/* ===== File: {rel} ===== */")
        text = path.read_text(encoding="utf-8", errors="replace")
        lines.extend(text.splitlines())
        lines.append("")
    return lines


def pick_pages(all_lines: list[str], lines_per_page: int, pages_each_side: int) -> list[list[str]]:
    total_needed = lines_per_page * pages_each_side * 2
    if len(all_lines) < total_needed:
        raise RuntimeError(
            f"源代码行数不足：需要 {total_needed} 行，当前 {len(all_lines)} 行"
        )
    front_line_count = lines_per_page * pages_each_side
    front_lines = all_lines[:front_line_count]
    back_lines = all_lines[-front_line_count:]

    pages: list[list[str]] = []
    for chunk in (front_lines, back_lines):
        for i in range(0, len(chunk), lines_per_page):
            pages.append(chunk[i : i + lines_per_page])
    return pages


class CopyrightSourcePDF(FPDF):
    def __init__(self, cfg: dict):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.cfg = cfg
        self.total_pages = cfg["pages_each_side"] * 2
        font_path = Path(r"C:\Windows\Fonts\simsun.ttc")
        if not font_path.is_file():
            font_path = Path(r"C:\Windows\Fonts\msyh.ttc")
        self.font_path = font_path
        self.set_auto_page_break(auto=False)
        self.add_font("CN", "", str(self.font_path))
        self.add_font("CN", "B", str(self.font_path))

    def draw_header(self, page_no: int) -> None:
        name = self.cfg["software_name"]
        version = self.cfg["version"]
        owner = self.cfg["copyright_owner"]
        self.set_font("CN", "B", 10)
        self.set_xy(10, 8)
        self.cell(
            190,
            5,
            f"{name}  {version}    第{page_no}页  共{self.total_pages}页",
            align="C",
        )
        self.set_font("CN", "", 9)
        self.set_xy(10, 13)
        self.cell(190, 5, f"著作权人：{owner}", align="C")
        self.set_draw_color(0, 0, 0)
        self.line(10, 19, 200, 19)

def build_pdf(cfg: dict, pages: list[list[str]], lines_per_page: int, total_source: int) -> FPDF:
    pdf = CopyrightSourcePDF(cfg)
    front_count = lines_per_page * cfg["pages_each_side"]

    for page_index, code_lines in enumerate(pages, start=1):
        pdf.add_page()
        pdf.draw_header(page_index)
        pdf.set_font("CN", "", 8)
        y = 21
        line_h = 4.6
        for idx, line in enumerate(code_lines, start=1):
            if page_index <= cfg["pages_each_side"]:
                global_line = (page_index - 1) * lines_per_page + idx
            else:
                back_page = page_index - cfg["pages_each_side"]
                global_line = total_source - front_count + (back_page - 1) * lines_per_page + idx
            text = line.replace("\t", "    ")
            if len(text) > 110:
                text = text[:110]
            pdf.set_xy(10, y)
            pdf.cell(190, line_h, f"{global_line:5d}  {text}")
            y += line_h
    return pdf


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "用法: python generate_copyright_materials.py <输出目录> [config.json] [--owner 姓名]"
        )
        sys.exit(1)

    args = sys.argv[1:]
    owner_override = None
    if "--owner" in args:
        idx = args.index("--owner")
        owner_override = args[idx + 1]
        args = args[:idx] + args[idx + 2 :]

    out_dir = Path(args[0]).expanduser().resolve()
    config_path = (
        Path(args[1]).expanduser().resolve() if len(args) > 1 else out_dir / "config.json"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    cfg = load_config(config_path, owner_override)
    all_lines = collect_source_lines()
    pages = pick_pages(all_lines, cfg["lines_per_page"], cfg["pages_each_side"])
    pdf = build_pdf(cfg, pages, cfg["lines_per_page"], len(all_lines))

    safe_name = cfg["software_name"].replace(" ", "")
    out_file = out_dir / f"程序鉴别材料_{safe_name}_{cfg['version']}.pdf"
    pdf.output(str(out_file))

    meta = {
        **cfg,
        "source_files_scanned": len(list(collect_source_files())),
        "total_source_lines": len(all_lines),
        "pdf_pages": len(pages),
        "output": str(out_file),
    }
    (out_dir / "生成信息.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"已生成: {out_file}")
    print(f"总源码行数: {len(all_lines)}，PDF 页数: {len(pages)}")


def collect_source_files() -> list[Path]:
    files: list[Path] = []
    for base in SOURCE_DIRS:
        if not base.is_dir():
            continue
        for pattern in SOURCE_GLOBS:
            files.extend(base.rglob(pattern))
    return sorted(
        {
            p.resolve()
            for p in files
            if not any(part in EXCLUDE_PARTS for part in p.parts)
        }
    )


if __name__ == "__main__":
    main()
