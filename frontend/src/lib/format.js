/** Formatting helpers shared by every page. */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function money(value) {
  const amount = Number(value ?? 0)
  return usd.format(Number.isFinite(amount) ? amount : 0)
}

/** Signed, for ledger rows: "+$12.00" / "-$4.50". */
export function signedMoney(value) {
  const amount = Number(value ?? 0)
  return `${amount >= 0 ? '+' : '-'}${money(Math.abs(amount))}`
}

/** Compact, for the landing counter: "$12.4k". */
export function compactMoney(value) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '$0'
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`
  }
  return usd.format(amount)
}

const RELATIVE_UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 2592000, divisor: 86400, unit: 'day' },
  { limit: 31536000, divisor: 2592000, unit: 'month' }
]

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((then - Date.now()) / 1000)
  const magnitude = Math.abs(seconds)

  if (magnitude < 45) return 'just now'

  for (const { limit, divisor, unit } of RELATIVE_UNITS) {
    if (magnitude < limit) {
      return relative.format(Math.round(seconds / divisor), unit)
    }
  }
  return relative.format(Math.round(seconds / 31536000), 'year')
}

export function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Deadline copy for a task card. Returns the phrasing plus a tone, so a task
 * closing today reads as urgent without the caller working that out.
 */
export function deadlineLabel(deadline) {
  if (!deadline) return { text: 'No deadline', tone: 'muted' }

  const due = new Date(`${deadline}T23:59:59`)
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000)

  if (days < 0) return { text: 'Deadline passed', tone: 'danger' }
  if (days === 0) return { text: 'Due today', tone: 'warning' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning' }
  if (days <= 7) return { text: `${days} days left`, tone: 'warning' }
  return { text: `Due ${formatDate(deadline)}`, tone: 'muted' }
}

export const DIFFICULTY_LABELS = {
  STARTER: 'Starter',
  INTERMEDIATE: 'Intermediate',
  EXPERT: 'Expert'
}

export const STATUS_LABELS = {
  OPEN: 'Open',
  PAUSED: 'Paused',
  CLOSED: 'Closed',
  CLAIMED: 'Claimed',
  PENDING: 'In review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISPUTED: 'Disputed',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended'
}

/** Ledger type -> the sentence the activity feed shows. */
export const TRANSACTION_LABELS = {
  DEPOSIT: 'Added funds',
  WITHDRAWAL: 'Withdrawn',
  ESCROW_HOLD: 'Held in escrow',
  ESCROW_REFUND: 'Escrow returned',
  PLATFORM_FEE: 'Service fee',
  PAYOUT: 'Payout',
  BONUS: 'Reward pool bonus'
}

/**
 * Time left until a deadline, as a running countdown for the task page.
 * Returns null once the deadline has passed.
 */
export function countdown(deadline) {
  if (!deadline) return null
  const remaining = new Date(`${deadline}T23:59:59`).getTime() - Date.now()
  if (remaining <= 0) return null

  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function titleCase(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}
