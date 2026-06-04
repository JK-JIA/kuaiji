# -*- coding: utf-8 -*-
"""Buyer column in BuyerSummaryTable: font-semibold."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / "src" / "pages" / "StatsPage.tsx"
t = p.read_text(encoding="utf-8")

old = """  const tdText = relaxed
    ? 'break-words px-1.5 py-2 text-xs font-medium text-kj-primary sm:px-2 sm:py-2.5 sm:text-sm'
    : 'break-words px-1 py-2 text-xs font-medium text-kj-primary sm:px-1.5'
  const valLine = relaxed"""

new = """  const tdText = relaxed
    ? 'break-words px-1.5 py-2 text-xs font-semibold text-kj-primary sm:px-2 sm:py-2.5 sm:text-sm'
    : 'break-words px-1 py-2 text-xs font-semibold text-kj-primary sm:px-1.5'
  const valLine = relaxed"""

if new in t:
    print("already patched", p)
elif old not in t:
    raise SystemExit("BuyerSummaryTable tdText block not found")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("patched", p)
