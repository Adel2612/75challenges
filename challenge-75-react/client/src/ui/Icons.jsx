import React from 'react'

export const Icon = {
  Check: (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Photo: (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="2"/>
      <circle cx="8" cy="9" r="2" fill="currentColor"/>
      <path d="M4 17l5-5 3 3 4-4 4 4" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  ),
  Chart: (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 19V5M10 19v-8M16 19V7M22 19H2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Users: (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" stroke="currentColor" strokeWidth="2"/>
      <path d="M3 21a7 7 0 0118 0" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Settings: (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8c0 .66.38 1.27 1 1.51.16.07.33.1.5.1H21a2 2 0 010 4h-.09c-.17 0-.34.03-.5.1-.62.24-1 .85-1 1.51v1z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
}

