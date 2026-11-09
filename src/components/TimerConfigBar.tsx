import { useState } from 'react'
import { useSessionCounts, type SessionData } from '../hooks/useSessionData'
import { createSession, updateSession } from '../lib/db'
import { connectCube, connectExternal, disconnectCube, disconnectExternal, useDevices, type CubeKind } from '../lib/deviceStore'
import { bluetoothAvailable } from '../lib/devices'
import { EVENTS, eventById, isBlind } from '../lib/events'
import { setSettings, type InputMethod, type Settings } from '../lib/settings'
import type { Session } from '../lib/types'
import { Menu } from './Menu'

const INPUT_LABEL: Record<InputMethod, string> = { keyboard: 'keyboard', typing: 'typing', stackmat: 'stackmat', gantimer: 'gan timer', smartcube: 'smart cube' }

/** Event, session, inspection, input and phases as a row of quiet text menus. */
export function TimerConfigBar({ data, settings }: { data: SessionData; settings: Settings }) {
  const devices = useDevices()
  const counts = useSessionCounts()
  const [showArchived, setShowArchived] = useState(false)
  const ev = eventById(data.session?.event ?? '333')
  const isOpen = (s: Session) => s.id === data.session?.id
  const archived = data.sessions.filter((s) => s.archived && !isOpen(s))
  const sessionItem = (s: Session) => ({
    key: String(s.id),
    label: s.name,
    hint: `${eventById(s.event).short} · ${(counts.get(s.id!) ?? 0).toLocaleString()}`,
    checked: isOpen(s),
    onSelect: () => {
      // the open session always shows in the menu, so picking an archived one brings it back
      if (s.archived) void updateSession(s.id!, { archived: false })
      setSettings({ sessionId: s.id! })
    },
  })

  const chooseEvent = async (id: string) => {
    const s = data.session
    if (s?.id == null) return
    if (data.solves.length === 0) return void updateSession(s.id, { event: id })
    const existing = data.sessions.find((x) => x.event === id)
    const target = existing?.id ?? (await createSession(eventById(id).short, id))
    setSettings({ sessionId: target })
  }

  const chooseInput = (input: InputMethod, cube?: CubeKind) => {
    setSettings({ input })
    if (input === 'stackmat' || input === 'gantimer') {
      disconnectCube()
      void connectExternal(input)
    } else if (input === 'smartcube' && cube) {
      disconnectExternal()
      void connectCube(cube)
    } else {
      disconnectExternal()
      disconnectCube()
    }
  }

  const bt = bluetoothAvailable()
  const inputLabel = devices.connecting ? `connecting ${devices.connecting}…` : INPUT_LABEL[settings.input]

  return (
    <div className="cfg chrome">
      <Menu
        label="Puzzle"
        trigger={<b>{ev.short}</b>}
        items={EVENTS.map((e) => ({ key: e.id, label: e.name, checked: e.id === ev.id, onSelect: () => void chooseEvent(e.id) }))}
      />
      <Menu
        label="Session"
        trigger={<>session <b>{data.session?.name ?? '…'}</b></>}
        items={[
          ...data.sessions.filter((s) => !archived.includes(s)).map(sessionItem),
          'sep' as const,
          {
            key: 'new',
            label: 'New session',
            onSelect: () => void createSession(`${ev.short} ${data.sessions.length + 1}`, ev.id).then((id) => setSettings({ sessionId: id })),
          },
          ...(archived.length
            ? [
                { key: 'archived', label: `Archived (${archived.length})`, hint: showArchived ? '‹' : '›', keepOpen: true, onSelect: () => setShowArchived((v) => !v) },
                ...(showArchived ? archived.map(sessionItem) : []),
              ]
            : []),
        ]}
      />
      {isBlind(ev.id) ? (
        <span className="textbtn" title="WCA blindfolded events have no inspection">inspection <b>none</b></span>
      ) : (
        <button type="button" className="textbtn" onClick={() => setSettings({ inspection: !settings.inspection })} aria-pressed={settings.inspection}>
          inspection <b>{settings.inspection ? '15s' : 'off'}</b>
        </button>
      )}
      <Menu
        label="Input"
        trigger={<>input <b>{inputLabel}</b></>}
        items={[
          { key: 'kb', label: 'Keyboard and touch', checked: settings.input === 'keyboard', onSelect: () => chooseInput('keyboard') },
          { key: 'ty', label: 'Type times in', checked: settings.input === 'typing', onSelect: () => chooseInput('typing') },
          { key: 'sm', label: 'Stackmat (audio jack)', checked: settings.input === 'stackmat', onSelect: () => chooseInput('stackmat') },
          ...(bt
            ? [
                { key: 'gt', label: 'GAN Smart Timer', checked: settings.input === 'gantimer', onSelect: () => chooseInput('gantimer') },
                'sep' as const,
                { key: 'gan', label: 'GAN smart cube', onSelect: () => chooseInput('smartcube', 'gan') },
                { key: 'my32', label: 'MoYu V10 AI / MoYu32', onSelect: () => chooseInput('smartcube', 'moyu32') },
                { key: 'my', label: 'MoYu WeiLong AI', onSelect: () => chooseInput('smartcube', 'moyu') },
                { key: 'other', label: 'GiiKER, GoCube, QiYi, HeyKube', onSelect: () => chooseInput('smartcube', 'other') },
              ]
            : []),
        ]}
      />
      <Menu
        label="Phases"
        trigger={<>phases <b>{settings.phases === 1 ? 'off' : settings.phases === 4 ? 'cfop' : settings.phases}</b></>}
        items={[1, 2, 3, 4].map((n) => ({
          key: String(n),
          label: n === 1 ? 'Off' : n === 4 ? '4 (cross, F2L, OLL, PLL)' : `${n} phases`,
          checked: settings.phases === n,
          onSelect: () => setSettings({ phases: n }),
        }))}
      />
    </div>
  )
}

