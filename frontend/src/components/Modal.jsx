import { useEffect, useRef } from 'react'

/**
 * A small dialog. Closes on Escape and on a click that starts and ends on the
 * backdrop — checking both ends stops a drag that began inside the modal from
 * dismissing it.
 */
export default function Modal({ title, description, onClose, children, actions }) {
  const backdropRef = useRef(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === backdropRef.current
      }}
      onMouseUp={(event) => {
        if (pressedBackdrop.current && event.target === backdropRef.current) onClose()
        pressedBackdrop.current = false
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="modal__title">{title}</h2>
        {description ? <p className="modal__desc">{description}</p> : null}
        <div style={{ marginTop: '1.15rem' }}>{children}</div>
        {actions ? <div className="modal__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
