import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} type="button" title={label} aria-label={label} {...props}>{children}</button>
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="modal-header">
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}><X size={17} /></IconButton>
      </header>
      {children}
    </dialog>
  )
}
