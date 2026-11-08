export interface Release {
  version: string
  /** ISO date of the release */
  date: string
  changes: string[]
}

/** What each version changed, newest first, in words for people who solve rather than people who code. */
export const CHANGELOG: Release[] = [
  {
    version: '0.1.2',
    date: '2026-11-08',
    changes: [
      'Coach (turn it on in Settings): after a break it sums up your sitting, and in Insights it names what costs you the most time, suggests a drill and shows your before and after.',
      'Histories of 40,000 solves and more open in a fraction of a second on the timer, Solves and Insights.',
      'Sync sends big histories in batches and waits out busy moments instead of failing.',
      'Dialogs keep the keyboard inside them and return it where it was when they close.',
      'Faint text, buttons and error messages are easier to read in every theme.',
      'This list: after each update, the timer offers to show what changed.',
    ],
  },
]

/** Releases newer than `since`, newest first. */
export function changesSince(since: string): Release[] {
  return CHANGELOG.filter((r) => compareVersions(r.version, since) > 0)
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}
