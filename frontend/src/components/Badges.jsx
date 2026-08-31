import { DIFFICULTY_LABELS, STATUS_LABELS } from '../lib/format'

const STATUS_TONES = {
  OPEN: 'success',
  PAUSED: 'warning',
  CLOSED: '',
  CLAIMED: 'accent',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  DISPUTED: 'danger',
  ACTIVE: 'success',
  SUSPENDED: 'danger'
}

const TIER_TONES = {
  Starter: '',
  Contributor: 'accent',
  Pro: 'primary',
  Elite: 'warning'
}

const DIFFICULTY_TONES = {
  STARTER: 'success',
  INTERMEDIATE: 'accent',
  EXPERT: 'primary'
}

export function Badge({ tone = '', dot = false, children }) {
  const classes = ['badge', tone && `badge--${tone}`, dot && 'badge--dot'].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}

export function StatusBadge({ status }) {
  if (!status) return null
  return (
    <Badge tone={STATUS_TONES[status] ?? ''} dot>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

export function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null
  return <Badge tone={DIFFICULTY_TONES[difficulty] ?? ''}>{DIFFICULTY_LABELS[difficulty] ?? difficulty}</Badge>
}

export function CategoryBadge({ category }) {
  if (!category) return null
  return <Badge>{category}</Badge>
}

export function TierBadge({ tier }) {
  if (!tier) return null
  return <Badge tone={TIER_TONES[tier] ?? ''}>{tier}</Badge>
}

/** Only shown for crypto — USD is the unmarked default across the app. */
export function CurrencyBadge({ currency }) {
  if (!currency || currency === 'USD') return null
  return <Badge tone="accent">{currency}</Badge>
}
