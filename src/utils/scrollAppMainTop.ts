/** 主 Tab（首页 / 统计 / 设置）使用 window 滚动，切换时回到顶部 */
export function isMainTabPath(pathname: string) {
  return pathname === '/' || pathname === '/stats' || pathname === '/settings'
}

export function scrollAppMainToTop() {
  const run = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  run()
  requestAnimationFrame(run)
  window.setTimeout(run, 0)
}
