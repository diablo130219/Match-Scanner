# MagicScanner V2

Questa versione separa i dati dalla grafica.

## Cosa cambia

- `data/matches.js` alimenta la home e la pagina match.
- `data/matches.json` è la copia JSON pronta per script/import futuri.
- `data/details/` contiene le 3 schede complete già esistenti, caricate dinamicamente da una sola `match.html`.
- `data/detail-manifest.js` collega l'ID della partita alla scheda dettagliata.
- `tools/import_soccerstats_markdown.py` è un importer iniziale per trasformare un export Markdown SoccerSTATS in JSON grezzo strutturato.
- `marketType` è normalizzato a `nobet`.

## Avvio

```bash
npm install
npm run dev
```

## Aggiungere una scheda completa

1. Crea `data/details/id-partita.html`.
2. Aggiungi la voce in `data/detail-manifest.js`.
3. La stessa `match.html` la caricherà automaticamente con `?id=id-partita`.

## Passo successivo

Collegare l'importer SoccerSTATS direttamente al generatore dei blocchi HTML/JSON, così le schede vengono create in batch senza copia/incolla partita per partita.
