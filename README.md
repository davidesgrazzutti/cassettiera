# 📦 Cassettiera

🚀 Web app per la gestione di una cassettiera da negozio (magazzino ferramenta), con backend scalabile e database PostgreSQL.

<img width="1878" height="805" alt="image" src="https://github.com/user-attachments/assets/1acc398e-ce00-40cb-a1bd-b260fcd1b440" />


---

## 🌍 Demo

👉 **Live (Render):**  
https://cassettiera.vercel.app

---

## ✨ Features

- 📦 Gestione cassetti (CRUD completo)
- 🔍 Ricerca avanzata (barcode, codice, articolo)
- 📊 Dashboard con statistiche realtime
- 🔄 Scambio cassetti (swap intelligente)
- 📄 Export inventario PDF
- 📱 UI responsive (mobile friendly)
- 🎯 Evidenziazione:
  - sotto scorta
  - quantità zero (rosso 🔴)
- ⚙️ Switch dinamico API (Render / localhost)

---

## 🧱 Tech Stack

### Frontend
- React + Vite + TypeScript  
- CSS  
- Framer Motion  
- Lucide React  
- jsPDF  

### Backend
- ASP.NET Core  

### Database
- PostgreSQL  

---

## 🏗️ Architettura

Frontend (React)
        ↓
API (Render / Localhost switchabile)
        ↓
Backend (.NET o Node.js)
        ↓
PostgreSQL

---

## 🔀 API Switching

L’app permette di cambiare backend senza rebuild:

1. Vai in Impostazioni  
2. Clicca più volte su Versione  
3. Seleziona:
   - Render (produzione)
   - Localhost (sviluppo)

---

## 🚀 Setup

### Frontend
npm install  
npm run dev  

### Backend .NET
cd cassettiera-api-net  
dotnet run  

---

## 🗄️ Database

- PostgreSQL  
- Script: postgres test.sql  

Connection string supportata:

DATABASE_URL=postgres://user:password@host:port/db

---

## 🔐 Security

- Query parametrizzate (protezione SQL injection)
- Nessuna autenticazione (da implementare)
- CORS aperto

---

## 📱 Responsive Design

- Desktop  
- Tablet  
- Mobile  

---

## 📈 Roadmap

- Login + JWT  
- Lettura e caricamento da pistola ( toggle lettura pistola nelle impostazioni)
- Storico movimenti  
- Analytics avanzate  
- Backup cloud  

---

## 👨‍💻 Author

Davide Sgrazzutti
