import type { ProductCatalogEntry } from '../types'
import { unitsForProduct } from '../utils/productCatalogHelpers'

type Props = {
  productName: string
  catalog: ProductCatalogEntry[]
  value: string
  onChange: (unit: string) => void
  className?: string
  'aria-label'?: string
}

export function QuantityUnitSelect({
  productName,
  catalog,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const units = unitsForProduct(productName, catalog)
  const effective = value || units.find((u) => u.isDefault)?.name || units[0]?.name || '斤'

  return (
    <select
      value={effective}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        'rounded-xl border border-kj-border-strong bg-kj-raised px-1 py-2 text-center text-xs font-medium text-kj-primary'
      }
      aria-label={ariaLabel ?? '数量单位'}
    >
      {units.map((u) => (
        <option key={u.name} value={u.name}>
          {u.name}
        </option>
      ))}
    </select>
  )
}
