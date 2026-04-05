# cassettiera
Progetto di prova per una cassettiera per negozio.

## Tecnologie utilizzate
- Frontend: React + Vite + TypeScript
- Styling: CSS
- Backend JavaScript: Node.js / Express (cartella `cassettiera-api-js`)
- Backend .NET: ASP.NET Core (cartella `cassettiera-api-net`)
- Database / SQL: PostgreSQL (file `postgres test.sql`)

## Back-end disponibili
Sono disponibili due backend:
- un backend JavaScript in `cassettiera-api-js`
- un backend .NET in `cassettiera-api-net`

Per cambiare quale backend usa il frontend, modifica in `vite.config.ts` la stringa:

```ts
target: "http://localhost:xxxx",
```

Sostituisci `xxxx` con la porta corretta del backend attivo.

## Avvio del progetto
- Per avviare il frontend: `npm run dev`
- Per avviare il backend .NET: `dotnet run dev`
