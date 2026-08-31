import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'vortexgig.theme'

function initialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)
  const { user, setUser } = useAuth()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // The account's saved preference wins once we know who is signed in, so the
  // choice follows the person across browsers.
  useEffect(() => {
    if (user) {
      setTheme(user.darkMode ? 'dark' : 'light')
    }
  }, [user])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (user) {
      const darkMode = next === 'dark'
      setUser({ ...user, darkMode })
      // Persisted quietly; a failed write just means it stays local for now.
      api
        .patch('/auth/profile', {
          name: user.name,
          headline: user.headline,
          bio: user.bio,
          emailUpdates: user.emailUpdates,
          darkMode
        })
        .catch(() => {})
    }
  }, [theme, user, setUser])

  const value = useMemo(() => ({ theme, setTheme, toggle, isDark: theme === 'dark' }), [theme, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return context
}
