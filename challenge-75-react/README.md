Challenge 75 React + API

Overview
- Express + SQLite API: persists days, tasks, notes, weight, goals, and attachment metadata; stores files in server/uploads.
- React (Vite) client: grid of 75 days, daily tasks, details modal (note, weight, attachments), and goals manager.

Run (server)
1) cd challenge-75-react/server
2) npm install
3) npm run start
   - API runs on http://localhost:4000

Run (client)
1) cd challenge-75-react/client
2) npm install
3) npm run dev
   - App runs on http://localhost:5173
   - Uses VITE_API_URL from .env.development (defaults to http://localhost:4000)

Endpoints (selected)
- GET  /api/state                     -> full state
- PUT  /api/day/:day/tasks            -> update tasks {wo1,wo2,diet,water,read,photo}
- PUT  /api/day/:day/details          -> update {note, weight}
- GET  /api/day/:day/attachments      -> list attachments
- POST /api/day/:day/attachments      -> upload form-data field "files"
- GET  /api/attachments/:id/download  -> download
- DELETE /api/attachments/:id         -> delete
- GET  /api/goals                     -> list
- POST /api/goals                     -> create {title, due?}
- PUT  /api/goals/:id                 -> patch {title?, due?, done?, notes?}
- DELETE /api/goals/:id               -> remove

Notes
- Attachments are stored on disk under server/uploads/day-<n>/ and tracked in SQLite.
- Import/Export JSON excludes binary files (can be added later as a zip export if needed).

Deploy options
1) Render (самый простой, без Docker)
  - Подключите репозиторий в Render → New Web Service.
  - Root directory: `challenge-75-react/server`
  - Build command:
    `cd ../client && npm ci && npm run build && cd ../server && npm ci`
  - Start command: `node index.js`
  - После деплоя Render даст HTTPS‑домен. Клиент собран и отдается сервером автоматически.

2) VPS + Docker (авто‑HTTPS через Caddy)
  - Укажите свой домен в `challenge-75-react/deploy/Caddyfile` вместо `example.com`.
  - На сервере (Ubuntu): установите Docker и Git.
  - Склонируйте репо и выполните:
    - `cd challenge-75-react`
    - `docker compose -f docker-compose.prod.yml up -d --build`
  - Откройте `https://<ваш-домен>` — сертификаты выдаст Let’s Encrypt автоматически.
  - Данные хранятся в примонтированных папках: `server/data`, `server/uploads`.

3) Раздельный хостинг (Vercel/Netlify + Railway/Render)
  - Фронтенд: деплойте сборку клиента, установив `VITE_API_URL=https://<ваш-api>`.
  - Бэкенд: деплойте `challenge-75-react/server` как Node‑сервис (Render/Railway). CORS открыт по умолчанию.

Быстрая локальная публикация без домена
- Используйте Cloudflare Tunnel или ngrok, чтобы пробросить `http://localhost:4000` в интернет, не настраивая VPS/домен.
