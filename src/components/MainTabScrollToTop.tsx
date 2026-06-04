import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isMainTabPath, scrollAppMainToTop } from '../utils/scrollAppMainTop'

/** 切换首页 / 统计 / 设置路由后滚到新页顶部（不在旧页先滚） */
export function MainTabScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    if (isMainTabPath(pathname)) scrollAppMainToTop()
  }, [pathname])

  return null
}
