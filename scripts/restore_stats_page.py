# -*- coding: utf-8 -*-
"""One-shot: restore StatsPage Chinese + list bar UI (no editor corruption)."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "src" / "pages" / "StatsPage.tsx"

raw = subprocess.check_output(
    ["git", "show", "0fbf31e:src/pages/StatsPage.tsx"], cwd=root
)
text = raw.decode("utf-8", errors="replace")

import ftfy

text = ftfy.fix_text(text)

old_cell = """function StatsShareMetricCell({
  valueLine,
  pct,
  barPct,
  barClassName,
  valLineClass,
  pctTextClass,
}: {
  valueLine: string
  pct: number
  barPct: number
  barClassName: string
  valLineClass: string
  pctTextClass: string
}) {
  return (
    <div className="space-y-0.5">
      <div className={valLineClass}>{valueLine}</div>
      <div className="flex items-center gap-1">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-kj-raised">
          <div
            className={`h-full rounded-full ${barClassName}`}
            style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
          />
        </div>
        <span
          className={`w-9 shrink-0 text-right tabular-nums text-kj-muted ${pctTextClass}`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}"""

new_cell = """const PCT_INSIDE_BAR_MIN_WIDTH = 25

const PCT_LABEL_BY_BAR: Record<string, string> = {
  'bg-amber-500': 'text-amber-600',
  'bg-[#1a7f4c]': 'text-[#1a7f4c]',
  'bg-teal-500': 'text-teal-600',
  'bg-[#2ecc71]': 'text-[#1a7f4c]',
}

function StatsShareMetricCell({
  valueLine,
  pct,
  barPct,
  barClassName,
  valLineClass,
  pctTextClass,
  relaxed,
}: {
  valueLine: string
  pct: number
  barPct: number
  barClassName: string
  valLineClass: string
  pctTextClass: string
  relaxed?: boolean
}) {
  const pctLabel = `${pct.toFixed(1)}%`
  const w = Math.min(100, Math.max(0, barPct))
  const pctInside = pct > PCT_INSIDE_BAR_MIN_WIDTH
  const barH = relaxed ? 'h-5' : 'h-4'
  const pctClass =
    PCT_LABEL_BY_BAR[barClassName] ?? 'text-kj-secondary'

  return (
    <div className={relaxed ? 'space-y-1' : 'space-y-0.5'}>
      <div className={valLineClass}>{valueLine}</div>
      <div className="flex w-full min-w-0 items-center gap-1">
        <div
          className={`relative ${barH} shrink-0 rounded-full ${barClassName}`}
          style={{ width: `${w}%`, minWidth: w > 0 ? '4px' : undefined }}
        >
          {pctInside ? (
            <span className="absolute inset-y-0 right-0 flex items-center justify-end whitespace-nowrap px-1 text-[10px] font-medium leading-none tabular-nums text-white">
              {pctLabel}
            </span>
          ) : null}
        </div>
        {!pctInside ? (
          <span
            className={`shrink-0 whitespace-nowrap tabular-nums ${pctTextClass} ${pctClass}`}
          >
            {pctLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}"""

if old_cell not in text:
    raise SystemExit("cell block missing")
text = text.replace(old_cell, new_cell, 1)

old_styles = """  const th = relaxed
    ? 'px-2 py-2.5 text-left text-xs font-medium text-kj-secondary sm:px-3 sm:py-3 sm:text-sm'
    : 'px-1.5 py-2 text-left text-[11px] font-medium text-kj-secondary sm:px-2'
  const tdText = relaxed
    ? 'break-words px-1.5 py-2 text-xs font-medium text-kj-primary sm:px-2 sm:py-2.5 sm:text-sm'
    : 'break-words px-1 py-2 text-[11px] font-medium text-kj-primary sm:px-1.5'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-kj-secondary'
    : 'text-[11px] tabular-nums text-kj-secondary'
  const pctText = relaxed ? 'text-sm' : 'text-xs'"""

new_styles = """  const th = relaxed
    ? 'px-2 py-2.5 text-left text-xs font-medium text-kj-secondary sm:px-3 sm:py-3 sm:text-sm'
    : 'px-1.5 py-2 text-left text-xs font-medium text-kj-secondary sm:px-2'
  const tdText = relaxed
    ? 'break-words px-1.5 py-2 text-xs font-medium text-kj-primary sm:px-2 sm:py-2.5 sm:text-sm'
    : 'break-words px-1 py-2 text-xs font-medium text-kj-primary sm:px-1.5'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-kj-primary'
    : 'text-xs tabular-nums text-kj-primary sm:text-[13px]'
  const pctText = relaxed ? 'text-xs' : 'text-[11px]'"""

if old_styles not in text:
    raise SystemExit("styles missing")
text = text.replace(old_styles, new_styles, 1)

for _ in range(3):
    text = text.replace(
        "pctTextClass={pctText}\n                    />",
        "pctTextClass={pctText}\n                      relaxed={relaxed}\n                    />",
        1,
    )
text = text.replace(
    "pctTextClass={pctText}\n                  />",
    "pctTextClass={pctText}\n                    relaxed={relaxed}\n                  />",
    1,
)

if "\u8d2d\u4e70\u65b9" not in text:
    raise SystemExit("encoding fix failed")
if "PCT_INSIDE_BAR_MIN_WIDTH" not in text:
    raise SystemExit("ui patch failed")

out.write_text(text, encoding="utf-8")

import subprocess

subprocess.run(
    [sys.executable, str(root / "scripts" / "fix_buyer_column_order.py")],
    check=True,
    cwd=root,
)
subprocess.run(
    [sys.executable, str(root / "scripts" / "patch_buyer_defaults.py")],
    check=True,
    cwd=root,
)
subprocess.run(
    [sys.executable, str(root / "scripts" / "patch_buyer_font_bold.py")],
    check=True,
    cwd=root,
)
print("ok", out)
