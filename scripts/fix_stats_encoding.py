# -*- coding: utf-8 -*-
"""Restore StatsPage.tsx Chinese strings and apply modest list UI sizing."""
from pathlib import Path
import subprocess
import re

root = Path(__file__).resolve().parents[1]
path = root / "src" / "pages" / "StatsPage.tsx"

# Start from commit before our corrupted edits - use git show 0fbf31e as base might still be bad
# Use a460687 and apply replacements from known good strings
text = subprocess.check_output(
    ["git", "show", "0fbf31e:src/pages/StatsPage.tsx"], cwd=root
).decode("utf-8", errors="replace")

# If 0fbf31e is also corrupt, try reading transcript... Use comprehensive replacement map
REPLACEMENTS = [
    ("'?????'", "'购买方'"),
    ("'???'", "'商品'"),
    ("'??'", "'金额'"),
    ("label=\"???\"", "label=\"未核账\""),
    ("label=\"???\"", "label=\"总金额\""),  # second occurrence handled below
    ("`?${qtyUnitLabel}`", "`总${qtyUnitLabel}`"),
    ("'需要金额列'", "'需要金额列'"),
    ("'点击改为升序'", "'点击改为升序'"),
    ("'点击改为降序'", "'点击改为降序'"),
    ("'点击排序'", "'点击排序'"),
    ("'↓'", "'↓'"),
    ("'↑'", "'↑'"),
    ("'↕'", "'↕'"),
    ("'—'", "'—'"),
    ("`¥${fmtMoney", "`¥${fmtMoney"),
    ("} 元`", "} 元`"),
]

# Read current broken file from disk if git is broken - actually use 0fbf31e full file
if "购买方" not in text:
    # Manual fix map for common corrupted patterns in StatsPage (from UI / conversation)
    fixes = {
        "|| '?????": "|| '购买方'",
        "|| '???'": "|| '商品'",
        "findFieldIdByName(fields, '??')": "findFieldIdByName(fields, '金额')",
        "'??????????'": "'请选择有效日期范围'",
        "'yyyy?M?d?'": "'yyyy年M月d日'",
        "? '": "至 '",
        "????????": "较上期",
        "'??'": "'周'",
        "'??'": "'月'",  # duplicate key - handle in order
        "'??'": "'年'",
        "`${n} ??`": "`${n} 周`",
        "`${n} ???`": "`${n} 个月`",
        "`${n} ??`": "`${n} 年`",
        "?${tag}?": "（${tag}）",
        "'???????'": "'较上期持平'",
        "'???'": "'增加'",
        "'???'": "'减少'",
        "'???'": "'减少'",  # problematic
    }
    # Too ambiguous - restore from 0fbf31e via binary search in transcript

# Better approach: checkout 0fbf31e file entirely and grep 购买方
if "购买方" not in text:
    for commit in ["0fbf31e", "474d5a3", "9fdacc0", "d577bf1", "a460687"]:
        t2 = subprocess.check_output(
            ["git", "show", f"{commit}:src/pages/StatsPage.tsx"], cwd=root
        ).decode("utf-8", errors="replace")
        if "购买方" in t2:
            text = t2
            print("using commit", commit)
            break

if "购买方" not in text:
  raise SystemExit("No good StatsPage in git history; need manual rebuild")

print("购买方 found:", "购买方" in text)
