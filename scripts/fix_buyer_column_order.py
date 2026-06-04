# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "pages" / "StatsPage.tsx"
text = path.read_text(encoding="utf-8")

old_head = """          <SortableBuyerSummaryTh
            label={`总${qtyUnitLabel}`}
            sortKey="jin"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
            widthClass={metricW}
          />
          <SortableBuyerSummaryTh
            label="总金额"
            sortKey="amount"
            sort={sort}
            onSortKey={onSortKey}
            disabled={!amountId}
            relaxed={relaxed}
            widthClass={metricW}
          />
          {hasOutCol ? (
            <SortableBuyerSummaryTh
              label="未核账"
              sortKey="outstanding"
              sort={sort}
              onSortKey={onSortKey}
              relaxed={relaxed}
              widthClass={metricW}
            />
          ) : null}"""

new_head = """          {hasOutCol ? (
            <SortableBuyerSummaryTh
              label="未核账"
              sortKey="outstanding"
              sort={sort}
              onSortKey={onSortKey}
              relaxed={relaxed}
              widthClass={metricW}
            />
          ) : null}
          <SortableBuyerSummaryTh
            label="总金额"
            sortKey="amount"
            sort={sort}
            onSortKey={onSortKey}
            disabled={!amountId}
            relaxed={relaxed}
            widthClass={metricW}
          />
          <SortableBuyerSummaryTh
            label={`总${qtyUnitLabel}`}
            sortKey="jin"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
            widthClass={metricW}
          />"""

if old_head not in text:
    raise SystemExit("head block not found")
text = text.replace(old_head, new_head, 1)

old_row = """              <td className={onBuyerClick ? 'p-0' : tdText}>{buyerCell}</td>
              <td className={metricTd}>
                {row.jin > 0 ? (
                  <StatsShareMetricCell
                    valueLine={`${fmtNum(row.jin)} ${qtyUnitLabel}`}
                    pct={jinPct}
                    barPct={jinBar}
                    barClassName="bg-teal-500"
                    valLineClass={valLine}
                    pctTextClass={pctText}
                    relaxed={relaxed}
                  />
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
              <td className={metricTd}>
                {amountId ? (
                  row.amount > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`${fmtMoney(row.amount)} 元`}
                      pct={amtPct}
                      barPct={amtBar}
                      barClassName="bg-[#1a7f4c]"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
              {hasOutCol ? (
                <td className={metricTd}>
                  {row.outstanding > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`¥${fmtMoney(row.outstanding)}`}
                      pct={outPct}
                      barPct={outBar}
                      barClassName="bg-amber-500"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )}
                </td>
              ) : null}"""

new_row = """              <td className={onBuyerClick ? 'p-0' : tdText}>{buyerCell}</td>
              {hasOutCol ? (
                <td className={metricTd}>
                  {row.outstanding > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`¥${fmtMoney(row.outstanding)}`}
                      pct={outPct}
                      barPct={outBar}
                      barClassName="bg-amber-500"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )}
                </td>
              ) : null}
              <td className={metricTd}>
                {amountId ? (
                  row.amount > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`${fmtMoney(row.amount)} 元`}
                      pct={amtPct}
                      barPct={amtBar}
                      barClassName="bg-[#1a7f4c]"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
              <td className={metricTd}>
                {row.jin > 0 ? (
                  <StatsShareMetricCell
                    valueLine={`${fmtNum(row.jin)} ${qtyUnitLabel}`}
                    pct={jinPct}
                    barPct={jinBar}
                    barClassName="bg-teal-500"
                    valLineClass={valLine}
                    pctTextClass={pctText}
                    relaxed={relaxed}
                  />
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>"""

if old_row not in text:
    raise SystemExit("row block not found")
text = text.replace(old_row, new_row, 1)

path.write_text(text, encoding="utf-8")
print("column order fixed")
