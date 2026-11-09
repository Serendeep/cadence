import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label: ReactNode
  hint?: ReactNode
  checked?: boolean
  /** Leaves the menu open, for entries that change what it lists */
  keepOpen?: boolean
  onSelect: () => void
}

interface MenuProps {
  trigger: ReactNode
  label: string
  items: (MenuItem | 'sep')[]
  className?: string
}

/** A text trigger that opens a small popover list. Closes on outside click, Escape and selection. */
export function Menu({ trigger, label, items, className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    wrap.current?.querySelector<HTMLButtonElement>('.menu button')?.focus()
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className={`menu-wrap ${className ?? ''}`} ref={wrap}>
      <button type="button" className="textbtn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu"
            role="menu"
            initial={{ opacity: 0, y: -6, x: '-50%', scale: 0.97 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: -4, x: '-50%', scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {items.map((it, i) =>
              it === 'sep' ? (
                <div key={`sep${i}`} className="sep" />
              ) : (
                <button
                  key={it.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={it.checked ?? false}
                  onClick={() => {
                    if (!it.keepOpen) setOpen(false)
                    it.onSelect()
                  }}
                >
                  <span>{it.label}</span>
                  {it.hint != null && <span className="dim">{it.hint}</span>}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
