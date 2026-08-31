import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import TaskCard from '../components/TaskCard'
import EmptyState from '../components/EmptyState'
import { StatusBadge } from '../components/Badges'
import { StatsSkeleton } from '../components/Skeletons'
import { ArrowRightIcon, CoinIcon, SparkIcon } from '../components/Icons'
import { money, signedMoney, timeAgo, TRANSACTION_LABELS } from '../lib/format'

export default function WorkerDashboard() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () =>
    api
      .get('/dashboard/worker')
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)))

  useEffect(() => {
    load()
  }, [])

  const withdraw = async () => {
    setBusy(true)
    try {
      await api.post('/wallet/withdraw', { amount: Number(amount) })
      toast.success('On its way.')
      setWithdrawing(false)
      await Promise.all([load(), refresh()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <main className="page">
        <div className="alert alert--error">{error}</div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="page">
        <div className="stack stack--loose">
          <StatsSkeleton />
          <div className="skeleton" style={{ height: '16rem' }} />
        </div>
      </main>
    )
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <main className="page page--wide">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">Worker workspace</div>
          <h1 style={{ fontSize: '2rem' }}>Your work, in motion.</h1>
          <p>
            {data.completed > 0
              ? `Progress looks good on you, ${firstName}.`
              : `Welcome in, ${firstName}. Claim a task and your trail starts here.`}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => {
              setAmount(String(user?.available ?? '0'))
              setWithdrawing(true)
            }}
            disabled={Number(user?.available ?? 0) < 1}
          >
            <CoinIcon size={16} />
            Withdraw
          </button>
          <Link to="/tasks" className="btn btn--primary">
            Find tasks
            <ArrowRightIcon size={16} />
          </Link>
        </div>
      </div>

      <div className="grid grid--4" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          label="Available balance"
          value={money(data.available)}
          hint="Ready to withdraw"
          accent
        />
        <StatCard
          label="Pending balance"
          value={money(data.pending)}
          hint={data.inReview > 0 ? `${data.inReview} in review` : 'Nothing in review'}
        />
        <StatCard
          label="Lifetime earned"
          value={money(data.lifetimeEarned)}
          hint={`${data.completed} completed ${data.completed === 1 ? 'task' : 'tasks'}`}
        />
        <StatCard
          label="Completion rate"
          value={data.completionRate === null ? '—' : `${data.completionRate}%`}
          hint={data.completionRate === null ? 'No reviews yet' : 'Approved vs. reviewed'}
        />
      </div>

      <div className="split">
        <div className="stack">
          <div className="card card--flush">
            <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
              <h3 className="card__title">Your paper trail</h3>
              <Link to="/submissions" className="card__hint">
                See all
              </Link>
            </div>

            {data.recentSubmissions.length === 0 ? (
              <div style={{ padding: '0 1.35rem 1.35rem' }}>
                <EmptyState
                  title="Your trail starts here"
                  text="Claim a task and submit your first proof to see it here."
                  action={
                    <Link to="/tasks" className="btn btn--primary btn--sm">
                      Browse the marketplace
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="list" style={{ marginTop: '1rem' }}>
                {data.recentSubmissions.map((submission) => (
                  <Link
                    to={`/tasks/${submission.task?.id}`}
                    className="list__row list__row--clickable"
                    key={submission.id}
                  >
                    <div className="list__main">
                      <div className="list__title">{submission.task?.title}</div>
                      <div className="list__sub">
                        {submission.task?.employerName} ·{' '}
                        {submission.reviewedAt
                          ? `reviewed ${timeAgo(submission.reviewedAt)}`
                          : submission.submittedAt
                            ? `submitted ${timeAgo(submission.submittedAt)}`
                            : `claimed ${timeAgo(submission.claimedAt)}`}
                      </div>
                    </div>
                    <StatusBadge status={submission.status} />
                    <span className="list__amount">{money(submission.reward)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="page-head" style={{ marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem' }}>Next up</h2>
                <p style={{ fontSize: '0.9rem' }}>Open work you have not claimed yet.</p>
              </div>
            </div>

            {data.nextUp.length === 0 ? (
              <EmptyState
                icon={<SparkIcon size={20} />}
                title="You are caught up"
                text="Nothing new on the board right now. Check back shortly."
              />
            ) : (
              <div className="task-grid">
                {data.nextUp.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head">
              <h3 className="card__title">Weekly progress</h3>
            </div>
            <div className="stack stack--tight">
              <div className="price__row">
                <span>Approved this week</span>
                <strong>{data.approvedThisWeek}</strong>
              </div>
              <div className="price__row">
                <span>Earned this week</span>
                <strong>{money(data.earnedThisWeek)}</strong>
              </div>
              <div className="price__row">
                <span>Active right now</span>
                <strong>{data.active}</strong>
              </div>
            </div>
            <p className="field__hint" style={{ marginTop: '0.85rem' }}>
              {data.approvedThisWeek > 0
                ? 'Keep the rhythm — every completed task moves you closer to the next unlock.'
                : 'Complete a task this week to put your name in the running.'}
            </p>
            <div className="divider" />
            <Link to="/leaderboard" className="btn btn--outline btn--full btn--sm">
              View leaderboard
            </Link>
          </div>

          <div className="card card--flush">
            <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
              <h3 className="card__title">Latest signals</h3>
            </div>

            {data.activity.length === 0 ? (
              <div style={{ padding: '0 1.35rem 1.35rem' }}>
                <EmptyState
                  icon={<CoinIcon size={20} />}
                  title="No movement yet"
                  text="Approved or pending work will appear here."
                />
              </div>
            ) : (
              <div className="list" style={{ marginTop: '1rem' }}>
                {data.activity.map((tx) => (
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

      {withdrawing ? (
        <Modal
          title="Withdraw your earnings"
          description={`${money(user?.available)} is ready to withdraw.`}
          onClose={() => setWithdrawing(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setWithdrawing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={withdraw}
                disabled={busy || Number(amount) < 1}
              >
                {busy ? 'Sending…' : 'Withdraw'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label className="field__label" htmlFor="withdrawAmount">
                Amount
              </label>
              <div className="input-prefix">
                <span className="input-prefix__symbol">$</span>
                <input
                  id="withdrawAmount"
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
