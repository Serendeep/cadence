import type { ReactNode } from 'react'

export function SettingsRow({ title, desc, children, id }: { title: string; desc?: string; children: ReactNode; id?: string }) {
  return (
    <div className="setting" id={id}>
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      <div className="ctl">{children}</div>
    </div>
  )
}

