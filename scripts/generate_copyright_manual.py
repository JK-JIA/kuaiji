#!/usr/bin/env python3
"""Generate 软著 文档鉴别材料 PDF (用户手册)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]


def load_config(config_path: Path, owner_override: str | None = None) -> dict:
    data = json.loads(config_path.read_text(encoding="utf-8-sig"))
    owner_file = config_path.parent / "著作权人.txt"
    if owner_file.is_file():
        file_owner = owner_file.read_text(encoding="utf-8-sig").strip().splitlines()[0].strip()
        if file_owner and not file_owner.startswith("请") and "填写" not in file_owner:
            data["copyright_owner"] = file_owner
    if owner_override:
        data["copyright_owner"] = owner_override.strip()
    owner = (data.get("copyright_owner") or "").strip()
    if not owner or owner.startswith("请") or "填写" in owner:
        print("错误：请在 著作权人.txt 中填写与申请表一致的姓名。", file=sys.stderr)
        sys.exit(1)
    return data


def manual_sections(cfg: dict) -> list[tuple[str, list[str]]]:
    name = cfg["software_name"]
    version = cfg["version"]
    owner = cfg["copyright_owner"]
    return [
        (
            "封面",
            [
                name,
                f"版本号：{version}",
                "用户操作手册",
                f"著作权人：{owner}",
                "2026年6月",
            ],
        ),
        (
            "1. 软件概述",
            [
                f"{name}（版本 {version}）面向果蔬批发等场景的商户，提供账单录入、核账对账、",
                "数据统计、导入导出及云端同步等功能，支持 Android 手机客户端与云端服务器协同工作。",
                "本软件由著作权人独立开发，适用于批发零售、农产品贸易等行业日常记账管理。",
            ],
        ),
        (
            "2. 运行环境",
            [
                "客户端：Android 8.0 及以上，ARM 架构智能手机。",
                "服务端：Ubuntu 22.04 LTS，x86_64 云服务器。",
                "支撑软件：MySQL 8.0 数据库、Node.js 运行环境。",
                "网络：客户端需连接互联网以使用登录、云端同步、语音识别等功能。",
            ],
        ),
        (
            "3. 安装与启动",
            [
                "（1）从官方渠道下载 APK 安装包并安装至 Android 手机。",
                "（2）首次启动应用，阅读并同意用户协议与隐私政策。",
                "（3）在登录页使用手机号注册或登录；也可使用已有账号密码登录云端账本。",
                "（4）登录成功后进入首页，即可开始记账操作。",
            ],
        ),
        (
            "4. 手动记账",
            [
                "（1）在首页点击添加按钮，打开记账表单。",
                "（2）填写商品名称、数量、单位、金额、购买方（车牌/摊位/姓名等）等字段。",
                "（3）可选择日期，支持自定义账本字段与商品、客户管理。",
                "（4）确认无误后保存，记录显示在首页列表中，可按日期分组浏览。",
            ],
        ),
        (
            "5. 语音记账",
            [
                "（1）在首页长按或点击语音按钮开始录音。",
                "（2）用普通话描述交易，如「苹果五斤川A12345，五十元」。",
                "（3）系统自动识别语音并解析为表单字段，用户确认后保存。",
                "（4）可在设置中配置语音识别引擎、热词与别名以提高识别准确率。",
            ],
        ),
        (
            "6. 拍照记账",
            [
                "（1）在首页选择拍照识单功能，对准纸质账单或手写单据拍摄。",
                "（2）系统识别图片中的商品、数量、金额等信息并填入表单。",
                "（3）用户核对识别结果，修正错误字段后保存入账。",
            ],
        ),
        (
            "7. 核账与搜索",
            [
                "（1）在记录卡片上可进行单笔核账，标记收款状态与金额。",
                "（2）支持按购买方批量核账，提高对账效率。",
                "（3）首页搜索支持按关键词、日期范围、核账状态筛选记录。",
                "（4）可生成小票预览并分享或保存。",
            ],
        ),
        (
            "8. 数据统计",
            [
                "（1）进入统计页查看销售汇总、商品排行、购买方分布等图表。",
                "（2）支持自定义统计维度与日期范围。",
                "（3）点击统计项可下钻查看对应明细记录。",
            ],
        ),
        (
            "9. 导入导出",
            [
                "（1）在设置-导入导出中，可将账本导出为 CSV 或 Excel 文件。",
                "（2）支持从 CSV / Excel 导入历史账单。",
                "（3）可查看导入历史记录，便于数据迁移与备份。",
            ],
        ),
        (
            "10. 设置与账号",
            [
                "（1）设置页可管理商品库、客户库、自定义字段。",
                "（2）支持修改密码、会员功能、应用更新检查。",
                "（3）已登录用户数据同步至云端服务器，换机登录可恢复数据。",
                "（4）退出登录后本地缓存按策略保留或清除。",
            ],
        ),
        (
            "11. 常见问题",
            [
                "问：无法连接服务器？答：检查网络与 API 地址配置，确认服务端正常运行。",
                "问：语音识别不准？答：在设置中添加热词、商品别名，尽量在安静环境录音。",
                "问：如何备份数据？答：使用导出功能定期备份，或保持云端账号登录同步。",
            ],
        ),
        (
            "12. 版权声明",
            [
                f"{name} 软件著作权归 {owner} 所有，受中华人民共和国著作权法保护。",
                "未经著作权人书面许可，不得复制、修改、传播或用于商业目的。",
                f"软件名称：{name}    版本号：{version}    著作权人：{owner}",
            ],
        ),
    ]


class ManualPDF(FPDF):
    def __init__(self, cfg: dict):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.cfg = cfg
        font_path = Path(r"C:\Windows\Fonts\simsun.ttc")
        if not font_path.is_file():
            font_path = Path(r"C:\Windows\Fonts\msyh.ttc")
        self.add_font("CN", "", str(font_path))
        self.add_font("CN", "B", str(font_path))
        self.set_auto_page_break(auto=True, margin=20)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("CN", "", 9)
        name = self.cfg["software_name"]
        version = self.cfg["version"]
        owner = self.cfg["copyright_owner"]
        self.cell(
            0,
            10,
            f"{name} {version}  著作权人：{owner}  第{self.page_no()}页",
            align="C",
        )


def build_manual(cfg: dict) -> FPDF:
    pdf = ManualPDF(cfg)
    sections = manual_sections(cfg)

    # Cover
    pdf.add_page()
    pdf.set_font("CN", "B", 22)
    pdf.ln(50)
    pdf.cell(0, 12, cfg["software_name"], align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("CN", "", 14)
    pdf.cell(0, 10, f"版本号：{cfg['version']}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.cell(0, 10, "用户操作手册", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)
    pdf.cell(0, 10, f"著作权人：{cfg['copyright_owner']}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 10, "2026年6月", align="C", new_x="LMARGIN", new_y="NEXT")

    for title, paragraphs in sections[1:]:
        pdf.add_page()
        pdf.set_font("CN", "B", 14)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.set_font("CN", "", 11)
        for para in paragraphs:
            pdf.multi_cell(0, 7, para)
            pdf.ln(2)
    return pdf


def main() -> None:
    if len(sys.argv) < 2:
        print("用法: python generate_copyright_manual.py <输出目录> [config.json] [--owner 姓名]")
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
    pdf = build_manual(cfg)

    safe_name = cfg["software_name"].replace(" ", "")
    out_file = out_dir / f"文档鉴别材料_{safe_name}_{cfg['version']}.pdf"
    pdf.output(str(out_file))
    print(f"已生成: {out_file}（共 {pdf.page_no()} 页，不足60页时提交全部即可）")


if __name__ == "__main__":
    main()
