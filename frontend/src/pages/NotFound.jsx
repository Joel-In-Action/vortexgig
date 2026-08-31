import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '../components/Icons'

export default function NotFound() {
  return (
    <main className="page page--narrow center" style={{ paddingTop: '5rem' }}>
      <div className="stack">
        <h1>That page went off brief.</h1>
        <p className="muted">
          The link you followed does not point anywhere on VortexGig. The marketplace is still
          right where you left it.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn btn--outline">
            <ArrowLeftIcon size={15} />
            Back home
          </Link>
          <Link to="/tasks" className="btn btn--primary">
            Browse tasks
          </Link>
        </div>
      </div>
    </main>
  )
}
