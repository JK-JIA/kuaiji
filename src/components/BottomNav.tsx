import { NavLink, useLocation } from 'react-router-dom'

const linkCls =
  'flex flex-1 items-center justify-center py-3 text-sm transition-colors'

export function BottomNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/settings/import-export')) {
    return null
  }
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-stone-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-stone-900' : 'text-stone-400'}`
        }
      >
        首页
      </NavLink>
      <NavLink
        to="/stats"
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-stone-900' : 'text-stone-400'}`
        }
      >
        统计
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `${linkCls} ${isActive ? 'font-medium text-stone-900' : 'text-stone-400'}`
        }
      >
        设置
      </NavLink>
    </nav>
  )
}
