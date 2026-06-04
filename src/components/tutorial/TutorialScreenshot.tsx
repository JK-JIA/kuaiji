type Props = {
  src: string
  alt: string
}

/** 教程用真实界面截图 */
export function TutorialScreenshot({ src, alt }: Props) {
  return (
    <img
      src={src}
      alt={alt}
      className="mx-auto block w-full max-w-[300px] rounded-lg border border-kj-border-strong bg-white shadow-sm"
      loading="lazy"
      decoding="async"
    />
  )
}

export const TUTORIAL_STATS_PRODUCT_PIE = '/tutorial/stats-product-pie.png'
export const TUTORIAL_STATS_BUYER_OUTSTANDING =
  '/tutorial/stats-buyer-outstanding.png'
