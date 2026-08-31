import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import { SkeletonLine } from '../components/Skeletons'
import { TierBadge } from '../components/Badges'
import { TrophyIcon } from '../components/Icons'
import { money, timeAgo } from '../lib/format'

const WINDOWS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all_time', label: 'All time' }
]

export default function Leaderboard() {
  const { user, isWorker } = useAuth()
  const [window, setWindow] = useState('all_time')
  const [board, setBoard] = useState(null)
  const [pool, setPool] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setBoard(null)

    api
      .get('/leaderboard', { params: { window } })
      .then((res) => {
        if (!cancelled) setBoard(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err))
          setBoard([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [window])

  // The pool is public information: workers should be able to see what is on
  // the table before deciding whether to chase the board.
  useEffect(() => {
    api
      .get('/stats')
      .then((res) => setPool(res.data))
      .catch(() => setPool(null))
  }, [])

  const youAreOnIt = board?.some((entry) => entry.isYou)

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">Live board</div>
          <h1 style={{ fontSize: '2rem' }}>The signal board</h1>
          <p>A little friendly competition, measured in useful work.</p>
          {pool ? (
            <div className="row row--wrap" style={{ marginTop: '0.6rem', gap: '1.25rem' }}>
              <span className="muted" style={{ fontSize: '0.87rem' }}>
                <strong className="mono">{money(pool.paidOut)}</strong> paid out so far
              </span>
              <span className="muted" style={{ fontSize: '0.87rem' }}>
                <strong className="mono" style={{ color: 'hsl(var(--primary))' }}>
                  {money(pool.rewardPool)}
                </strong>{' '}
                in the reward pool
              </span>
            </div>
          ) : null}
        </div>

        <div className="tabs">
          {WINDOWS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="tabs__tab"
              data-active={window === option.value}
              onClick={() => setWindow(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      ) : null}

      {board === null ? (
        <div className="card stack">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonLine key={index} height="1.6rem" />
          ))}
        </div>
      ) : board.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon size={20} />}
          title="The board is warming up"
          text="No approved work in this window yet. Complete a task to put your name in the running."
          action={
            isWorker ? (
              <Link to="/tasks" className="btn btn--primary btn--sm">
                Find a task
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <div className="card card--flush">
            <div className="list">
              {board.map((entry) => (
                <div
                  className={`list__row${entry.isYou ? ' list__row--you' : ''}`}
                  key={entry.worker.id}
                >
                  <div className={`rank${entry.rank <= 3 ? ` rank--${entry.rank}` : ''}`}>
                    {entry.rank}
                  </div>
                  <Avatar
                    name={entry.worker.name}
                    initials={entry.worker.initials}
                    id={entry.worker.id}
                    size="sm"
                  />
                  <div className="list__main">
                    <div className="row" style={{ gap: '0.5rem' }}>
                      <span className="list__title">
                        {entry.worker.name}
                        {entry.isYou ? <span className="muted"> · you</span> : null}
                      </span>
                      <TierBadge tier={entry.tier} />
                    </div>
                    <div className="list__sub">
                      {entry.completed} completed · <span className="xp">{entry.xp} XP</span> · last
                      active {timeAgo(entry.lastActive)}
                    </div>
                  </div>
                  <span className="list__amount amount--in">{money(entry.earned)}</span>
                </div>
              ))}
            </div>
          </div>

          {user && isWorker && !youAreOnIt ? (
            <div className="card center" style={{ marginTop: '1.25rem' }}>
              <h3>Keep going</h3>
              <p className="muted" style={{ margin: '0.35rem 0 1rem' }}>
                Complete a task in this window to put your name in the running.
              </p>
              <Link to="/tasks" className="btn btn--primary btn--sm">
                Find a task
              </Link>
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}
