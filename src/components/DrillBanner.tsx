import { useMemo, useState } from 'react'
import { endDrill } from '../lib/drillMode'
import { DRILL_CASES, DRILL_NAMES, OLL_GROUPS } from '../lib/drills'
import { setSettings, type DrillMode } from '../lib/settings'
import { mean } from '../lib/stats'
import { formatMs, solveValue } from '../lib/time'
import type { Solve } from '../lib/types'

/** Drill name, count and mean while a guided drill runs, with the OLL/PLL case picker and the way out. */
export function DrillBanner({ drill, solves, decimals }: { drill: DrillMode; solves: readonly Solve[]; decimals: 2 | 3 }) {
  const [picking, setPicking] = useState(false)
  const done = useMemo(() => solves.filter((s) => s.drill === drill.kind).map(solveValue), [solves, drill.kind])
  const table = DRILL_CASES[drill.kind]
  const all = table ? Object.keys(table) : []
  const chosen = drill.cases ?? all
  const choose = (next: string[]) => setSettings({ drill: { ...drill, cases: next.length === all.length ? null : next } })
  const toggle = (name: string) => choose(chosen.includes(name) ? chosen.filter((c) => c !== name) : [...chosen, name])
  const box = (name: string, label = name) => (
    <label key={name}>
      <input type="checkbox" checked={chosen.includes(name)} onChange={() => toggle(name)} /> {label}
    </label>
  )

  return (
    <div className="drill-banner chrome">
      <div className="drill-bar">
        <span>
          <b>{DRILL_NAMES[drill.kind]}</b> · {done.length} {done.length === 1 ? 'solve' : 'solves'}
          {done.length > 0 && <> · mean <b className="num">{formatMs(mean(done), decimals)}</b></>}
        </span>
        {table && (
          <button type="button" className="btn ghost" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            Cases {drill.cases ? `${chosen.length}/${all.length}` : ''}
          </button>
        )}
        <button type="button" className="btn" onClick={endDrill}>End drill</button>
      </div>
      {picking && table && (
        <fieldset className={`drill-cases${drill.kind === 'oll' ? ' grouped' : ''}`}>
          <legend className="dim">
            {DRILL_NAMES[drill.kind]} cases to practise{chosen.length === 0 && '. None picked, so any case comes up.'}
          </legend>
          {drill.kind === 'oll'
            ? Object.entries(OLL_GROUPS).map(([group, nums]) => {
              const names = nums.map((n) => `OLL ${n}`)
              const full = names.every((n) => chosen.includes(n))
              return (
                <div key={group} className="drill-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={full}
                      onChange={() => choose(full ? chosen.filter((c) => !names.includes(c)) : [...new Set([...chosen, ...names])])}
                    /> {group}
                  </label>
                  {names.map((n, i) => box(n, String(nums[i])))}
                </div>
              )
            })
            : all.map((name) => box(name))}
          <div className="drill-all">
            <button type="button" className="btn ghost" onClick={() => choose(all)}>All</button>
            <button type="button" className="btn ghost" onClick={() => choose([])}>None</button>
          </div>
        </fieldset>
      )}
    </div>
  )
}
