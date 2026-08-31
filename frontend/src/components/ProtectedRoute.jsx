import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Where each role lands when it has no business on the page it asked for. */
export function homeFor(role) {
  if (role === 'ADMIN') return '/admin'
  return role === 'EMPLOYER' ? '/employer' : '/worker'
}

/**
 * Gate for signed-in pages. `role` additionally pins a route to one side of the
 * marketplace; the wrong role is sent to its own workspace rather than being
 * shown an error, since the page simply is not theirs.
 */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page">
        <div className="stack">
          <div className="skeleton" style={{ height: '2rem', width: '14rem' }} />
          <div className="skeleton" style={{ height: '12rem' }} />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (role && user.role !== role) {
    return <Navigate to={homeFor(user.role)} replace />
  }

  return children
}
