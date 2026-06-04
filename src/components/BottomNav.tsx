import { NavLink, useLocation } from 'react-router-dom'
import { scrollAppMainToTop } from '../utils/scrollAppMainTop'

const linkCls =
  'flex flex-1 items-center justify-center py-3 text-sm transition-colors'

export function BottomNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/settings/import-export')) {
    return null
  }

  /** 仅重复点当前 Tab 时滚顶；跨 Tab 由路由切换后再滚，避免先滚旧页再跳转 */
  const scrollIfAlreadyOn = (tabPath: string) => () => {
    if (pathname === tabPath) scrollAppMainToTop()
  }

  return (
    <nav className="kuaiji-nav">
      <NavLink
        to="/"
        end
        onClick={scrollIfAlreadyOn('/')}
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        首页
      </NavLink>
      <NavLink
        to="/stats"
        onClick={scrollIfAlreadyOn('/stats')}
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        统计
      </NavLink>
      <NavLink
        to="/settings"
        onClick={scrollIfAlreadyOn('/settings')}
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        设置
      </NavLink>
    </nav>
  )
}
