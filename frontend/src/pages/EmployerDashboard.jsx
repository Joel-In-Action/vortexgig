import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { StatusBadge } from '../components/Badges'
import { StatsSkeleton } from '../components/Skeletons'
import { CheckIcon, CoinIcon, LinkIcon, PlusIcon, XIcon } from '../components/Icons'
import { money, signedMoney, timeAgo, TRANSACTION_LABELS } from '../lib/format'

export default function EmployerDashboard() {
  const { user, refresh } = useAuth()
  const toast = useToast()

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [funding, setFunding] = useState(false)
  const [fundAmount, setFundAmount] = useState('250.00')

  const load = useCallback(async () => {
    try {
      const { data: dashboard } = await api.get('/dashboard/employer')
      setData(dashboard)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const decide = async () => {
    setBusy(true)
    try {
      await api.post(`/submissions/${review.submission.id}/${review.action}`, {
        feedback: reviewNote
      })
      toast.success(review.action === 'approve' ? 'Approved and paid.' : 'Sent back with your note.')
      setReview(null)
      setReviewNote('')
      await Promise.all([load(), refresh()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addFunds = async () => {
    setBusy(true)
    try {
      await api.post('/wallet/deposit', { amount: Number(fundAmount) })
      toast.success('Funds added. Ready to post.')
      setFunding(false)
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
          <div className="page-head__eyebrow">Employer workspace</div>
          <h1 style={{ fontSize: '2rem' }}>Your control panel.</h1>
          <p>
            {data.pendingReviews > 0
              ? `${data.pendingReviews} ${data.pendingReviews === 1 ? 'submission is' : 'submissions are'} ready for your eye, ${firstName}.`
              : `Nothing waiting on you right now, ${firstName}.`}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--outline" onClick={() => setFunding(true)}>
            <CoinIcon size={16} />
            Add funds
          </button>
          <Link to="/tasks/new" className="btn btn--primary">
            <PlusIcon size={16} />
            Post a task
          </Link>
        </div>
      </div>

      <div className="grid grid--4" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          label="Available balance"
          value={money(data.available)}
          hint="Ready to fund new work"
          accent
        />
        <StatCard
          label="Held in escrow"
          value={money(data.escrowHeld)}
          hint="Across your open tasks"
        />
        <StatCard
          label="Active tasks"
          value={data.activeTasks}
          hint={`${data.pendingReviews} pending ${data.pendingReviews === 1 ? 'review' : 'reviews'}`}
        />
        <StatCard
          label="Total spent"
          value={money(data.totalSpent)}
          hint={`${data.approvedCount} approved · ${data.contributors} ${data.contributors === 1 ? 'contributor' : 'contributors'}`}
        />
      </div>

      <div className="split">
        <div className="stack">
          <div className="card card--flush">
            <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
              <h3 className="card__title">Review queue</h3>
              <span className="card__hint">
                {data.reviewQueue.length > 0 ? 'Give good work a quick, clear answer.' : 'All clear'}
              </span>
            </div>

            {data.reviewQueue.length === 0 ? (
              <div style={{ padding: '0 1.35rem 1.35rem' }}>
                <EmptyState
                  icon={<CheckIcon size={20} />}
                  title="Your board is clear"
                  text="Nothing is waiting on your review. Post a task to keep the work flowing."
                  action={
                    <Link to="/tasks/new" className="btn btn--primary btn--sm">
                      Post a task
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="list" style={{ marginTop: '1rem' }}>
                {data.reviewQueue.map((submission) => (
                  <div
                    className="list__row"
                    key={submission.id}
                    style={{ alignItems: 'flex-start' }}
                  >
                    <Avatar
                      name={submission.worker?.name}
                      initials={submission.worker?.initials}
                      id={submission.worker?.id}
                      size="sm"
                    />
                    <div className="list__main">
                      <div className="row row--between" style={{ gap: '0.6rem' }}>
                        <Link to={`/tasks/${submission.task?.id}`} className="list__title">
                          {submission.task?.title}
                        </Link>
                        <span className="list__amount">{money(submission.reward)}</span>
                      </div>
                      <div className="list__sub">
                        {submission.worker?.name} · submitted {timeAgo(submission.submittedAt)}
                      </div>

                      <div className="proof" style={{ marginTop: '0.6rem' }}>
                        {submission.proofText}
                      </div>

                      {submission.proofUrl ? (
                        <a
                          className="proof__link"
                          href={submission.proofUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <LinkIcon size={14} />
                          {submission.proofUrl}
                        </a>
                      ) : null}

                      <div className="row" style={{ marginTop: '0.75rem' }}>
                        <button
                          type="button"
                          className="btn btn--success btn--sm"
                          onClick={() => {
                            setReview({ submission, action: 'approve' })
                            setReviewNote('')
                          }}
                          disabled={busy}
                        >
                          <CheckIcon size={14} />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => {
                            setReview({ submission, action: 'reject' })
                            setReviewNote('')
                          }}
                          disabled={busy}
                        >
                          <XIcon size={14} />
                          Send back
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card card--flush">
            <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
              <h3 className="card__title">Your tasks</h3>
              <Link to="/tasks" className="card__hint">
                See the board
              </Link>
            </div>

            {data.tasks.length === 0 ? (
              <div style={{ padding: '0 1.35rem 1.35rem' }}>
                <EmptyState
                  title="Start with one good task"
                  text="Post a focused task and bring a new contributor into the loop."
                  action={
                    <Link to="/tasks/new" className="btn btn--primary btn--sm">
                      Post your first task
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="list" style={{ marginTop: '1rem' }}>
                {data.tasks.map((task) => (
                  <Link
                    to={`/tasks/${task.id}`}
                    className="list__row list__row--clickable"
                    key={task.id}
                  >
                    <div className="list__main">
                      <div className="list__title">{task.title}</div>
                      <div className="list__sub">
                        {task.slotsFilled} of {task.slotsTotal} filled · {money(task.escrow)} in
                        escrow · posted {timeAgo(task.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={task.status} />
                    <span className="list__amount">{money(task.reward)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card card--flush">
          <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
            <h3 className="card__title">Recent motion</h3>
          </div>

          {data.activity.length === 0 ? (
            <div style={{ padding: '0 1.35rem 1.35rem' }}>
              <EmptyState
                title="Nothing yet"
                text="Complete a task or create one to see momentum build."
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

      {funding ? (
        <Modal
          title="Add funds"
          description="Play money, added instantly, so you can keep funding work."
          onClose={() => setFunding(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setFunding(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={addFunds}
                disabled={busy || Number(fundAmount) < 1}
              >
                {busy ? 'Adding…' : 'Add funds'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label className="field__label" htmlFor="fundAmount">
                Amount
              </label>
              <div className="input-prefix">
                <span className="input-prefix__symbol">$</span>
                <input
                  id="fundAmount"
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={fundAmount}
                  onChange={(event) => setFundAmount(event.target.value)}
                />
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {review ? (
        <Modal
          title={review.action === 'approve' ? 'Approve this work?' : 'Send this back?'}
          description={
            review.action === 'approve'
              ? `${money(review.submission.reward)} moves from escrow to ${review.submission.worker?.name} straight away.`
              : 'The slot reopens for someone else. Say why, so the worker knows what to fix.'
          }
          onClose={() => setReview(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setReview(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={review.action === 'approve' ? 'btn btn--success' : 'btn btn--danger'}
                onClick={decide}
                disabled={busy || (review.action === 'reject' && !reviewNote.trim())}
              >
                {busy ? 'Saving…' : review.action === 'approve' ? 'Approve and pay' : 'Send back'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label" htmlFor="employerReviewNote">
              Feedback notes{' '}
              {review.action === 'approve' ? <span className="muted">(optional)</span> : null}
            </label>
            <textarea
              id="employerReviewNote"
              className="textarea"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder={
                review.action === 'approve'
                  ? 'Give good work a quick, clear answer.'
                  : 'What would make this right?'
              }
            />
          </div>
        </Modal>
      ) : null}
    </main>
  )
}
