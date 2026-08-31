/**
 * One number, said plainly. `hint` carries the context that stops a bare figure
 * from being ambiguous ("across 3 tasks", "held while in review").
 */
export default function StatCard({ label, value, hint, accent = false }) {
  return (
    <div className={`stat${accent ? ' stat--accent' : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  )
}
