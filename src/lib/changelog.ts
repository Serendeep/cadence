export interface Release {
  version: string
  /** ISO date of the release */
  date: string
  changes: string[]
}

/** What each version changed, newest first, in words for people who solve rather than people who code. */
export const CHANGELOG: Release[] = [
  {
    version: '0.1.6',
    date: '2026-11-10',
    changes: [
      'A tap or key press always stops the timer. Manual phase splits are gone; a connected smart cube still splits every solve on its own.',
      'With input set to smart cube and no cube connected, the timer says so.',
      'No more pile of empty "Main" sessions: every device shares one, and the extra empty ones are removed after your next sync.',
      'Menus near the edge of a phone screen stay fully on screen.',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-11-09',
    changes: [
      'Insights leads with your numbers: every average with its best and the day you set it, median, +2 and DNF counts, and sub-X counts. Coach moves to the end.',
      'Start a fresh session any day and switch the timer panel to All 3x3 for bests and long averages across every session. Archive old sessions, or merge two into one.',
      'Pick which OLL cases to drill, like PLL.',
      'The smart cube lab shows one phase bar sized by time, with moves and rotations for each phase.',
      'Red now only marks a personal best, the timer no longer repeats the same stats twice, and the Solves table puts your time first.',
      'Fixed: a drill could sit on "Generating scramble…" after reopening the timer.',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-11-08',
    changes: [
      'The changelog fits smaller screens and scrolls inside the popup.',
      'Deleting a solve updates the timer and solve list without waiting for the full history to reload. Undo still restores it.',
      'Smart cube results appear as soon as you finish, including splits and inspection penalties.',
      'A stalled sync request times out after 30 seconds so you can retry.',
      'Separated timer views, shared dialogs, solve details and settings features to make the code easier to maintain.',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-11-08',
    changes: [
      'Guided drills: from Coach, practise F2L, the last slot, OLL or PLL with scrambles that set up just that step. Pick which PLL cases to drill. Drill solves stay out of your stats.',
      'Roux: choose your method in Settings > Timing. Smart cubes split Roux solves into first block, second block, CMLL and LSE, and Coach compares them.',
      'Type times in: choose input > Type times in to record times from another timer.',
      'Smart cubes reconnect on their own after a dropout. A solve cut off mid-way waits for you to finish or discard it, and Finish solve saves one whose last turn never arrived.',
      'The desktop app saves a backup every day and keeps the last seven. The web app asks your browser to keep your solves.',
      'Settings is split into sections, and the text across the app is shorter.',
    ],
  },
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
