# -*- coding: utf-8 -*-
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]

# Full restore first
subprocess.run([sys.executable, str(root / "scripts" / "restore_stats_page.py")], check=True, cwd=root)

path = root / "src" / "pages" / "StatsPage.tsx"
text = path.read_text(encoding="utf-8")

old = """const PCT_LABEL_BY_BAR: Record<string, string> = {
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
  const barH = relaxed ? 'h-5' : 'h-4'
  const pctClass =
    PCT_LABEL_BY_BAR[barClassName] ?? 'text-kj-secondary'

  return (
    <div className={relaxed ? 'space-y-1' : 'space-y-0.5'}>
      <div className={valLineClass}>{valueLine}</div>
      <div className="flex w-full min-w-0 items-center gap-1">
        <div
          className={`${barH} shrink-0 rounded-full ${barClassName}`}
          style={{ width: `${w}%` }}
        />
        <span
          className={`shrink-0 whitespace-nowrap tabular-nums ${pctTextClass} ${pctClass}`}
        >
          {pctLabel}
        </span>
      </div>
    </div>
  )
}"""

new = """const PCT_INSIDE_BAR_MIN_WIDTH = 25

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

if old not in text:
    raise SystemExit("block not found")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("patched", path)
