import { useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from './Avatar'
import { Badge, CategoryBadge, CurrencyBadge, DifficultyBadge, StatusBadge } from './Badges'
import { ClockIcon } from './Icons'
import { deadlineLabel, money } from '../lib/format'

/**
 * A task as it appears on the board. The whole card is the link to its detail
 * page, with an inline claim for workers — that button has to stop the click
 * from reaching the surrounding link.
 */
export default function TaskCard({ task, onClaimed }) {
  const { isWorker } = useAuth()
  const toast = useToast()
  const [claiming, setClaiming] = useState(false)

  const deadline = deadlineLabel(task.deadline)
  const filled = task.slotsTotal ? (task.slotsFilled / task.slotsTotal) * 100 : 0
  const canClaim = isWorker && task.claimable && !task.mySubmission

  const claim = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setClaiming(true)
    try {
      await api.post(`/tasks/${task.id}/claim`)
      toast.success('Task claimed. Make it yours.')
      onClaimed?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Link to={`/tasks/${task.id}`} className="task-card">
      <div className="task-card__top">
        <h3 className="task-card__title">{task.title}</h3>
        <div className="task-card__reward">{money(task.reward)}</div>
      </div>

      <p className="task-card__desc">{task.description}</p>

      <div className="task-card__meta">
        <CategoryBadge category={task.category} />
        <DifficultyBadge difficulty={task.difficulty} />
        <CurrencyBadge currency={task.currency} />
        {task.status !== 'OPEN' ? <StatusBadge status={task.status} /> : null}
        {task.mySubmission ? <StatusBadge status={task.mySubmission.status} /> : null}
      </div>

      <div className="slots">
        <div className="slots__bar">
          <div className="slots__fill" style={{ width: `${Math.min(100, filled)}%` }} />
        </div>
        <div className="slots__text">
          {task.slotsFilled} of {task.slotsTotal} filled · {Math.round(filled)}% complete
          {task.slotsRemaining > 0 ? ` · ${task.slotsRemaining} open` : ' · all claimed'}
        </div>
      </div>

      <div className="task-card__foot">
        <div className="task-card__poster">
          <Avatar
            name={task.employer?.name}
            initials={task.employer?.initials}
            id={task.employer?.id}
            size="sm"
          />
          <span>{task.employer?.name}</span>
        </div>
        {canClaim ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={claim} disabled={claiming}>
            {claiming ? 'Claiming…' : 'Claim'}
          </button>
        ) : (
          <Badge tone={deadline.tone === 'muted' ? '' : deadline.tone}>
            <ClockIcon size={12} />
            {deadline.text}
          </Badge>
        )}
      </div>
    </Link>
  )
}
