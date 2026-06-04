# -*- coding: utf-8 -*-
"""Set buyer summary defaults: list view, outstanding desc sort."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / "src" / "pages" / "StatsPage.tsx"
t = p.read_text(encoding="utf-8")

sort_old = (
    "  const [buyerSummarySort, setBuyerSummarySort] =\n"
    "    useState<BuyerSummarySort | null>(null)"
)
sort_new = (
    "  const [buyerSummarySort, setBuyerSummarySort] =\n"
    "    useState<BuyerSummarySort>({ key: 'outstanding', dir: 'desc' })"
)

view_old = (
    "  const [buyerStatsView, setBuyerStatsView] =\n"
    "    useState<StatsShareViewMode>('chart')"
)
view_new = (
    "  const [buyerStatsView, setBuyerStatsView] =\n"
    "    useState<StatsShareViewMode>('list')"
)

changed = False
if sort_old in t:
    t = t.replace(sort_old, sort_new, 1)
    changed = True
elif sort_new not in t:
    raise SystemExit("buyerSummarySort pattern not found")

if view_old in t:
    t = t.replace(view_old, view_new, 1)
    changed = True
elif view_new not in t:
    raise SystemExit("buyerStatsView pattern not found")

if changed:
    p.write_text(t, encoding="utf-8")
    print("patched", p)
else:
    print("already correct", p)
