import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

const ROLES = [
  {
    value: 'EMPLOYER',
    title: 'I need work done',
    desc: 'Post clear tasks and get reliable outcomes.'
  },
  {
    value: 'WORKER',
    title: 'I want to earn',
    desc: 'Find flexible work and get paid for momentum.'
  }
]

export default function Register() {
  const { user, register, loading } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'WORKER' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return <Navigate to={user.role === 'EMPLOYER' ? '/employer' : '/worker'} replace />
  }

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await register({ ...form, name: form.name.trim(), email: form.email.trim() })
      navigate(created.role === 'EMPLOYER' ? '/employer' : '/worker', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not create that account. Check the fields and try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__head">
          <h1>Create your account</h1>
          <p>Find your lane — you can browse the whole marketplace either way.</p>
        </div>

        {error ? (
          <div className="alert alert--error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        ) : null}

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <span className="field__label">Pick your starting point</span>
            <div className="choice">
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className="choice__option"
                  data-selected={form.role === role.value}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={form.role === role.value}
                    onChange={update('role')}
                  />
                  <span className="choice__title">{role.title}</span>
                  <span className="choice__desc">{role.desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="input"
              required
              maxLength={120}
              value={form.name}
              onChange={update('name')}
              placeholder="How should we call you?"
            />
          </div>

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
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={form.password}
              onChange={update('password')}
            />
            <span className="field__hint">At least 6 characters.</span>
          </div>

          <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="auth__foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
