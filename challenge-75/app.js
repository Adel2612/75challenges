;(function () {
  const DAYS_TOTAL = 75
  const TASKS = [
    { key: 'wo1', label: 'Тренировка 1' },
    { key: 'wo2', label: 'Тренировка 2 (улица)' },
    { key: 'diet', label: 'Питание по плану' },
    { key: 'water', label: 'Вода 3.8л' },
    { key: 'read', label: 'Чтение 10 страниц' },
    { key: 'photo', label: 'Фото прогресса' },
  ]

  const STORAGE_KEY = 'challenge75:v1'

  // Simple ID generator for goals/attachments
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

  // IndexedDB for attachments (binary)
  const idb = {
    db: null,
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('challenge75', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('attachments')) {
            db.createObjectStore('attachments')
          }
        }
        req.onsuccess = () => { this.db = req.result; resolve() }
        req.onerror = () => reject(req.error)
      })
    },
    put(key, blob) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('attachments', 'readwrite')
        tx.objectStore('attachments').put(blob, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    get(key) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('attachments', 'readonly')
        const req = tx.objectStore('attachments').get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    },
    del(key) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('attachments', 'readwrite')
        tx.objectStore('attachments').delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
  }

  function initState() {
    const blankDay = () => Object.assign(
      Object.fromEntries(TASKS.map(t => [t.key, false])),
      { note: '', weight: null, attachments: [] }
    )
    const days = Array.from({ length: DAYS_TOTAL }, () => blankDay())
    const goals = []
    return { days, goals, startedAt: new Date().toISOString() }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return initState()
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.days) || parsed.days.length !== DAYS_TOTAL) {
        return initState()
      }
      return parsed
    } catch {
      return initState()
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  function computeStats(state) {
    let tasksDone = 0
    let tasksTotal = DAYS_TOTAL * TASKS.length
    let fullDays = 0
    state.days.forEach(d => {
      const completed = TASKS.every(t => !!d[t.key])
      if (completed) fullDays += 1
      tasksDone += TASKS.reduce((acc, t) => acc + (d[t.key] ? 1 : 0), 0)
    })
    const percent = Math.round((tasksDone / tasksTotal) * 100)
    // weight stats
    const weights = state.days.map(d => d.weight).filter(w => typeof w === 'number' && !Number.isNaN(w))
    const weightStats = weights.length
      ? { min: Math.min(...weights), max: Math.max(...weights), avg: +(weights.reduce((a,b)=>a+b,0)/weights.length).toFixed(1), last: weights[weights.length-1] }
      : null
    return { tasksDone, tasksTotal, fullDays, percent, weightStats }
  }

  function renderStats(state) {
    const s = document.getElementById('stats')
    const { tasksDone, tasksTotal, fullDays, percent, weightStats } = computeStats(state)
    let extra = ''
    if (weightStats) {
      extra = ` | Вес (мин/ср/макс/посл): ${weightStats.min}/${weightStats.avg}/${weightStats.max}/${weightStats.last}`
    }
    s.textContent = `Прогресс: ${percent}% | Выполнено задач: ${tasksDone}/${tasksTotal} | Закрыто дней: ${fullDays}/${DAYS_TOTAL}${extra}`
  }

  function dayProgress(day) {
    const done = TASKS.reduce((acc, t) => acc + (day[t.key] ? 1 : 0), 0)
    return { done, total: TASKS.length }
  }

  function makeDayCard(state, dayIndex) {
    const day = state.days[dayIndex]
    const card = document.createElement('div')
    card.className = 'day' + (TASKS.every(t => day[t.key]) ? ' done' : '')

    const header = document.createElement('div')
    header.className = 'day-header'
    const title = document.createElement('div')
    title.className = 'day-title'
    title.textContent = `День ${dayIndex + 1}`
    title.title = 'Клик — отметить все задачи как выполненные/снять'
    title.addEventListener('click', () => {
      const allDone = TASKS.every(t => day[t.key])
      TASKS.forEach(t => (day[t.key] = !allDone))
      saveState(state)
      rerender(state)
    })
    const p = dayProgress(day)
    const progress = document.createElement('div')
    progress.className = 'day-progress'
    progress.textContent = `${p.done}/${p.total}`
    header.append(title, progress)

    const tasksWrap = document.createElement('div')
    tasksWrap.className = 'tasks'

    TASKS.forEach(task => {
      const row = document.createElement('div')
      row.className = 'task'

      const id = `d${dayIndex}_${task.key}`
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.id = id
      cb.checked = !!day[task.key]
      cb.addEventListener('change', () => {
        day[task.key] = cb.checked
        saveState(state)
        rerender(state)
      })

      const label = document.createElement('label')
      label.setAttribute('for', id)
      label.textContent = task.label

      row.append(cb, label)
      tasksWrap.append(row)
    })

    const openDetails = document.createElement('button')
    openDetails.className = 'btn'
    openDetails.textContent = 'Детали'
    openDetails.addEventListener('click', () => showDetails(state, dayIndex))
    tasksWrap.append(openDetails)

    card.append(header, tasksWrap)
    return card
  }

  function renderGrid(state) {
    const root = document.getElementById('daysGrid')
    root.innerHTML = ''
    for (let i = 0; i < DAYS_TOTAL; i++) {
      root.appendChild(makeDayCard(state, i))
    }
  }

  function rerender(state) {
    renderGrid(state)
    renderStats(state)
    renderGoals(state)
  }

  function exportJson(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'challenge75-progress.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function attachControls(state) {
    document.getElementById('resetAll').addEventListener('click', () => {
      if (!confirm('Сбросить весь прогресс?')) return
      const fresh = initState()
      saveState(fresh)
      rerender(fresh)
      // Replace in-memory state reference
      Object.assign(state, fresh)
    })

    document.getElementById('exportData').addEventListener('click', () => exportJson(state))

    document.getElementById('importData').addEventListener('change', async ev => {
      const file = ev.target.files && ev.target.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (!Array.isArray(data.days) || data.days.length !== DAYS_TOTAL) throw new Error('Неверный формат')
        saveState(data)
        Object.assign(state, data)
        rerender(state)
      } catch (e) {
        alert('Не удалось импортировать данные: ' + (e?.message || 'ошибка'))
      } finally {
        ev.target.value = ''
      }
    })
  }

  // Bootstrap
  const state = loadState()
  idb.open().then(() => {
    attachControls(state)
    bindDetails(state)
    bindGoals(state)
    rerender(state)
  })

  // ------- Day details (notes/weight/attachments) -------
  let detailsIdx = null
  function bindDetails(state) {
    document.getElementById('detailsClose').addEventListener('click', () => hideDetails())
    document.getElementById('saveDetails').addEventListener('click', () => {
      if (detailsIdx == null) return
      const d = state.days[detailsIdx]
      d.note = document.getElementById('noteInput').value
      const w = document.getElementById('weightInput').value
      d.weight = w === '' ? null : Number(w)
      saveState(state)
      rerender(state)
      hideDetails()
    })
    document.getElementById('attachInput').addEventListener('change', async (ev) => {
      if (detailsIdx == null) return
      const files = Array.from(ev.target.files || [])
      const d = state.days[detailsIdx]
      for (const f of files) {
        const id = uid()
        await idb.put(`att:${id}`, f)
        d.attachments.push({ id, name: f.name, type: f.type || 'application/octet-stream', size: f.size })
      }
      saveState(state)
      renderAttachments(state, detailsIdx)
      ev.target.value = ''
    })
  }

  function showDetails(state, idx) {
    detailsIdx = idx
    const d = state.days[idx]
    document.getElementById('detailsTitle').textContent = `День ${idx + 1}`
    document.getElementById('noteInput').value = d.note || ''
    document.getElementById('weightInput').value = d.weight ?? ''
    renderAttachments(state, idx)
    renderWeightStats(state)
    document.getElementById('details').classList.remove('hidden')
  }
  function hideDetails() { document.getElementById('details').classList.add('hidden'); detailsIdx = null }

  function renderWeightStats(state) {
    const w = computeStats(state).weightStats
    const el = document.getElementById('weightStats')
    if (!w) el.textContent = 'Пока нет данных по весу'
    else el.textContent = `Мин: ${w.min} | Ср: ${w.avg} | Макс: ${w.max} | Последний: ${w.last}`
  }

  async function renderAttachments(state, idx) {
    const list = document.getElementById('attachList')
    list.innerHTML = ''
    const d = state.days[idx]
    for (const a of d.attachments) {
      const row = document.createElement('div')
      row.className = 'attach-item'
      const name = document.createElement('div')
      name.textContent = a.name
      const viewBtn = document.createElement('button')
      viewBtn.className = 'btn'
      viewBtn.textContent = 'Скачать'
      viewBtn.addEventListener('click', async () => {
        const blob = await idb.get(`att:${a.id}`)
        if (!blob) return alert('Файл не найден')
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = a.name
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
      })
      const delBtn = document.createElement('button')
      delBtn.className = 'btn danger'
      delBtn.textContent = 'Удалить'
      delBtn.addEventListener('click', async () => {
        await idb.del(`att:${a.id}`)
        d.attachments = d.attachments.filter(x => x.id !== a.id)
        saveState(state)
        renderAttachments(state, idx)
      })
      row.append(name, viewBtn, delBtn)
      list.append(row)
    }
  }

  // ------- Goals -------
  function bindGoals(state) {
    document.getElementById('addGoal').addEventListener('click', () => {
      const title = document.getElementById('newGoalTitle').value.trim()
      const due = document.getElementById('newGoalDue').value || null
      if (!title) return
      state.goals.push({ id: uid(), title, due, done: false, notes: '' })
      document.getElementById('newGoalTitle').value = ''
      document.getElementById('newGoalDue').value = ''
      saveState(state)
      renderGoals(state)
    })
  }

  function renderGoals(state) {
    const root = document.getElementById('goalsList')
    root.innerHTML = ''
    state.goals.forEach(goal => {
      const row = document.createElement('div')
      row.className = 'goal' + (goal.done ? ' done' : '')

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !!goal.done
      cb.addEventListener('change', () => { goal.done = cb.checked; saveState(state) })

      const textWrap = document.createElement('div')
      const title = document.createElement('input')
      title.className = 'input'
      title.type = 'text'
      title.value = goal.title
      title.placeholder = 'Название цели'
      title.addEventListener('change', () => { goal.title = title.value; saveState(state) })
      const notes = document.createElement('input')
      notes.className = 'input'
      notes.type = 'text'
      notes.placeholder = 'Заметки'
      notes.value = goal.notes || ''
      notes.addEventListener('change', () => { goal.notes = notes.value; saveState(state) })
      const due = document.createElement('div')
      due.className = 'due'
      due.textContent = goal.due ? `Срок: ${goal.due}` : 'Без срока'
      textWrap.append(title, notes, due)

      const actions = document.createElement('div')
      actions.className = 'actions'
      const editDue = document.createElement('input')
      editDue.type = 'date'
      editDue.className = 'input'
      if (goal.due) editDue.value = goal.due
      editDue.addEventListener('change', () => { goal.due = editDue.value || null; saveState(state); renderGoals(state) })
      const del = document.createElement('button')
      del.className = 'btn danger'
      del.textContent = 'Удалить'
      del.addEventListener('click', () => {
        state.goals = state.goals.filter(g => g.id !== goal.id)
        saveState(state)
        renderGoals(state)
      })
      actions.append(editDue, del)

      row.append(cb, textWrap, actions)
      root.append(row)
    })
  }
})()
