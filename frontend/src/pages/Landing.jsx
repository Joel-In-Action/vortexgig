import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import TaskCard from '../components/TaskCard'
import { TaskGridSkeleton } from '../components/Skeletons'
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  CoinIcon,
  ShieldIcon,
  SparkIcon
} from '../components/Icons'
import { compactMoney } from '../lib/format'

const STEPS = [
  {
    number: '01',
    title: 'Post a focused task',
    text: 'A short brief, a clear reward, and how many people can take it on. The clearer the brief, the faster the right person can say yes.'
  },
  {
    number: '02',
    title: 'Someone claims it',
    text: 'A worker takes a slot and gets to work. The payout is held in escrow from the moment you publish, so nobody is working on a promise.'
  },
  {
    number: '03',
    title: 'Proof, then payout',
    text: 'They show what they did. You approve, and the money moves the same second. Reject it and the slot opens back up for someone else.'
  }
]

export default function Landing() {
  const { user, loading } = useAuth()
  const [tasks, setTasks] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api
      .get('/tasks', { params: { status: 'OPEN', sort: 'newest' } })
      .then((res) => setTasks(res.data.slice(0, 6)))
      .catch(() => setTasks([]))

    api
      .get('/stats')
      .then((res) => setStats(res.data))
      .catch(() => setStats(null))
  }, [])

  // Someone already signed in wants their workspace, not the pitch.
  if (!loading && user) {
    return <Navigate to={user.role === 'EMPLOYER' ? '/employer' : '/worker'} replace />
  }

  return (
    <main>
      <section className="hero">
        <div className="hero__inner">
          <span className="hero__eyebrow">
            <SparkIcon size={14} />
            A better kind of busy
          </span>
          <h1>Get minted.</h1>
          <p className="hero__lede">
            VortexGig is a marketplace for small, well-defined paid work. Post a clear brief, or
            claim one and get paid for what you finish.
          </p>
          <div className="hero__actions">
            <Link to="/register" className="btn btn--primary btn--lg">
              Get started
              <ArrowRightIcon size={16} />
            </Link>
            <Link to="/tasks" className="btn btn--outline btn--lg">
              Browse the marketplace
            </Link>
          </div>

          {/* Live counters, not claims: these are read straight off the ledger. */}
          {stats ? (
            <div className="counters">
              <div className="counter">
                <div className="counter__value">{compactMoney(stats.paidOut)}</div>
                <div className="counter__label">Paid to workers</div>
              </div>
              <div className="counter">
                <div className="counter__value">{stats.tasksCompleted}</div>
                <div className="counter__label">Tasks completed</div>
              </div>
              <div className="counter">
                <div className="counter__value">{stats.openTasks}</div>
                <div className="counter__label">Open right now</div>
              </div>
              <div className="counter">
                <div className="counter__value">{stats.workers}</div>
                <div className="counter__label">Contributors</div>
              </div>
            </div>
          ) : null}

          <div className="trust">
            <span className="trust__item">
              <ShieldIcon size={14} />
              Escrow-backed payouts
            </span>
            <span className="trust__item">
              <CheckCircleIcon size={14} />
              Workers keep the full reward
            </span>
            <span className="trust__item">
              <CoinIcon size={14} />
              Paid out the moment work is approved
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Pick your starting point</h2>
          <p>Both paths share the same simple, human marketplace.</p>
        </div>

        <div className="grid grid--2">
          <div className="path-card">
            <div className="path-card__icon">
              <BriefcaseIcon size={22} />
            </div>
            <h3>I need work done</h3>
            <p className="muted">
              Post a focused task and bring a new contributor into the loop. Fund it once, review
              the proof, and pay only for work you accept.
            </p>
            <Link to="/register" className="btn btn--outline">
              Post a paid task
              <ArrowRightIcon size={15} />
            </Link>
          </div>

          <div className="path-card">
            <div className="path-card__icon path-card__icon--alt">
              <CoinIcon size={22} />
            </div>
            <h3>I want to earn</h3>
            <p className="muted">
              Find flexible work and get paid for momentum. Every task shows its payout up front,
              and the money is already set aside before you start.
            </p>
            <Link to="/register" className="btn btn--outline">
              Find a task
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="section__head">
          <h2>How it works</h2>
          <p>Three steps, and no guesswork about who owes what.</p>
        </div>

        <div className="grid grid--3">
          {STEPS.map((step) => (
            <div className="card step" key={step.number}>
              <span className="step__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem' }}>
          <div className="path-card__icon" style={{ flexShrink: 0 }}>
            <ShieldIcon size={22} />
          </div>
          <div>
            <h3>Fair by design</h3>
            <p className="muted" style={{ marginTop: '0.3rem' }}>
              A task is funded the moment it is published. Your payout is held safely while the
              employer reviews your proof, and unspent escrow goes back to the employer when a task
              closes. If the two of you cannot agree, either side can escalate to a moderator, and
              the money stays frozen until they rule. Nobody is out of pocket while work is in flight.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="page-head">
          <div>
            <div className="page-head__eyebrow">The marketplace</div>
            <h2>Out in the world</h2>
            <p>Real briefs, open right now.</p>
          </div>
          <Link to="/tasks" className="btn btn--outline btn--sm">
            See all
            <ArrowRightIcon size={15} />
          </Link>
        </div>

        {tasks === null ? (
          <TaskGridSkeleton count={3} />
        ) : tasks.length === 0 ? (
          <div className="empty">
            <p className="empty__title">The board is warming up</p>
            <p className="empty__text">No open tasks just yet. Post the first one.</p>
          </div>
        ) : (
          <div className="task-grid">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
