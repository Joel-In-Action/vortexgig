import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ArrowLeftIcon } from '../components/Icons'
import { money } from '../lib/format'

const DIFFICULTIES = [
  { value: 'STARTER', label: 'Starter', hint: 'Anyone careful can do this' },
  { value: 'INTERMEDIATE', label: 'Intermediate', hint: 'Some craft or judgement needed' },
  { value: 'EXPERT', label: 'Expert', hint: 'Real specialist work' }
]

const SUGGESTED_CATEGORIES = [
  'Data',
  'Writing',
  'Design',
  'Research',
  'Development',
  'Marketing',
  'Testing',
  'Audio',
  'Translation'
]

export default function NewTask() {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    difficulty: 'STARTER',
    reward: '5.00',
    slots: 1,
    deadline: ''
  })
  const [categories, setCategories] = useState(SUGGESTED_CATEGORIES)
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get('/tasks/categories')
      .then((res) => {
        const merged = new Set([...res.data, ...SUGGESTED_CATEGORIES])
        setCategories([...merged].sort())
      })
      .catch(() => {})
  }, [])

  // Pricing comes from the server so what the form promises is exactly what the
  // publish will charge — the fee percentage lives in one place only.
  useEffect(() => {
    const reward = Number(form.reward)
    const slots = Number(form.slots)
    if (!Number.isFinite(reward) || reward <= 0 || !Number.isFinite(slots) || slots < 1) {
      setQuote(null)
      return undefined
    }

    const timer = setTimeout(() => {
      api
        .get('/tasks/quote', { params: { reward: reward.toFixed(2), slots } })
        .then((res) => setQuote(res.data))
        .catch(() => setQuote(null))
    }, 250)

    return () => clearTimeout(timer)
  }, [form.reward, form.slots])

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/tasks', {
        ...form,
        reward: Number(form.reward),
        slots: Number(form.slots),
        deadline: form.deadline || null
      })
      await refresh()
      toast.success('Task published. Now we wait for the right person.')
      navigate(`/tasks/${data.id}`)
    } catch (err) {
      setError(errorMessage(err, 'Could not publish this task. Check the fields and try again.'))
    } finally {
      setBusy(false)
    }
  }

  const balance = user?.available
  const affordable = !quote || !user || Number(balance) >= Number(quote.total)

  return (
    <main className="page">
      <Link to="/employer" className="back-link">
        <ArrowLeftIcon size={15} />
        Back to your workspace
      </Link>

      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">Create a brief</div>
          <h1 style={{ fontSize: '2rem' }}>Put good work in motion.</h1>
          <p>The clearer the brief, the faster the right person can say yes.</p>
        </div>
      </div>

      {error ? (
        <div className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="split">
          <div className="card card--pad-lg stack">
            <div className="field">
              <label className="field__label" htmlFor="title">
                Task title
              </label>
              <input
                id="title"
                className="input"
                required
                maxLength={160}
                value={form.title}
                onChange={update('title')}
                placeholder="Clean up a product list"
              />
              <span className="field__hint">Make the outcome concrete and easy to scan.</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                className="textarea"
                required
                minLength={20}
                style={{ minHeight: '11rem' }}
                value={form.description}
                onChange={update('description')}
                placeholder="What needs doing, what to hand back, and what “done” looks like."
              />
              <span className="field__hint">
                Say what done looks like. It saves you a round of questions later.
              </span>
            </div>

            <div className="grid grid--2" style={{ gap: '1rem' }}>
              <div className="field">
                <label className="field__label" htmlFor="category">
                  Category
                </label>
                <input
                  id="category"
                  className="input"
                  required
                  maxLength={60}
                  list="category-options"
                  value={form.category}
                  onChange={update('category')}
                  placeholder="Data"
                />
                <datalist id="category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="deadline">
                  Deadline <span className="muted">(optional)</span>
                </label>
                <input
                  id="deadline"
                  className="input"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={form.deadline}
                  onChange={update('deadline')}
                />
              </div>
            </div>

            <div className="field">
              <span className="field__label">Difficulty</span>
              <div className="choice">
                {DIFFICULTIES.map((option) => (
                  <label
                    key={option.value}
                    className="choice__option"
                    data-selected={form.difficulty === option.value}
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={option.value}
                      checked={form.difficulty === option.value}
                      onChange={update('difficulty')}
                    />
                    <span className="choice__title">{option.label}</span>
                    <span className="choice__desc">{option.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid--2" style={{ gap: '1rem' }}>
              <div className="field">
                <label className="field__label" htmlFor="reward">
                  Reward per slot
                </label>
                <div className="input-prefix">
                  <span className="input-prefix__symbol">$</span>
                  <input
                    id="reward"
                    className="input"
                    type="number"
                    min="0.50"
                    step="0.50"
                    required
                    value={form.reward}
                    onChange={update('reward')}
                  />
                </div>
                <span className="field__hint">What one person earns for finishing it.</span>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="slots">
                  How many people?
                </label>
                <input
                  id="slots"
                  className="input"
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={form.slots}
                  onChange={update('slots')}
                />
                <span className="field__hint">Each one is paid separately on approval.</span>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card__head">
                <h3 className="card__title">What this costs</h3>
              </div>

              {quote ? (
                <div className="price">
                  <div className="price__row">
                    <span>Worker reward × {form.slots}</span>
                    <strong>{money(quote.reward)}</strong>
                  </div>
                  <div className="price__row">
                    <span>Task budget</span>
                    <strong>{money(quote.budget)}</strong>
                  </div>
                  <div className="price__row">
                    <span>Service fee ({Number(quote.feePercent)}%)</span>
                    <strong>{money(quote.platformFee)}</strong>
                  </div>
                  <div className="price__row price__row--total">
                    <span>Charged now</span>
                    <strong>{money(quote.total)}</strong>
                  </div>
                </div>
              ) : (
                <p className="muted">Set a reward and a slot count to see the total.</p>
              )}

              <p className="field__hint" style={{ marginTop: '0.85rem' }}>
                The budget is held in escrow the moment you publish, so workers know the money is
                real. Anything you do not approve comes back to you when the task closes.
              </p>

              <div className="divider" />

              <div className="price__row">
                <span>Your balance</span>
                <strong className="mono">{money(balance)}</strong>
              </div>

              {!affordable ? (
                <div className="alert alert--error" style={{ marginTop: '0.85rem' }}>
                  That is more than your balance. Add funds in Settings, or trim the reward or slot
                  count.
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--lg btn--full"
              disabled={busy || !affordable}
            >
              {busy ? 'Publishing…' : 'Publish task'}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}
