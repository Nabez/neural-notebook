# Neural Notebook - Vercel Deployment

## 🚀 Deployment auf Vercel

### 1. Voraussetzungen

- GitHub Account
- Vercel Account (vercel.com)
- PostgreSQL Datenbank (z.B. Supabase, PlanetScale, oder Neon)

### 2. Datenbank einrichten

#### Option A: Supabase (Empfohlen - Kostenlos)
1. Gehe zu [supabase.com](https://supabase.com)
2. Erstelle ein neues Projekt
3. Kopiere die Verbindungszeichenfolge aus Project Settings > Database
4. Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

#### Option B: Neon (Kostenlos)
1. Gehe zu [neon.tech](https://neon.tech)
2. Erstelle ein neues Projekt
3. Kopiere die Connection String

#### Option C: PlanetScale
1. Gehe zu [planetscale.com](https://planetscale.com)
2. Erstelle eine neue Datenbank

### 3. Real-time mit Ably einrichten

1. Gehe zu [ably.com](https://ably.com)
2. Erstelle einen kostenlosen Account
3. Kopiere den API Key aus den Dashboard Settings

### 4. Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

### 5. Umgebungsvariablen in Vercel

Gehe zu Project Settings > Environment Variables und füge hinzu:

| Variable | Wert | Beschreibung |
|----------|------|--------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL Connection String (mit Pooling) |
| `DIRECT_URL` | `postgresql://...` | Direkte Verbindung (ohne Pooling) |
| `NEXT_PUBLIC_ABLY_KEY` | `xxx.xxx` | Ably API Key für Real-time |
| `NEXT_PUBLIC_API_URL` | `https://deine-app.vercel.app` | Deine App URL |

### 6. Datenbank Migration

Nach dem ersten Deployment:

```bash
# Lokal
bun run db:push

# Oder in Vercel Dashboard > Settings > Functions > Run Command
prisma db push
```

---

## 📁 Projektstruktur

```
neural-notebook/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── canvas/        # Canvas CRUD
│   │   │   ├── notes/         # Notes API
│   │   │   ├── folders/       # Folders API
│   │   │   ├── workspace/     # Workspace API
│   │   │   └── ai/            # Ollama AI
│   │   └── page.tsx           # Haupt-App
│   ├── components/
│   │   ├── TldrawCanvas.tsx   # tldraw Integration
│   │   ├── TipTapEditor.tsx   # Rich Text Editor
│   │   ├── AIPanel.tsx        # Ollama Chat
│   │   └── TerminalPanel.tsx  # Canvasflow Terminal
│   └── lib/
│       ├── db.ts              # Prisma Client
│       └── realtime.ts        # Ably Integration
├── prisma/
│   └── schema.prisma          # Database Schema
└── vercel.json                # Vercel Config
```

---

## 🔧 Lokale Entwicklung

```bash
# Dependencies installieren
bun install

# Datenbank starten (PostgreSQL via Docker)
docker run --name neural-notebook-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# .env erstellen
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/neural"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/neural"
NEXT_PUBLIC_ABLY_KEY="dein-ably-key"

# Migration
bun run db:push

# Start
bun run dev
```

---

## 🎨 Features

- ✅ Multi-Canvas System (tldraw)
- ✅ Unendlicher Workspace Canvas
- ✅ Rich Text Notizen (TipTap)
- ✅ Sticky Notes
- ✅ Ordner-Struktur
- ✅ Real-time Sync (Ably)
- ✅ AI Integration (Ollama)
- ✅ Dark/Light Theme
- ✅ Export (MD, JSON)
- ✅ Terminal Remote (Canvasflow)
