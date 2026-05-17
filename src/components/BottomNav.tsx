import { NavLink, useLocation } from 'react-router-dom'

const linkCls =
  'flex flex-1 items-center justify-center py-3 text-sm transition-colors'

export function BottomNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/settings/import-export')) {
    return null
  }
  return (
    <nav className="kuaiji-nav">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        首页
      </NavLink>
      <NavLink
        to="/stats"
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        统计
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-kj-primary' : 'text-kj-muted'}`
        }
      >
        设置
      </NavLink>
    </nav>
  )
}
