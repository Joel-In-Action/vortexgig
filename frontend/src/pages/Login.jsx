import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const expired = searchParams.get('expired') === '1'

  if (!loading && user) {
    return <Navigate to={user.role === 'EMPLOYER' ? '/employer' : '/worker'} replace />
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const signedIn = await login(email.trim(), password)
      // Back to wherever they were headed before the gate stopped them.
      const target = location.state?.from
      navigate(target || (signedIn.role === 'EMPLOYER' ? '/employer' : '/worker'), { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'That email and password do not match.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__head">
          <h1>Welcome back</h1>
          <p>Good to see you again.</p>
        </div>

        {expired ? (
          <div className="alert alert--info" style={{ marginBottom: '1rem' }}>
            Your session expired. Sign in again to pick up where you left off.
          </div>
        ) : null}

        {error ? (
          <div className="alert alert--error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        ) : null}

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <span className="field__hint">Use the email you joined with.</span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth__foot">
          New to VortexGig? <Link to="/register">Create an account</Link>
        </p>

        <div className="auth__demo">
          <strong>Demo accounts</strong>
          <br />
          Employer: <code>maya@vortexgig.com</code>
          <br />
          Worker: <code>sam@vortexgig.com</code>
          <br />
          Password: <code>vortex123</code>
        </div>
      </div>
    </main>
  )
}
