import { useMemo, useState } from 'react'
import { endDrill } from '../lib/drillMode'
import { DRILL_NAMES, PLL_NAMES } from '../lib/drills'
import { setSettings, type DrillMode } from '../lib/settings'
import { mean } from '../lib/stats'
import { formatMs, solveValue } from '../lib/time'
import type { Solve } from '../lib/types'

/** Drill name, count and mean while a guided drill runs, with the PLL case picker and the way out. */
export function DrillBanner({ drill, solves, decimals }: { drill: DrillMode; solves: readonly Solve[]; decimals: 2 | 3 }) {
  const [picking, setPicking] = useState(false)
  const done = useMemo(() => solves.filter((s) => s.drill === drill.kind).map(solveValue), [solves, drill.kind])
  const chosen = drill.cases ?? PLL_NAMES
  const toggle = (name: string) => {
    const next = chosen.includes(name) ? chosen.filter((c) => c !== name) : [...chosen, name]
    // at least one case has to stay, or there is nothing to scramble
    if (next.length) setSettings({ drill: { ...drill, cases: next.length === PLL_NAMES.length ? null : next } })
  }

  return (
    <div className="drill-banner chrome">
      <div className="drill-bar">
        <span>
          <b>{DRILL_NAMES[drill.kind]}</b> · {done.length} {done.length === 1 ? 'solve' : 'solves'}
          {done.length > 0 && <> · mean <b className="num">{formatMs(mean(done), decimals)}</b></>}
        </span>
        {drill.kind === 'pll' && (
          <button type="button" className="btn ghost" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            Cases {drill.cases ? `${chosen.length}/${PLL_NAMES.length}` : ''}
          </button>
        )}
        <button type="button" className="btn" onClick={endDrill}>End drill</button>
      </div>
      {picking && (
        <fieldset className="drill-cases">
          <legend className="dim">PLL cases to practise</legend>
          {PLL_NAMES.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={chosen.includes(name)} onChange={() => toggle(name)} /> {name}
            </label>
          ))}
          <button type="button" className="btn ghost" onClick={() => setSettings({ drill: { ...drill, cases: null } })}>All</button>
        </fieldset>
      )}
    </div>
  )
}
