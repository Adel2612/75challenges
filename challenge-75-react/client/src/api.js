const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function req(path, opts) {
  const r = await fetch(API + path, opts)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('application/json')) return r.json()
  return r.text()
}

export const api = {
  state: () => req('/api/state'),
  setTasks: (day, tasks) => req(`/api/day/${day}/tasks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tasks) }),
  setDetails: (day, details) => req(`/api/day/${day}/details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) }),
  taskTypes: {
    list: () => req('/api/tasks/types'),
    add: (title, emoji) => req('/api/tasks/types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, emoji }) }),
    update: (key, patch) => req(`/api/tasks/types/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
    remove: (key) => req(`/api/tasks/types/${key}`, { method: 'DELETE' })
  },
  goals: {
    list: () => req('/api/goals'),
    add: (title, due) => req('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, due }) }),
    update: (id, patch) => req(`/api/goals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
    remove: id => req(`/api/goals/${id}`, { method: 'DELETE' })
  },
  attachments: {
    list: day => req(`/api/day/${day}/attachments`),
    upload: async (day, files) => {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      return req(`/api/day/${day}/attachments`, { method: 'POST', body: fd })
    },
    remove: id => req(`/api/attachments/${id}`, { method: 'DELETE' }),
    downloadUrl: id => `${API}/api/attachments/${id}/download`,
    viewUrl: id => `${API}/api/attachments/${id}/view`
  },
  ascetics: {
    list: () => req('/api/ascetics'),
    create: (title, reward, duration, startDate) => req('/api/ascetics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, reward, duration, startDate }) }),
    get: (id) => req(`/api/ascetics/${id}`),
    setDay: (id, day, patch) => req(`/api/ascetics/${id}/day/${day}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
    remove: (id) => req(`/api/ascetics/${id}`, { method: 'DELETE' }),
    attachments: {
      list: (id) => req(`/api/ascetics/${id}/attachments`),
      upload: (id, files, day=null) => {
        const fd = new FormData()
        for (const f of files) fd.append('files', f)
        const q = day!=null ? `?day=${day}` : ''
        return req(`/api/ascetics/${id}/attachments${q}`, { method: 'POST', body: fd })
      },
      remove: (attId) => req(`/api/ascetics/attachments/${attId}`, { method: 'DELETE' }),
      viewUrl: (attId) => `${API}/api/ascetics/attachments/${attId}/view`,
      downloadUrl: (attId) => `${API}/api/ascetics/attachments/${attId}/download`,
    }
  },
  reset: () => req('/api/reset', { method: 'POST' })
}
