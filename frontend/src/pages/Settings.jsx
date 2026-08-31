import { useEffect, useState } from 'react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import {
  formatDate,
  money,
  signedMoney,
  timeAgo,
  TRANSACTION_LABELS
} from '../lib/format'

export default function Settings() {
  const { user, setUser, refresh, isEmployer, isWorker } = useAuth()
  const { isDark, toggle } = useTheme()
  const toast = useToast()

  const [profile, setProfile] = useState({ name: '', headline: '', bio: '' })
  const [wallet, setWallet] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [funds, setFunds] = useState(null)
  const [amount, setAmount] = useState('50.00')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name ?? '',
        headline: user.headline ?? '',
        bio: user.bio ?? ''
      })
    }
  }, [user])

  const loadWallet = () =>
    api
      .get('/wallet')
      .then((res) => setWallet(res.data))
      .catch(() => setWallet(null))

  useEffect(() => {
    loadWallet()
  }, [])

  const saveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    try {
      const { data } = await api.patch('/auth/profile', {
        ...profile,
        emailUpdates: user.emailUpdates,
        darkMode: user.darkMode
      })
      setUser(data)
      toast.success('Saved. That is how people will see you.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  const toggleEmailUpdates = async () => {
    const emailUpdates = !user.emailUpdates
    setUser({ ...user, emailUpdates })
    try {
      await api.patch('/auth/profile', {
        name: user.name,
        headline: user.headline,
        bio: user.bio,
        emailUpdates,
        darkMode: user.darkMode
      })
    } catch (err) {
      setUser({ ...user, emailUpdates: !emailUpdates })
      toast.error(errorMessage(err))
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setSavingPassword(true)
    try {
      await api.post('/auth/password', passwords)
      setPasswords({ currentPassword: '', newPassword: '' })
      toast.success('Password updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingPassword(false)
    }
  }

  const moveMoney = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/wallet/${funds}`, { amount: Number(amount) })
      setWallet(data)
      await refresh()
      toast.success(funds === 'deposit' ? 'Funds added.' : 'On its way to your bank.')
      setFunds(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">Account</div>
          <h1 style={{ fontSize: '2rem' }}>Your VortexGig, your way</h1>
          <p>Keep your profile and the marketplace tuned to you.</p>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <form className="card card--pad-lg stack" onSubmit={saveProfile}>
            <div className="card__head">
              <h3 className="card__title">How people see you</h3>
              <span className="card__hint">
                {isEmployer ? 'Employer account' : 'Worker account'}
              </span>
            </div>

            <div className="row">
              <Avatar name={user.name} initials={user.initials} id={user.id} size="lg" />
              <div>
                <div style={{ fontWeight: 700 }}>{user.name}</div>
                <div className="list__sub">{user.email}</div>
                <div className="list__sub">On VortexGig since {formatDate(user.memberSince)}</div>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                className="input"
                required
                maxLength={120}
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="headline">
                Headline
              </label>
              <input
                id="headline"
                className="input"
                maxLength={160}
                value={profile.headline}
                onChange={(event) => setProfile({ ...profile, headline: event.target.value })}
                placeholder={isEmployer ? 'What your team is building' : 'What you are good at'}
              />
              <span className="field__hint">Shown next to your name across the marketplace.</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="bio">
                About you
              </label>
              <textarea
                id="bio"
                className="textarea"
                value={profile.bio}
                onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                placeholder="A couple of lines is plenty."
              />
            </div>

            <div>
              <button type="submit" className="btn btn--primary" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>

          <div className="card card--pad-lg">
            <div className="card__head">
              <h3 className="card__title">Preferences</h3>
            </div>

            <div className="switch">
              <div>
                <div className="switch__label">Email updates</div>
                <div className="switch__desc">New task matches and submission updates.</div>
              </div>
              <button
                type="button"
                className="switch__control"
                data-on={user.emailUpdates}
                onClick={toggleEmailUpdates}
                aria-pressed={user.emailUpdates}
                aria-label="Email updates"
              />
            </div>

            <div className="switch">
              <div>
                <div className="switch__label">Dark workspace</div>
                <div className="switch__desc">A lower-light view for late shifts.</div>
              </div>
              <button
                type="button"
                className="switch__control"
                data-on={isDark}
                onClick={toggle}
                aria-pressed={isDark}
                aria-label="Dark workspace"
              />
            </div>
          </div>

          <form className="card card--pad-lg stack" onSubmit={changePassword}>
            <div className="card__head">
              <h3 className="card__title">Password</h3>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="currentPassword">
                Current password
              </label>
              <input
                id="currentPassword"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={passwords.currentPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, currentPassword: event.target.value })
                }
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="newPassword">
                New password
              </label>
              <input
                id="newPassword"
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={passwords.newPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, newPassword: event.target.value })
                }
              />
              <span className="field__hint">At least 6 characters.</span>
            </div>

            <div>
              <button type="submit" className="btn btn--outline" disabled={savingPassword}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head">
              <h3 className="card__title">Your wallet</h3>
            </div>

            <div className="price">
              <div className="price__row">
                <span>{isWorker ? 'Ready to withdraw' : 'Available'}</span>
                <strong>{money(wallet?.available ?? user.available)}</strong>
              </div>
              {isWorker ? (
                <div className="price__row">
                  <span>Held while in review</span>
                  <strong>{money(wallet?.pending ?? user.pending)}</strong>
                </div>
              ) : (
                <div className="price__row">
                  <span>Held in escrow</span>
                  <strong>{money(wallet?.escrowHeld ?? 0)}</strong>
                </div>
              )}
              <div className="price__row price__row--total">
                <span>{isWorker ? 'Lifetime earned' : 'Total spent'}</span>
                <strong>
                  {money(isWorker ? (wallet?.lifetimeEarned ?? 0) : (wallet?.totalSpent ?? 0))}
                </strong>
              </div>
            </div>

            <div className="row" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  setFunds('deposit')
                  setAmount('50.00')
                }}
              >
                Add funds
              </button>
              {isWorker ? (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => {
                    setFunds('withdraw')
                    setAmount(String(user.available))
                  }}
                  disabled={Number(user.available) < 1}
                >
                  Withdraw
                </button>
              ) : null}
            </div>

            <p className="field__hint" style={{ marginTop: '0.85rem' }}>
              VortexGig runs on play money — nothing here touches a real bank or a real chain.
            </p>
          </div>

          <div className="card card--flush">
            <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
              <h3 className="card__title">Activity</h3>
            </div>

            {!wallet || wallet.transactions.length === 0 ? (
              <p className="muted" style={{ padding: '0 1.35rem 1.35rem' }}>
                Nothing has moved yet.
              </p>
            ) : (
              <div className="list" style={{ marginTop: '1rem' }}>
                {wallet.transactions.map((tx) => (
                  <div className="list__row" key={tx.id}>
                    <div className="list__main">
                      <div className="list__title">{tx.description}</div>
                      <div className="list__sub">
                        {TRANSACTION_LABELS[tx.type] ?? tx.type} · {timeAgo(tx.createdAt)}
                      </div>
                    </div>
                    <span
                      className={`list__amount ${Number(tx.amount) >= 0 ? 'amount--in' : 'amount--out'}`}
                    >
                      {signedMoney(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {funds ? (
        <Modal
          title={funds === 'deposit' ? 'Add funds' : 'Withdraw to your bank'}
          description={
            funds === 'deposit'
              ? 'Play money, added instantly, so you can keep posting work.'
              : `You have ${money(user.available)} ready to withdraw.`
          }
          onClose={() => setFunds(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setFunds(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={moveMoney}
                disabled={busy || Number(amount) < 1}
              >
                {busy ? 'Working…' : funds === 'deposit' ? 'Add funds' : 'Withdraw'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label className="field__label" htmlFor="amount">
                Amount
              </label>
              <div className="input-prefix">
                <span className="input-prefix__symbol">$</span>
                <input
                  id="amount"
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </div>

          </div>
        </Modal>
      ) : null}
    </main>
  )
}
