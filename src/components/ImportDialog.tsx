import type { ImportedData } from '../lib/importExport'
import { eventById } from '../lib/events'
import { Dialog } from './Dialog'

export interface ImportPreview {
  file: string
  data: ImportedData
  duplicates: number
  /** Per imported session: true when it tops up a session already here */
  merges: boolean[]
}

const dateRange = (dates: number[]) => {
  if (!dates.length) return ''
  const fmt = (d: number) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const [from, to] = [fmt(Math.min(...dates)), fmt(Math.max(...dates))]
  return from === to ? `from ${from}` : `${from} to ${to}`
}

/** What a file holds, before anything is written. */
export function ImportDialog({ preview, onCancel, onConfirm }: { preview: ImportPreview; onCancel: () => void; onConfirm: () => void }) {
  const { data, duplicates } = preview
  const counts = data.sessions.map((_, i) => data.solves.filter((s) => s.sessionIndex === i).length)
  const nothing = data.solves.length === 0
  return (
    <Dialog title={nothing ? 'Nothing new to import' : `Import ${data.solves.length.toLocaleString()} solves?`} onClose={onCancel}>
      <p className="dim">
        {nothing
          ? `Every solve in ${preview.file} is already here.`
          : `${preview.file}, solves ${dateRange(data.solves.map((s) => s.date))}.`}
        {duplicates > 0 && !nothing && ` ${duplicates.toLocaleString()} solves you already have are skipped.`}
        {data.skipped > 0 && ` ${data.skipped.toLocaleString()} unreadable rows are skipped.`}
      </p>
      {!nothing && (
        <ul className="import-list">
          {data.sessions.map((s, i) => (
            <li key={i}>
              <span>
                {s.name}
                {eventById(s.event).short !== s.name && <span className="dim"> · {eventById(s.event).short}</span>}
              </span>
              <span className="dim">{preview.merges[i] ? 'adds to yours' : 'new session'}</span>
              <b className="num">{counts[i].toLocaleString()}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>{nothing ? 'Close' : 'Cancel'}</button>
        {!nothing && <button type="button" className="btn primary" onClick={onConfirm} autoFocus>Import</button>}
      </div>
    </Dialog>
  )
}

