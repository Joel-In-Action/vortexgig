import { useCallback, useEffect, useState } from 'react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { Badge, StatusBadge } from '../components/Badges'
import { SkeletonLine } from '../components/Skeletons'
import { CheckIcon, SearchIcon, ShieldIcon, TrophyIcon, XIcon } from '../components/Icons'
import { money, signedMoney, timeAgo, TRANSACTION_LABELS } from '../lib/format'

const TABS = [
  { value: 'disputes', label: 'Disputes' },
  { value: 'users', label: 'Users' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'settings', label: 'Settings' }
]

export default function Admin() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('disputes')
  const [revenue, setRevenue] = useState(null)
  const [disputes, setDisputes] = useState(null)
  const [users, setUsers] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const [ruling, setRuling] = useState(null)
  const [rulingNote, setRulingNote] = useState('')
  const [settings, setSettings] = useState({ feePercent: '', rewardPoolPercent: '' })

  const loadRevenue = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/revenue')
      setRevenue(data)
      setSettings({
        feePercent: String(data.feePercent),
        rewardPoolPercent: String(data.rewardPoolPercent)
      })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }, [toast])

  const loadDisputes = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/disputes')
      setDisputes(data)
    } catch (err) {
      toast.error(errorMessage(err))
      setDisputes([])
    }
  }, [toast])

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/users', {
        params: { search: userSearch || undefined, role: roleFilter || undefined }
      })
      setUsers(data)
    } catch (err) {
      toast.error(errorMessage(err))
      setUsers([])
    }
  }, [userSearch, roleFilter, toast])

  const loadLedger = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/ledger')
      setLedger(data)
    } catch (err) {
      toast.error(errorMessage(err))
      setLedger([])
    }
  }, [toast])

  // The header stats sit above every tab, so revenue always loads.
  useEffect(() => {
    loadRevenue()
    loadDisputes()
  }, [loadRevenue, loadDisputes])

  useEffect(() => {
    if (tab !== 'users') return undefined
    const timer = setTimeout(loadUsers, 250)
    return () => clearTimeout(timer)
  }, [tab, loadUsers])

  useEffect(() => {
    if (tab === 'ledger' && ledger === null) loadLedger()
  }, [tab, ledger, loadLedger])

  const rule = async () => {
    setBusy(true)
    try {
      await api.post(`/admin/disputes/${ruling.submission.id}/resolve`, {
        favour: ruling.favour,
        resolution: rulingNote
      })
      toast.success(
        ruling.favour === 'WORKER' ? 'Ruled for the worker — payout released.' : 'Ruled for the employer.'
      )
      setRuling(null)
      setRulingNote('')
      await Promise.all([loadDisputes(), loadRevenue()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setUserStatus = async (target, status) => {
    setBusy(true)
    try {
      await api.patch(`/admin/users/${target.id}/status`, { status })
      toast.success(status === 'SUSPENDED' ? `${target.name} suspended.` : `${target.name} reinstated.`)
      await loadUsers()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.patch('/admin/settings', {
        feePercent: Number(settings.feePercent),
        rewardPoolPercent: Number(settings.rewardPoolPercent)
      })
      toast.success('Settings saved. New tasks will use the new fee.')
      await loadRevenue()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const distribute = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/admin/reward-pool/distribute')
      toast.success(`Paid ${money(data.totalAmount)} to ${data.recipients} workers.`)
      await loadRevenue()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page--wide">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">Admin control centre</div>
          <h1 style={{ fontSize: '2rem' }}>Keeping it fair.</h1>
          <p>Moderation, disputes, revenue and the reward pool — {user?.name}.</p>
        </div>
      </div>

      <div className="grid grid--4" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          label="Service fee revenue"
          value={revenue ? money(revenue.feesAllTime) : '—'}
          hint={revenue ? `${money(revenue.feesThisMonth)} in the last 30 days` : 'Loading'}
          accent
        />
        <StatCard
          label="Paid to workers"
          value={revenue ? money(revenue.paidOut) : '—'}
          hint={revenue ? `across ${revenue.workers} workers` : 'Loading'}
        />
        <StatCard
          label="Reward pool"
          value={revenue ? money(revenue.rewardPoolAvailable) : '—'}
          hint={revenue ? `${revenue.rewardPoolPercent}% of fees since last cycle` : 'Loading'}
        />
        <StatCard
          label="Open disputes"
          value={revenue ? revenue.openDisputes : '—'}
          hint={revenue ? `${revenue.users} accounts · ${revenue.workers} workers` : 'Loading'}
        />
      </div>

      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="tabs__tab"
            data-active={tab === option.value}
            onClick={() => setTab(option.value)}
          >
            {option.label}
            {option.value === 'disputes' && disputes?.length ? ` (${disputes.length})` : ''}
          </button>
        ))}
      </div>

      {/* ---- Disputes ---- */}
      {tab === 'disputes' ? (
        disputes === null ? (
          <div className="card stack">
            <SkeletonLine width="40%" height="1.1rem" />
            <SkeletonLine />
          </div>
        ) : disputes.length === 0 ? (
          <EmptyState
            icon={<ShieldIcon size={20} />}
            title="Nothing in dispute"
            text="Both sides are settling things between themselves. That is the good outcome."
          />
        ) : (
          <div className="card card--flush">
            <div className="list">
              {disputes.map((dispute) => (
                <div className="list__row" key={dispute.id} style={{ alignItems: 'flex-start' }}>
                  <Avatar
                    name={dispute.worker?.name}
                    initials={dispute.worker?.initials}
                    id={dispute.worker?.id}
                    size="sm"
                  />
                  <div className="list__main">
                    <div className="row row--between" style={{ gap: '0.6rem' }}>
                      <span className="list__title">{dispute.task?.title}</span>
                      <span className="list__amount">
                        {money(dispute.reward)}
                      </span>
                    </div>
                    <div className="list__sub">
                      {dispute.worker?.name} vs. {dispute.task?.employerName} · raised by{' '}
                      {dispute.disputedBy === 'WORKER' ? 'the worker' : 'the employer'}{' '}
                      {timeAgo(dispute.disputedAt)}
                    </div>

                    <div className="stat__label" style={{ marginTop: '0.75rem' }}>
                      The claim
                    </div>
                    <div className="proof" style={{ marginTop: '0.35rem' }}>
                      {dispute.disputeReason}
                    </div>

                    <div className="stat__label" style={{ marginTop: '0.75rem' }}>
                      The proof submitted
                    </div>
                    <div className="proof" style={{ marginTop: '0.35rem' }}>
                      {dispute.proofText}
                    </div>

                    {dispute.feedback ? (
                      <p className="list__sub" style={{ marginTop: '0.5rem' }}>
                        Employer's note: {dispute.feedback}
                      </p>
                    ) : null}

                    <div className="row" style={{ marginTop: '0.85rem' }}>
                      <button
                        type="button"
                        className="btn btn--success btn--sm"
                        onClick={() => {
                          setRuling({ submission: dispute, favour: 'WORKER' })
                          setRulingNote('')
                        }}
                        disabled={busy}
                      >
                        <CheckIcon size={14} />
                        Rule for the worker
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => {
                          setRuling({ submission: dispute, favour: 'EMPLOYER' })
                          setRulingNote('')
                        }}
                        disabled={busy}
                      >
                        <XIcon size={14} />
                        Rule for the employer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {/* ---- Users ---- */}
      {tab === 'users' ? (
        <>
          <div className="filters" style={{ gridTemplateColumns: 'minmax(12rem, 2fr) minmax(8rem, 1fr)' }}>
            <div className="field filters__search">
              <label className="field__label" htmlFor="userSearch">
                Search
              </label>
              <SearchIcon size={16} />
              <input
                id="userSearch"
                className="input"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Name or email"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="roleFilter">
                Role
              </label>
              <select
                id="roleFilter"
                className="select"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="">All roles</option>
                <option value="EMPLOYER">Employers</option>
                <option value="WORKER">Workers</option>
                <option value="ADMIN">Admins</option>
              </select>
            </div>
          </div>

          {users === null ? (
            <div className="card stack">
              <SkeletonLine />
              <SkeletonLine width="70%" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="No accounts match" text="Try a different name or clear the filter." />
          ) : (
            <div className="card card--flush">
              <div className="list">
                {users.map((account) => (
                  <div className="list__row" key={account.id}>
                    <Avatar
                      name={account.name}
                      initials={account.initials}
                      id={account.id}
                      size="sm"
                    />
                    <div className="list__main">
                      <div className="row" style={{ gap: '0.5rem' }}>
                        <span className="list__title">{account.name}</span>
                        <Badge>{account.role.toLowerCase()}</Badge>
                        <StatusBadge status={account.status} />
                      </div>
                      <div className="list__sub">
                        {account.email}
                        {' · '}joined {timeAgo(account.memberSince)}
                      </div>
                    </div>
                    <span className="list__amount">{money(account.available)}</span>
                    {account.role === 'ADMIN' ? null : account.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => setUserStatus(account, 'SUSPENDED')}
                        disabled={busy}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => setUserStatus(account, 'ACTIVE')}
                        disabled={busy}
                      >
                        Reinstate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* ---- Revenue ---- */}
      {tab === 'revenue' && revenue ? (
        <div className="split">
          <div className="card card--pad-lg">
            <div className="card__head">
              <h3 className="card__title">Service fee revenue</h3>
              <span className="card__hint">Platform tax on funded tasks</span>
            </div>
            <div className="price">
              <div className="price__row">
                <span>Last 7 days</span>
                <strong>{money(revenue.feesThisWeek)}</strong>
              </div>
              <div className="price__row">
                <span>Last 30 days</span>
                <strong>{money(revenue.feesThisMonth)}</strong>
              </div>
              <div className="price__row price__row--total">
                <span>All time</span>
                <strong>{money(revenue.feesAllTime)}</strong>
              </div>
            </div>

            <div className="divider" />

            <div className="card__head">
              <h3 className="card__title">Where it went</h3>
            </div>
            <div className="price">
              <div className="price__row">
                <span>Paid to workers</span>
                <strong>{money(revenue.paidOut)}</strong>
              </div>
              <div className="price__row">
                <span>Reward pool bonuses paid</span>
                <strong>{money(revenue.bonusesPaid)}</strong>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card__head">
                <h3 className="card__title">Reward pool</h3>
              </div>
              <div className="stat__value" style={{ color: 'hsl(var(--primary))' }}>
                {money(revenue.rewardPoolAvailable)}
              </div>
              <p className="field__hint" style={{ marginTop: '0.5rem' }}>
                {revenue.rewardPoolPercent}% of the service fees collected since the last cycle.
                Distributing it splits the pool across the top 10 workers of this cycle, in
                proportion to what each of them earned.
              </p>
              <button
                type="button"
                className="btn btn--primary btn--full"
                style={{ marginTop: '1rem' }}
                onClick={distribute}
                disabled={busy || Number(revenue.rewardPoolAvailable) < 1}
              >
                <TrophyIcon size={16} />
                Distribute the pool
              </button>
            </div>

            <div className="card card--flush">
              <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
                <h3 className="card__title">Past cycles</h3>
              </div>
              {revenue.cycles.length === 0 ? (
                <p className="muted" style={{ padding: '0 1.35rem 1.35rem' }}>
                  No cycles have been paid out yet.
                </p>
              ) : (
                <div className="list" style={{ marginTop: '1rem' }}>
                  {revenue.cycles.map((cycle) => (
                    <div className="list__row" key={cycle.id}>
                      <div className="list__main">
                        <div className="list__title">
                          {cycle.recipients} {cycle.recipients === 1 ? 'worker' : 'workers'}
                        </div>
                        <div className="list__sub">Paid {timeAgo(cycle.periodEnd)}</div>
                      </div>
                      <span className="list__amount amount--in">{money(cycle.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- Ledger ---- */}
      {tab === 'ledger' ? (
        ledger === null ? (
          <div className="card stack">
            <SkeletonLine />
            <SkeletonLine width="80%" />
          </div>
        ) : ledger.length === 0 ? (
          <EmptyState title="Nothing has moved yet" text="Transactions across every account appear here." />
        ) : (
          <div className="card card--flush">
            <div className="list">
              {ledger.map((entry) => (
                <div className="list__row" key={entry.transaction.id}>
                  <Avatar
                    name={entry.user.name}
                    initials={entry.user.initials}
                    id={entry.user.id}
                    size="sm"
                  />
                  <div className="list__main">
                    <div className="list__title">{entry.transaction.description}</div>
                    <div className="list__sub">
                      {entry.user.name} · {TRANSACTION_LABELS[entry.transaction.type] ?? entry.transaction.type} ·{' '}
                      {timeAgo(entry.transaction.createdAt)}

                    </div>
                  </div>
                  <span
                    className={`list__amount ${Number(entry.transaction.amount) >= 0 ? 'amount--in' : 'amount--out'}`}
                  >
                    {signedMoney(entry.transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {/* ---- Settings ---- */}
      {tab === 'settings' ? (
        <form className="card card--pad-lg stack" style={{ maxWidth: '32rem' }} onSubmit={saveSettings}>
          <div className="card__head">
            <h3 className="card__title">Fee settings</h3>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="feePercent">
              Service fee / platform tax
            </label>
            <div className="input-prefix">
              <input
                id="feePercent"
                className="input"
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={settings.feePercent}
                onChange={(event) => setSettings({ ...settings, feePercent: event.target.value })}
              />
              <span className="input-prefix__symbol" style={{ paddingRight: '0.8rem' }}>
                %
              </span>
            </div>
            <span className="field__hint">
              Charged to the employer on top of the task budget. Tasks already published keep the
              fee they were charged.
            </span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="rewardPoolPercent">
              Reward pool share
            </label>
            <div className="input-prefix">
              <input
                id="rewardPoolPercent"
                className="input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={settings.rewardPoolPercent}
                onChange={(event) =>
                  setSettings({ ...settings, rewardPoolPercent: event.target.value })
                }
              />
              <span className="input-prefix__symbol" style={{ paddingRight: '0.8rem' }}>
                %
              </span>
            </div>
            <span className="field__hint">
              The share of fee revenue that funds bonuses for top-ranked workers.
            </span>
          </div>

          <div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      ) : null}

      {ruling ? (
        <Modal
          title={ruling.favour === 'WORKER' ? 'Rule for the worker?' : 'Rule for the employer?'}
          description={
            ruling.favour === 'WORKER'
              ? `${money(ruling.submission.reward)} is released from escrow to ${ruling.submission.worker?.name}.`
              : 'The slot goes back on the board and the escrow stays with the task.'
          }
          onClose={() => setRuling(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setRuling(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={ruling.favour === 'WORKER' ? 'btn btn--success' : 'btn btn--danger'}
                onClick={rule}
                disabled={busy || !rulingNote.trim()}
              >
                {busy ? 'Saving…' : 'Publish the ruling'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label" htmlFor="rulingNote">
              The ruling
            </label>
            <textarea
              id="rulingNote"
              className="textarea"
              value={rulingNote}
              onChange={(event) => setRulingNote(event.target.value)}
              placeholder="Both sides will see this, so make the reasoning plain."
            />
          </div>
        </Modal>
      ) : null}
    </main>
  )
}
