# Knightmare League – Sleeper WebApp

Kleine React + Vite WebApp, die eine Sleeper Fantasy-NFL-Liga live über die
öffentliche [Sleeper API](https://docs.sleeper.com/) anzeigt. Kein eigenes
Backend nötig – alle Daten werden direkt im Browser von `api.sleeper.app`
geladen.

## Features

- **Rangliste** – alle Teams sortiert nach Siegen/Punkten
- **Teilnehmer** – Übersicht aller Liga-Mitglieder mit Team-Namen/Avatar
- **Top Spieler** – rosterte Spieler der Liga, sortiert nach Fantasy-Punkten
  (berechnet aus dem echten Scoring der Liga) bzw. nach Sleeper-Ranking,
  solange noch keine Woche der reg. Saison gespielt wurde. Filterbar nach Position.
- **Team-Ansicht** – Starter/Bank/Verletztenliste jedes Teilnehmers

## Setup

```bash
npm install
npm run dev
```

Die App läuft dann unter `http://localhost:5173`.

Die Liga wird über die `.env`-Datei konfiguriert:

```
VITE_SLEEPER_LEAGUE_ID=1381214374626099200
```

Die ID findet man in der Sleeper-URL: `app.sleeper.com/leagues/<LEAGUE_ID>`.

## Hinweise

- Spieler-Metadaten werden 24h im `localStorage` zwischengespeichert (Sleeper
  empfiehlt, den vollen Spieler-Dump nicht öfter als einmal täglich zu laden).
- `npm run build` erzeugt einen statischen Build in `dist/`, der z.B. auf
  Vercel/Netlify/GitHub Pages gehostet werden kann.
