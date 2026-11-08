import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import { CHANGELOG } from '../lib/changelog'
import { Dialog } from '../pages/SolvesPage'

const HASH = '?whats-new'

/** The release notes; opens when the address ends in ?whats-new, which the after-update toast links to. */
export function WhatsNew() {
  const [open, setOpen] = useState(() => location.hash.endsWith(HASH))
  useEffect(() => {
    const onHash = () => setOpen(location.hash.endsWith(HASH))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // drop the marker, so the toast's link opens the notes again next time
  const close = () => {
    history.replaceState(null, '', location.hash.replace(HASH, ''))
    setOpen(false)
  }
  return (
    <>
      <button type="button" className="btn" onClick={() => location.assign(`#/settings/about${HASH}`)}>What's new</button>
      <AnimatePresence>
        {open && (
          <Dialog title="What's new" onClose={close}>
            <div className="changelog">
              {CHANGELOG.map((r) => (
                <section key={r.version}>
                  <h3>{r.version} <span className="dim">· {new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></h3>
                  <ul>
                    {r.changes.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </section>
              ))}
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  )
}
