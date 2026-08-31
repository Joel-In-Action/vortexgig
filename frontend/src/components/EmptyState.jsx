import { InboxIcon } from './Icons'

export default function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon ?? <InboxIcon size={20} />}</div>
      <p className="empty__title">{title}</p>
      {text ? <p className="empty__text">{text}</p> : null}
      {action ? <div style={{ marginTop: '0.85rem' }}>{action}</div> : null}
    </div>
  )
}
