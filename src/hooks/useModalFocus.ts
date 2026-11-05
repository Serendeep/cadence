import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Keeps keyboard focus inside a dialog while it is open and gives it back to whatever opened it. */
export function useModalFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = ref.current
    // a field with autoFocus inside the dialog has already taken focus
    if (box && !box.contains(document.activeElement)) (box.querySelector<HTMLElement>(FOCUSABLE) ?? box).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])
  return ref
}
