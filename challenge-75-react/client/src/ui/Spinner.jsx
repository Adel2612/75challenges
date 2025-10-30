import React from 'react'

export default function Spinner({ size=24 }) {
  const s = { width: size, height: size }
  return (
    <div className="spinner" style={s} aria-label="Загрузка" />
  )
}

