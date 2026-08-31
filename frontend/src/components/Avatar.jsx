/** Initials chip. The tint is derived from the user id so it is stable per person. */
export default function Avatar({ name, initials, id = 0, size = '' }) {
  const label = initials || (name ? name.trim().charAt(0).toUpperCase() : '?')
  const tint = Math.abs(Number(id) || 0) % 6
  const sizeClass = size ? ` avatar--${size}` : ''

  return (
    <div className={`avatar avatar--t${tint}${sizeClass}`} title={name} aria-hidden="true">
      {label}
    </div>
  )
}
