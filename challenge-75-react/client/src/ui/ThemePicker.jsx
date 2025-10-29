import React from 'react'

const THEMES = [
  { key: 'pink', label: 'Розовая' },
  { key: 'light', label: 'Светлая' },
  { key: 'blue', label: 'Синяя' },
  { key: 'dark', label: 'Тёмная' }
]

export default function ThemePicker({ value, onChange }) {
  return (
    <div className="row">
      {THEMES.map(t => (
        <button key={t.key} className="btn" style={{opacity: value===t.key?1:0.7}} onClick={()=>onChange?.(t.key)}>{t.label}</button>
      ))}
    </div>
  )
}

