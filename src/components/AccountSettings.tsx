import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { deleteAccountData, resolveAccountSwitch, signIn, signOut, syncNow, useSync } from '../lib/sync'
import { toast } from '../lib/toast'
import { Dialog } from './Dialog'
import { SettingsRow } from './SettingsRow'

function syncStatus(status: string, lastSynced: number | null): string {
  if (status === 'syncing') return 'Syncing…'
  if (status === 'error') return 'Could not reach the sync server. Your solves are safe here and sync when it is back.'
  return lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : 'Not synced yet'
}

/** Sign-in and sync; data stays on this device either way. */
export function AccountSettings() {
  const sync = useSync()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const switchDialog = (
    <AnimatePresence>
      {sync.switching && (
        <Dialog title={`Add this device's solves to ${sync.switching.to}?`} onClose={() => resolveAccountSwitch(false)}>
          <p className="dim">
            This device last synced with {sync.switching.from}'s account. Signing in as {sync.switching.to} uploads every session and solve on this device into {sync.switching.to}'s account.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => resolveAccountSwitch(false)}>Don't sign in</button>
            <button type="button" className="btn primary" onClick={() => resolveAccountSwitch(true)}>Add them</button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
  if (!sync.token) {
    return (
      <SettingsRow id="account" title="Sync across devices" desc="Sign in with your WCA account to sync sessions, solves and settings. Without it, everything stays on this device.">
        <button type="button" className="btn primary" onClick={() => void signIn()}>Sign in with WCA</button>
        {switchDialog}
      </SettingsRow>
    )
  }
  const who = sync.account ? `${sync.account.name}${sync.account.wcaId ? ` · ${sync.account.wcaId}` : ''}` : 'Signed in'
  return (
    <SettingsRow id="account" title={who} desc={syncStatus(sync.status, sync.lastSynced)}>
      <button type="button" className="btn" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
      <button type="button" className="btn" onClick={() => void signOut().then(() => toast('Signed out. Your solves stay on this device.'))}>Sign out</button>
      <button type="button" className="btn danger" onClick={() => setConfirmWipe(true)}>Delete synced data</button>
      <AnimatePresence>
        {confirmWipe && (
          <Dialog title="Delete your synced data?" onClose={() => setConfirmWipe(false)}>
            <p className="dim">This erases the copy of your sessions, solves and settings kept for syncing and signs out every device. Each device keeps the solves it already has.</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setConfirmWipe(false)}>Keep it</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmWipe(false)
                  deleteAccountData().then(
                    () => toast('Synced data deleted. This device keeps its solves.'),
                    () => toast('Could not delete the synced data. Check your connection and try again.'),
                  )
                }}
              >
                Delete synced data
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </SettingsRow>
  )
}

