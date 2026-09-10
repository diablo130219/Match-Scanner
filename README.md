# Match Scanner - fix multipage + stemmi

Fix principali:
- Vite configurato come progetto multipagina.
- `index.html` e `match.html` vengono entrambi generati in `dist`.
- Il click dalla home apre `match.html?id=...` nella stessa scheda.
- Gli stemmi noti usano URL salvati nel progetto.
- Per le altre squadre resta il fallback TheSportsDB.

Render:
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
