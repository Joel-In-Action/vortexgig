import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { StatusBadge } from '../components/Badges'
import { SkeletonLine } from '../components/Skeletons'
import { CheckIcon, FileIcon, LinkIcon, ShieldIcon, XIcon } from '../components/Icons'
import { money, timeAgo } from '../lib/format'

const WORKER_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'CLAIMED', label: 'Claimed' },
  { value: 'PENDING', label: 'In review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DISPUTED', label: 'Disputed' }
]

const EMPLOYER_TABS = [
  { value: 'PENDING', label: 'Needs review' },
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DISPUTED', label: 'Disputed' }
]

/**
 * One page, two readings: a worker's own trail, or the employer's queue of work
 * waiting on them. The API answers by role, so the difference here is presentation.
 */
export default function Submissions() {
  const { isEmployer, refresh } = useAuth()
  const toast = useToast()

  const [submissions, setSubmissions] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(isEmployer ? 'PENDING' : 'ALL')
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [dispute, setDispute] = useState(null)
  const [disputeReason, setDisputeReason] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/submissions')
      setSubmissions(data)
    } catch (err) {
      setError(errorMessage(err))
      setSubmissions([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const tabs = isEmployer ? EMPLOYER_TABS : WORKER_TABS

  const visible = useMemo(() => {
    if (!submissions) return []
    return tab === 'ALL' ? submissions : submissions.filter((s) => s.status === tab)
  }, [submissions, tab])

  const counts = useMemo(() => {
    const tally = {}
    for (const submission of submissions ?? []) {
      tally[submission.status] = (tally[submission.status] ?? 0) + 1
    }
    return tally
  }, [submissions])

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
      await api.post(`/submissions/${dispute.id}/dispute`, { reason: disputeReason })
      toast.success('Escalated. A moderator will take a look.')
      setDispute(null)
      setDisputeReason('')
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">{isEmployer ? 'Review queue' : 'My submissions'}</div>
          <h1 style={{ fontSize: '2rem' }}>
            {isEmployer ? 'Work to review' : 'Your paper trail'}
          </h1>
          <p>
            {isEmployer
              ? 'Give good work a quick, clear answer.'
              : 'Every task you have taken on, and where it landed.'}
          </p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        {tabs.map((option) => (
          <button
            key={option.value}
            type="button"
            className="tabs__tab"
            data-active={tab === option.value}
            onClick={() => setTab(option.value)}
          >
            {option.label}
            {option.value !== 'ALL' && counts[option.value] ? ` (${counts[option.value]})` : ''}
          </button>
        ))}
      </div>

      {error ? (
        <div className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      ) : null}

      {submissions === null ? (
        <div className="card stack">
          <SkeletonLine width="40%" height="1.1rem" />
          <SkeletonLine />
          <SkeletonLine width="70%" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileIcon size={20} />}
          title={isEmployer ? 'Your board is clear' : 'No submissions yet'}
          text={
            isEmployer
              ? 'Nothing is waiting on your review right now.'
              : 'Claim a task and submit your first proof to see it here.'
          }
          action={
            <Link to={isEmployer ? '/tasks/new' : '/tasks'} className="btn btn--primary btn--sm">
              {isEmployer ? 'Post a task' : 'Browse the marketplace'}
            </Link>
          }
        />
      ) : (
        <div className="card card--flush">
          <div className="list">
            {visible.map((submission) => (
              <div className="list__row" key={submission.id} style={{ alignItems: 'flex-start' }}>
                {isEmployer ? (
                  <Avatar
                    name={submission.worker?.name}
                    initials={submission.worker?.initials}
                    id={submission.worker?.id}
                    size="sm"
                  />
                ) : null}

                <div className="list__main">
                  <div className="row row--between" style={{ gap: '0.6rem' }}>
                    <Link to={`/tasks/${submission.task?.id}`} className="list__title">
                      {submission.task?.title}
                    </Link>
                    <div className="row" style={{ gap: '0.5rem' }}>
                      <StatusBadge status={submission.status} />
                      <span className="list__amount">
                        {money(submission.reward)}
                      </span>
                    </div>
                  </div>

                  <div className="list__sub">
                    {isEmployer ? submission.worker?.name : submission.task?.employerName} ·{' '}
                    {submission.reviewedAt
                      ? `reviewed ${timeAgo(submission.reviewedAt)}`
                      : submission.submittedAt
                        ? `submitted ${timeAgo(submission.submittedAt)}`
                        : `claimed ${timeAgo(submission.claimedAt)}`}
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
                      {isEmployer ? 'Your note' : 'Feedback'}: {submission.feedback}
                    </p>
                  ) : null}

                  {submission.status === 'DISPUTED' ? (
                    <div className="alert alert--warning" style={{ marginTop: '0.6rem' }}>
                      With a moderator since {timeAgo(submission.disputedAt)}
                      {submission.disputeReason ? ` — “${submission.disputeReason}”` : ''}
                    </div>
                  ) : null}

                  {submission.resolution ? (
                    <p className="list__sub" style={{ marginTop: '0.5rem' }}>
                      Moderator's ruling: {submission.resolution}
                    </p>
                  ) : null}

                  {!isEmployer && submission.status === 'CLAIMED' ? (
                    <Link
                      to={`/tasks/${submission.task?.id}`}
                      className="btn btn--primary btn--sm"
                      style={{ marginTop: '0.75rem' }}
                    >
                      Submit proof
                    </Link>
                  ) : null}

                  {isEmployer && submission.status === 'PENDING' ? (
                    <div className="row row--wrap" style={{ marginTop: '0.75rem' }}>
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
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => {
                          setDispute(submission)
                          setDisputeReason('')
                        }}
                        disabled={busy}
                      >
                        <ShieldIcon size={14} />
                        Escalate
                      </button>
                    </div>
                  ) : null}

                  {!isEmployer && (submission.status === 'PENDING' || submission.status === 'REJECTED') ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      style={{ marginTop: '0.75rem' }}
                      onClick={() => {
                        setDispute(submission)
                        setDisputeReason('')
                      }}
                      disabled={busy}
                    >
                      <ShieldIcon size={14} />
                      Ask a moderator to look
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dispute ? (
        <Modal
          title="Ask a moderator to look"
          description="The payout stays frozen while they review it. Explain what happened, with anything that backs it up."
          onClose={() => setDispute(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDispute(null)}>
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
            <label className="field__label" htmlFor="listDisputeReason">
              What went wrong?
            </label>
            <textarea
              id="listDisputeReason"
              className="textarea"
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              placeholder="Be specific — the moderator sees this and the proof that was submitted."
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
                {busy ? 'Saving…' : review.action === 'approve' ? 'Approve and pay' : 'Send back'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label" htmlFor="queueReviewNote">
              Feedback notes{' '}
              {review.action === 'approve' ? <span className="muted">(optional)</span> : null}
            </label>
            <textarea
              id="queueReviewNote"
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
