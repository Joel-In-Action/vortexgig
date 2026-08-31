import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Avatar from './Avatar'
import { homeFor } from './ProtectedRoute'
import { LogOutIcon, MenuIcon, MoonIcon, SunIcon, XIcon } from './Icons'
import { money } from '../lib/format'

export default function Navbar() {
  const { user, logout, isEmployer } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  // The mobile menu should never survive a navigation.
  useEffect(() => setOpen(false), [location.pathname])

  const isAdmin = user?.role === 'ADMIN'

  const links = !user
    ? [
        { to: '/tasks', label: 'Marketplace' },
        { to: '/leaderboard', label: 'Leaderboard' }
      ]
    : isAdmin
      ? [
          { to: '/admin', label: 'Control centre' },
          { to: '/tasks', label: 'Marketplace' },
          { to: '/leaderboard', label: 'Leaderboard' }
        ]
      : [
          { to: isEmployer ? '/employer' : '/worker', label: 'Workspace' },
          { to: '/tasks', label: 'Marketplace' },
          { to: '/submissions', label: isEmployer ? 'Review queue' : 'My submissions' },
          { to: '/leaderboard', label: 'Leaderboard' }
        ]

  const signOut = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="header__inner">
        <Link to={user ? homeFor(user.role) : '/'} className="brand">
          <span className="brand__mark">V</span>
          VortexGig
        </Link>

        <nav className="nav" data-open={open} aria-label="Primary navigation">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          {user && !isAdmin ? (
            <span className="header__balance" title="Available balance">
              {money(user.available)}
            </span>
          ) : null}

          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={toggle}
            aria-label={isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>

          {user ? (
            <>
              <Link to="/settings" title="Settings" aria-label="Settings">
                <Avatar name={user.name} initials={user.initials} id={user.id} size="sm" />
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOutIcon />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn--ghost btn--sm">
                Sign in
              </Link>
              <Link to="/register" className="btn btn--primary btn--sm">
                Get started
              </Link>
            </>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--icon nav-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
    </header>
  )
}
