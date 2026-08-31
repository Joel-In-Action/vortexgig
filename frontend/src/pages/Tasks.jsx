import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import TaskCard from '../components/TaskCard'
import EmptyState from '../components/EmptyState'
import { TaskGridSkeleton } from '../components/Skeletons'
import { PlusIcon, SearchIcon } from '../components/Icons'

const DIFFICULTIES = [
  { value: '', label: 'Any difficulty' },
  { value: 'STARTER', label: 'Starter' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'EXPERT', label: 'Expert' }
]

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CLOSED', label: 'Closed' }
]

const WINDOWS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' }
]

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'reward', label: 'Highest reward' },
  { value: 'deadline', label: 'Deadline soonest' },
  { value: 'closing', label: 'Almost full' }
]

const FILTER_KEYS = ['search', 'category', 'difficulty', 'status', 'window', 'sort']

export default function Tasks() {
  const { user, isEmployer } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tasks, setTasks] = useState(null)
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')

  // The URL is the single source of truth for filters, so a filtered board can
  // be linked, bookmarked and restored by the back button.
  const filters = useMemo(() => {
    const current = {}
    for (const key of FILTER_KEYS) {
      current[key] = searchParams.get(key) ?? ''
    }
    return current
  }, [searchParams])

  // Kept separately so typing stays responsive while the request is debounced.
  const [searchDraft, setSearchDraft] = useState(filters.search)

  useEffect(() => setSearchDraft(filters.search), [filters.search])

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams)
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== filters.search) {
        setFilter('search', searchDraft)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchDraft, filters.search, setFilter])

  useEffect(() => {
    api
      .get('/tasks/categories')
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]))
  }, [])

  // Bumped after an inline claim so the board reflects the new slot count.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setTasks(null)
    setError('')

    api
      .get('/tasks', { params: { ...filters, sort: filters.sort || 'newest' } })
      .then((res) => {
        if (!cancelled) setTasks(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err, 'The marketplace had a hiccup. Try again in a moment.'))
          setTasks([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [filters, refreshKey])

  const hasFilters = FILTER_KEYS.some((key) => key !== 'sort' && filters[key])

  return (
    <main className="page page--wide">
      <div className="page-head">
        <div>
          <div className="page-head__eyebrow">The marketplace</div>
          <h1 style={{ fontSize: '2rem' }}>Find your next win.</h1>
          <p>Short briefs, visible payouts, no guesswork.</p>
        </div>
        {isEmployer ? (
          <Link to="/tasks/new" className="btn btn--primary">
            <PlusIcon size={16} />
            Post a task
          </Link>
        ) : null}
      </div>

      <div className="filters">
        <div className="field filters__search">
          <label className="field__label" htmlFor="search">
            Search
          </label>
          <SearchIcon size={16} />
          <input
            id="search"
            className="input"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Try “transcribe”, “design”, “data”…"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            className="select"
            value={filters.category}
            onChange={(event) => setFilter('category', event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="difficulty">
            Difficulty
          </label>
          <select
            id="difficulty"
            className="select"
            value={filters.difficulty}
            onChange={(event) => setFilter('difficulty', event.target.value)}
          >
            {DIFFICULTIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className="select"
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="window">
            Posted
          </label>
          <select
            id="window"
            className="select"
            value={filters.window}
            onChange={(event) => setFilter('window', event.target.value)}
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="filters__result">
        <span>
          {tasks === null
            ? 'Loading the board…'
            : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}${hasFilters ? ' match your filters' : ' on the board'}`}
        </span>

        <div className="row">
          {hasFilters ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSearchParams(filters.sort ? { sort: filters.sort } : {}, { replace: true })}
            >
              Clear filters
            </button>
          ) : null}

          <label className="sr-only" htmlFor="sort">
            Sort by
          </label>
          <select
            id="sort"
            className="select"
            style={{ width: 'auto' }}
            value={filters.sort || 'newest'}
            onChange={(event) => setFilter('sort', event.target.value)}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      ) : null}

      {tasks === null ? (
        <TaskGridSkeleton />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={20} />}
          title={hasFilters ? 'No tasks match that search' : 'The board is warming up'}
          text={
            hasFilters
              ? 'Try another phrase or clear your filters to see the full marketplace.'
              : user && isEmployer
                ? 'Start with one good task and bring a contributor into the loop.'
                : 'Nothing is posted yet. Check back shortly.'
          }
          action={
            hasFilters ? (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                Clear filters
              </button>
            ) : isEmployer ? (
              <Link to="/tasks/new" className="btn btn--primary btn--sm">
                Post your first task
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClaimed={() => setRefreshKey((n) => n + 1)} />
          ))}
        </div>
      )}
    </main>
  )
}
