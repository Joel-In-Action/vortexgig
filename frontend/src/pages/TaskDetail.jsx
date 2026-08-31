import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import { Badge, CategoryBadge, CurrencyBadge, DifficultyBadge, StatusBadge } from '../components/Badges'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { SkeletonLine } from '../components/Skeletons'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  LinkIcon,
  ShieldIcon,
  XIcon
} from '../components/Icons'
import { countdown, deadlineLabel, formatDate, money, timeAgo } from '../lib/format'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isEmployer, isWorker, refresh } = useAuth()
  const toast = useToast()

  const [task, setTask] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [proof, setProof] = useState({ proofText: '', proofUrl: '' })
  const [review, setReview] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [dispute, setDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [remaining, setRemaining] = useState(null)

  const isOwner = Boolean(task && user && task.employer?.id === user.id)

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get(`/tasks/${id}`)
      setTask(data)
      // Only the owner can see who has taken a run at it.
      if (user && data.employer?.id === user.id) {
        const queue = await api.get(`/tasks/${id}/submissions`)
        setSubmissions(queue.data)
      } else {
        setSubmissions([])
      }
    } catch (err) {
      setError(errorMessage(err, 'That task is not on the board.'))
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  // Ticks the deadline countdown. Cleared as soon as the task has no future
  // deadline left to count towards.
  useEffect(() => {
    if (!task?.deadline) {
      setRemaining(null)
      return undefined
    }
    const tick = () => setRemaining(countdown(task.deadline))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [task?.deadline])

  const claim = async () => {
    setBusy(true)
    try {
      await api.post(`/tasks/${id}/claim`)
      toast.success('Task claimed. Make it yours.')
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitProof = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.post(`/submissions/${task.mySubmission.id}/proof`, proof)
      toast.success('Proof submitted for review. Nice work.')
      setProof({ proofText: '', proofUrl: '' })
      await Promise.all([load(), refresh()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

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

  const raiseDispute = async () => {
    setBusy(true)
    try {
      await api.post(`/submissions/${mine.id}/dispute`, { reason: disputeReason })
      toast.success('Escalated. A moderator will take a look.')
      setDispute(false)
      setDisputeReason('')
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status) => {
    setBusy(true)
    try {
      await api.patch(`/tasks/${id}/status`, { status })
      toast.success(
        status === 'CLOSED' ? 'Task closed. Unused escrow is back in your balance.' : 'Task updated.'
      )
      await Promise.all([load(), refresh()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <main className="page page--narrow">
        <EmptyState
          title="That task went off brief."
          text={error}
          action={
            <Link to="/tasks" className="btn btn--primary btn--sm">
              Back to the marketplace
            </Link>
          }
        />
      </main>
    )
  }

  if (!task) {
    return (
      <main className="page">
        <div className="stack">
          <SkeletonLine width="9rem" height="0.9rem" />
          <SkeletonLine width="60%" height="2rem" />
          <div className="skeleton" style={{ height: '14rem' }} />
        </div>
      </main>
    )
  }

  const deadline = deadlineLabel(task.deadline)
  const mine = task.mySubmission
  const filled = task.slotsTotal ? (task.slotsFilled / task.slotsTotal) * 100 : 0
  const pendingCount = submissions.filter((s) => s.status === 'PENDING').length

  return (
    <main className="page">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ArrowLeftIcon size={15} />
        Back
      </button>

      <div className="split">
        <div className="stack">
          <div className="card card--pad-lg">
            <div className="row row--between row--wrap" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: '15rem' }}>
                <h1 style={{ fontSize: '1.75rem' }}>{task.title}</h1>
                <div className="row row--wrap" style={{ marginTop: '0.75rem', gap: '0.4rem' }}>
                  <CategoryBadge category={task.category} />
                  <DifficultyBadge difficulty={task.difficulty} />
                  <CurrencyBadge currency={task.currency} />
                  <StatusBadge status={task.status} />
                  <Badge tone={deadline.tone === 'muted' ? '' : deadline.tone}>
                    <ClockIcon size={12} />
                    {deadline.text}
                  </Badge>
                </div>
              </div>
              <div className="center">
                <div className="task-card__reward" style={{ fontSize: '1.9rem' }}>
                  {money(task.reward)}
                </div>
                <div className="stat__hint">per accepted slot</div>
              </div>
            </div>

            <div className="divider" />

            <h3 style={{ marginBottom: '0.5rem' }}>The brief</h3>
            <p className="detail__brief">{task.description}</p>

            <div className="divider" />

            <div className="slots">
              <div className="slots__bar">
                <div className="slots__fill" style={{ width: `${Math.min(100, filled)}%` }} />
              </div>
              <div className="slots__text">
                {task.slotsFilled} of {task.slotsTotal} filled · {Math.round(filled)}% complete ·
                {' '}{task.slotsRemaining} open · posted {timeAgo(task.createdAt)}
              </div>
            </div>

            {remaining ? (
              <div className="countdown" style={{ marginTop: '1rem' }}>
                <span>Closes in</span>
                <span className="countdown__value">{remaining}</span>
              </div>
            ) : null}
          </div>

          {/* --- Worker: claim, then submit proof, then see the verdict --- */}
          {isWorker ? (
            <div className="card">
              {!mine ? (
                <>
                  <div className="card__head">
                    <h3 className="card__title">Ready to take this on?</h3>
                  </div>
                  <p className="muted" style={{ marginBottom: '1rem' }}>
                    Claiming reserves one of the {task.slotsRemaining} open slots. The payout is
                    already funded and held in escrow.
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={claim}
                    disabled={busy || !task.claimable}
                  >
                    {task.claimable ? 'Claim this task' : 'Not available'}
                  </button>
                  {!task.claimable ? (
                    <p className="field__hint" style={{ marginTop: '0.6rem' }}>
                      {task.expired
                        ? 'This task passed its deadline.'
                        : task.status !== 'OPEN'
                          ? 'The employer is not taking new claims right now.'
                          : 'Every slot on this task is taken.'}
                    </p>
                  ) : null}
                </>
              ) : mine.status === 'CLAIMED' ? (
                <>
                  <div className="card__head">
                    <h3 className="card__title">Show your work</h3>
                    <span className="card__hint">Claimed {timeAgo(mine.claimedAt)}</span>
                  </div>
                  <form className="stack" onSubmit={submitProof}>
                    <div className="field">
                      <label className="field__label" htmlFor="proofText">
                        What did you do?
                      </label>
                      <textarea
                        id="proofText"
                        className="textarea"
                        required
                        minLength={10}
                        value={proof.proofText}
                        onChange={(event) => setProof({ ...proof, proofText: event.target.value })}
                        placeholder="Walk the employer through what you finished and anything they should know."
                      />
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="proofUrl">
                        Link to the work <span className="muted">(optional)</span>
                      </label>
                      <input
                        id="proofUrl"
                        className="input"
                        type="url"
                        value={proof.proofUrl}
                        onChange={(event) => setProof({ ...proof, proofUrl: event.target.value })}
                        placeholder="https://…"
                      />
                    </div>
                    <div className="alert alert--info">
                      <ShieldIcon size={16} />
                      <span>
                        Your payout of {money(mine.reward)} is held safely while the
                        employer reviews your proof.
                      </span>
                    </div>
                    <button type="submit" className="btn btn--primary" disabled={busy}>
                      {busy ? 'Submitting…' : 'Submit proof'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="card__head">
                    <h3 className="card__title">Your submission</h3>
                    <StatusBadge status={mine.status} />
                  </div>
                  <div className="proof">{mine.proofText}</div>
                  {mine.proofUrl ? (
                    <a
                      className="proof__link"
                      href={mine.proofUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <LinkIcon size={14} />
                      {mine.proofUrl}
                    </a>
                  ) : null}

                  {mine.status === 'PENDING' ? (
                    <div className="alert alert--warning" style={{ marginTop: '1rem' }}>
                      In review since {timeAgo(mine.submittedAt)}. Your payout of{' '}
                      {money(mine.reward)} is held until the employer answers.
                    </div>
                  ) : null}

                  {mine.status === 'APPROVED' ? (
                    <div className="alert alert--success" style={{ marginTop: '1rem' }}>
                      Approved {timeAgo(mine.reviewedAt)} — {money(mine.reward)}{' '}
                      landed in your balance.
                    </div>
                  ) : null}

                  {mine.status === 'REJECTED' ? (
                    <div className="alert alert--error" style={{ marginTop: '1rem' }}>
                      Not accepted this time. The slot went back on the board.
                    </div>
                  ) : null}

                  {mine.status === 'DISPUTED' ? (
                    <div className="alert alert--warning" style={{ marginTop: '1rem' }}>
                      With a moderator since {timeAgo(mine.disputedAt)}. Your payout stays frozen
                      until they rule.
                    </div>
                  ) : null}

                  {mine.feedback ? (
                    <div style={{ marginTop: '1rem' }}>
                      <div className="stat__label">Feedback from the employer</div>
                      <p style={{ marginTop: '0.35rem' }}>{mine.feedback}</p>
                    </div>
                  ) : null}

                  {mine.disputeReason ? (
                    <div style={{ marginTop: '1rem' }}>
                      <div className="stat__label">What was escalated</div>
                      <p style={{ marginTop: '0.35rem' }}>{mine.disputeReason}</p>
                    </div>
                  ) : null}

                  {mine.resolution ? (
                    <div style={{ marginTop: '1rem' }}>
                      <div className="stat__label">The moderator's ruling</div>
                      <p style={{ marginTop: '0.35rem' }}>{mine.resolution}</p>
                    </div>
                  ) : null}

                  {/* Escalation is open while it is in review, or after a rejection. */}
                  {mine.status === 'PENDING' || mine.status === 'REJECTED' ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      style={{ marginTop: '1rem' }}
                      onClick={() => setDispute(true)}
                      disabled={busy}
                    >
                      <ShieldIcon size={14} />
                      Ask a moderator to look
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* --- Employer: the review queue for this task --- */}
          {isOwner ? (
            <div className="card card--flush">
              <div className="card__head" style={{ padding: '1.35rem 1.35rem 0' }}>
                <h3 className="card__title">Work to review</h3>
                <span className="card__hint">
                  {pendingCount > 0
                    ? `${pendingCount} waiting on you`
                    : `${submissions.length} total`}
                </span>
              </div>

              {submissions.length === 0 ? (
                <div style={{ padding: '0 1.35rem 1.35rem' }}>
                  <EmptyState
                    title="Your board is clear"
                    text="Nobody has claimed this task yet. It is live on the marketplace."
                  />
                </div>
              ) : (
                <div className="list" style={{ marginTop: '1rem' }}>
                  {submissions.map((submission) => (
                    <div className="list__row" key={submission.id} style={{ alignItems: 'flex-start' }}>
                      <Avatar
                        name={submission.worker?.name}
                        initials={submission.worker?.initials}
                        id={submission.worker?.id}
                        size="sm"
                      />
                      <div className="list__main">
                        <div className="row row--between" style={{ gap: '0.6rem' }}>
                          <span className="list__title">{submission.worker?.name}</span>
                          <StatusBadge status={submission.status} />
                        </div>
                        <div className="list__sub">
                          {submission.status === 'CLAIMED'
                            ? `Claimed ${timeAgo(submission.claimedAt)} — no proof yet`
                            : `Submitted ${timeAgo(submission.submittedAt)}`}
                        </div>

                        {submission.proofText ? (
                          <div className="proof" style={{ marginTop: '0.6rem' }}>
                            {submission.proofText}
                          </div>
                        ) : null}

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

                        {submission.feedback ? (
                          <p className="list__sub" style={{ marginTop: '0.5rem' }}>
                            Your note: {submission.feedback}
                          </p>
                        ) : null}

                        {submission.status === 'PENDING' ? (
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
                              Approve {money(submission.reward)}
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
                        ) : null}

                        {submission.status === 'DISPUTED' ? (
                          <div className="alert alert--warning" style={{ marginTop: '0.75rem' }}>
                            With a moderator since {timeAgo(submission.disputedAt)}.
                            {submission.disputeReason ? ` “${submission.disputeReason}”` : ''}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!user ? (
            <div className="card center">
              <h3>Want to claim this?</h3>
              <p className="muted" style={{ margin: '0.4rem 0 1rem' }}>
                Create a worker account and the slot is yours in one click.
              </p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/register" className="btn btn--primary">
                  Create an account
                </Link>
                <Link to="/login" className="btn btn--outline">
                  Sign in
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* --- Sidebar --- */}
        <div className="stack">
          <div className="card">
            <div className="card__head">
              <h3 className="card__title">Posted by</h3>
            </div>
            <div className="row">
              <Avatar
                name={task.employer?.name}
                initials={task.employer?.initials}
                id={task.employer?.id}
                size="lg"
              />
              <div>
                <div style={{ fontWeight: 700 }}>{task.employer?.name}</div>
                <div className="list__sub">{task.employer?.headline}</div>
                <div className="list__sub">
                  On VortexGig since {formatDate(task.employer?.memberSince)}
                </div>
              </div>
            </div>
          </div>

          {isOwner ? (
            <>
              <div className="card">
                <div className="card__head">
                  <h3 className="card__title">What you put up</h3>
                </div>
                <div className="price">
                  <div className="price__row">
                    <span>Worker reward × {task.slotsTotal}</span>
                    <strong>{money(task.reward)}</strong>
                  </div>
                  <div className="price__row">
                    <span>Task budget</span>
                    <strong>{money(task.budget)}</strong>
                  </div>
                  <div className="price__row">
                    <span>Service fee</span>
                    <strong>{money(task.platformFee)}</strong>
                  </div>
                  <div className="price__row price__row--total">
                    <span>Still in escrow</span>
                    <strong>{money(task.escrow)}</strong>
                  </div>
                </div>
                <p className="field__hint" style={{ marginTop: '0.75rem' }}>
                  Escrow is released as you approve work. Whatever is left comes back to you when
                  the task closes.
                </p>
              </div>

              <div className="card">
                <div className="card__head">
                  <h3 className="card__title">Manage</h3>
                </div>
                <div className="stack stack--tight">
                  {task.status === 'OPEN' ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--full"
                      onClick={() => setStatus('PAUSED')}
                      disabled={busy}
                    >
                      Pause new claims
                    </button>
                  ) : null}
                  {task.status === 'PAUSED' ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--full"
                      onClick={() => setStatus('OPEN')}
                      disabled={busy}
                    >
                      Reopen the task
                    </button>
                  ) : null}
                  {task.status !== 'CLOSED' ? (
                    <button
                      type="button"
                      className="btn btn--danger btn--full"
                      onClick={() => setStatus('CLOSED')}
                      disabled={busy}
                    >
                      Close and refund escrow
                    </button>
                  ) : (
                    <p className="muted" style={{ fontSize: '0.87rem' }}>
                      This task is closed. Any unspent escrow went back to your balance.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="card__head">
                <h3 className="card__title">Your payout</h3>
              </div>
              <div className="price">
                <div className="price__row">
                  <span>Reward for this task</span>
                  <strong>{money(task.reward)}</strong>
                </div>
                <div className="price__row">
                  <span>Deductions</span>
                  <strong>{money(0)}</strong>
                </div>
                <div className="price__row price__row--total">
                  <span>You receive</span>
                  <strong>{money(task.reward)}</strong>
                </div>
              </div>
              <p className="field__hint" style={{ marginTop: '0.75rem' }}>
                Workers keep the full reward — the service fee is paid by the employer.
              </p>
            </div>
          )}
        </div>
      </div>

      {dispute ? (
        <Modal
          title="Ask a moderator to look"
          description="Your payout stays frozen while they review it. Explain what happened, with anything that backs it up."
          onClose={() => setDispute(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDispute(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={raiseDispute}
                disabled={busy || !disputeReason.trim()}
              >
                {busy ? 'Sending…' : 'Escalate'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label" htmlFor="disputeReason">
              What went wrong?
            </label>
            <textarea
              id="disputeReason"
              className="textarea"
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              placeholder="Be specific — the moderator sees this and the proof you submitted."
            />
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
                {busy
                  ? 'Saving…'
                  : review.action === 'approve'
                    ? 'Approve and pay'
                    : 'Send back'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label" htmlFor="reviewNote">
              Feedback notes {review.action === 'approve' ? <span className="muted">(optional)</span> : null}
            </label>
            <textarea
              id="reviewNote"
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
