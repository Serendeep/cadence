import { motion } from 'motion/react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { DNF, formatMs } from '../lib/time'

const PAD = { l: 44, r: 12, t: 10, b: 24 }

/** Round tick step (in the value's unit) so 3-5 gridlines land on whole numbers. */
function niceStep(range: number, target = 4): number {
  const raw = range / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow)
}

function ticks(lo: number, hi: number, target = 4): number[] {
  if (hi <= lo) hi = lo + 1
  const step = niceStep(hi - lo, target)
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Number(v.toFixed(6)))
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step)
  return out
}

const secs = (ms: number) => {
  const s = ms / 1000
  return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Number(s.toFixed(1))}`
}

/** Callback ref that tracks the element's width, so charts redraw crisply instead of scaling. */
function useWidth(initial = 640): [(el: HTMLDivElement | null) => void, number] {
  const [w, setW] = useState(initial)
  const obs = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect()
    if (!el) return
    obs.current = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))))
    obs.current.observe(el)
  }, [])
  return [ref, w]
}

export interface Series {
  name: string
  values: (number | null)[]
  color: string
  width?: number
  dots?: boolean
}

interface LineChartProps {
  series: Series[]
  height?: number
  /** x labels: index -> label */
  xLabel?: (i: number) => string
  marks?: { index: number; label: string }[]
}

/** Times over solves. Y in seconds with round ticks; DNFs are skipped; gaps stay gaps. */
export function LineChart({ series, height = 220, xLabel = (i) => String(i + 1), marks = [] }: LineChartProps) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(0, ...series.map((s) => s.values.length))
  const finite = series.flatMap((s) => s.values.filter((v): v is number => v != null && v !== DNF))
  if (!n || !finite.length) return <div className="empty">No finished solves to draw yet.</div>
  // clip the long tail so one 2-minute disaster does not flatten everything else
  const sorted = [...finite].sort((a, b) => a - b)
  const top = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]
  // one solve, or all the same time, still needs a range around it, or every tick reads the same
  const [lo, hi] = sorted[0] === top ? [sorted[0] * 0.9, top * 1.1] : [sorted[0], top]
  const yt = ticks(Math.max(0, lo - (hi - lo) * 0.05), hi)
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const iw = width - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD.t + ih - ((Math.min(v, y1) - y0) / (y1 - y0)) * ih
  const xt = Array.from(new Set(Array.from({ length: Math.min(6, n) }, (_, k) => Math.round((k / Math.max(1, Math.min(6, n) - 1)) * (n - 1)))))

  const path = (vals: (number | null)[]) => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null || v === DNF) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - PAD.l) / iw) * (n - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Times over solves">
        {yt.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end">{secs(v)}</text>
          </g>
        ))}
        {xt.map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{xLabel(i)}</text>
        ))}
        {marks.map((m) => (
          <g key={m.index}>
            <line x1={x(m.index)} x2={x(m.index)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--line)" strokeDasharray="3 3" />
          </g>
        ))}
        {series.map((s) =>
          s.dots ? (
            <g key={s.name} fill={s.color}>
              {s.values.map((v, i) => (v == null || v === DNF ? null : <circle key={i} cx={x(i)} cy={y(v)} r={n > 300 ? 1.2 : 2} />))}
            </g>
          ) : (
            <motion.path
              key={s.name}
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
            />
          ),
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--dim)" strokeWidth={1} />}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: Math.min(width - 150, x(hover) + 10), top: 8 }}>
          <div className="dim">{xLabel(hover)}</div>
          {series.map((s) => (
            <div key={s.name} className="num">
              <span className="dim">{s.name}</span> {formatMs(s.values[hover])}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Equal-width histogram; the bar holding the current ao12 is drawn in the accent. */
export function Histogram({ bins, highlight, height = 200 }: { bins: { from: number; to: number; count: number }[]; highlight?: number | null; height?: number }) {
  const [ref, width] = useWidth()
  if (!bins.length) return <div className="empty">No finished solves to count yet.</div>
  const max = Math.max(...bins.map((b) => b.count))
  const yt = ticks(0, max, 3).filter((v) => Number.isInteger(v))
  const top = yt[yt.length - 1]
  const iw = width - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const bw = iw / bins.length
  const labelEvery = Math.ceil(bins.length / 6)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Distribution of times">
        {yt.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={width - PAD.r} y1={PAD.t + ih - (v / top) * ih} y2={PAD.t + ih - (v / top) * ih} />
            <text x={PAD.l - 8} y={PAD.t + ih - (v / top) * ih + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {bins.map((b, i) => {
          const h = (b.count / top) * ih
          const hot = highlight != null && highlight >= b.from && highlight < b.to
          return (
            <motion.rect
              key={b.from}
              x={PAD.l + i * bw + 1}
              width={Math.max(1, bw - 2)}
              y={PAD.t + ih - h}
              height={h}
              fill={hot ? 'var(--acc)' : 'var(--dim)'}
              opacity={hot ? 1 : 0.55}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              style={{ transformOrigin: `0px ${PAD.t + ih}px` }}
              transition={{ delay: i * 0.015, duration: 0.4 }}
            >
              <title>{`${secs(b.from)}–${secs(b.to)} s: ${b.count}`}</title>
            </motion.rect>
          )
        })}
        {bins.map((b, i) => (i % labelEvery === 0 ? <text key={b.from} x={PAD.l + i * bw} y={height - 6}>{secs(b.from)}</text> : null))}
      </svg>
    </div>
  )
}

/** Weekday by hour practice grid, one hue whose strength is the solve count. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat())
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, 1fr)', gap: 3, fontSize: 11, color: 'var(--faint)' }} role="img" aria-label="Solves by weekday and hour">
      {grid.map((row, d) => (
        <Row key={d} label={days[d]}>
          {row.map((c, h) => (
            <div
              key={h}
              title={`${days[d]} ${String(h).padStart(2, '0')}:00, ${c} solves`}
              style={{ height: 16, borderRadius: 3, background: c ? 'var(--acc)' : 'var(--surface)', opacity: c ? 0.25 + 0.75 * (c / max) : 1 }}
            />
          ))}
        </Row>
      ))}
      <span />
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} style={{ textAlign: 'center' }}>{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span style={{ alignSelf: 'center' }}>{label}</span>
      {children}
    </>
  )
}
