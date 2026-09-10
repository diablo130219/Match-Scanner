# Match Scanner - fix apertura/stemmi

Correzioni:
- le partite si aprono nello stesso index.html;
- nessun `window.location` verso una seconda pagina;
- click via `data-match-id` + `addEventListener`;
- rimosso lo scroll forzato a inizio pagina;
- endpoint TheSportsDB corretto a `/3/`;
- Estrela Amadora - Sporting Braga contiene i dati completi già caricati.

Render:
- se il servizio usa già `npm ci && npm run build`, puoi lasciarlo se nel repository è presente package-lock.json;
- altrimenti usa `npm install && npm run build`;
- Publish Directory: `dist`.
