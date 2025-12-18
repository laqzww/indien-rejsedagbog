# 🇮🇳 Indien Rejsedagbog

En moderne, mobilvenlig rejsedagbog-webapp til at dokumentere en rejse gennem Indien. Bygget med Next.js, Supabase og Mapbox.

![India Travel Diary](https://via.placeholder.com/800x400/FF9933/FFFFFF?text=Indien+Rejsedagbog)

## ✨ Features

- **Facebook-lignende feed**: Hurtig posting, let scrolling, chronologisk rækkefølge
- **Automatisk geo-tagging**: GPS-koordinater ekstraheres fra billede-EXIF data
- **Interaktivt rejsekort**: Se hele ruten med milepæle og opslag på kortet
- **HEIC/HEIF support**: iPhone-billeder konverteres automatisk til JPEG
- **Tidslinje-browser**: Følg rejsen dag for dag
- **Hotel/restaurant links**: OpenGraph preview-kort for anbefalinger
- **Magic link login**: Nem email-baseret authentication

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth + Postgres + Storage)
- **Maps**: Mapbox GL JS
- **Deployment**: Render (via render.yaml Blueprint)

## 🚀 Hurtig Start

### Prerequisites

- Node.js 20+
- npm 10+
- Et Supabase projekt
- En Mapbox konto

### 1. Klon repository

\`\`\`bash
git clone https://github.com/laqzww/indien-rejsedagbog.git
cd indien-rejsedagbog
\`\`\`

### 2. Installer dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Opsæt miljøvariabler

Kopier `.env.example` til `.env.local` og udfyld værdierne:

\`\`\`bash
cp .env.example .env.local
\`\`\`

Rediger `.env.local`:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your-public-token
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

### 4. Supabase Setup

Databasen er allerede konfigureret via migrations. Hvis du bruger et nyt projekt:

1. Gå til Supabase Dashboard
2. SQL Editor
3. Kør migrations manuelt (se `supabase/migrations/` hvis tilgængelig)

**Gør en bruger til author:**

\`\`\`sql
UPDATE public.profiles
SET is_author = true
WHERE id = 'din-bruger-uuid';
\`\`\`

### 5. Start udviklingsserver

\`\`\`bash
npm run dev
\`\`\`

Åbn [http://localhost:3000](http://localhost:3000)

## 🌐 Deploy til Render

### Via Blueprint (anbefalet)

1. Fork dette repository
2. Gå til [Render Dashboard](https://dashboard.render.com)
3. Klik "New" → "Blueprint"
4. Vælg dit GitHub repository
5. Tilføj miljøvariabler under service-indstillinger

### Miljøvariabler på Render

| Variabel | Beskrivelse |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Din Supabase projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox public access token |
| `NEXT_PUBLIC_APP_URL` | Din Render URL (fx `https://indien-rejsedagbog.onrender.com`) |

## 📁 Projektstruktur

\`\`\`
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # Public routes
│   │   ├── page.tsx       # Feed forside
│   │   ├── post/[id]/     # Post detail
│   │   └── journey/       # Kort + tidslinje
│   ├── admin/             # Protected author routes
│   ├── api/               # API routes
│   └── login/             # Auth pages
├── components/
│   ├── ui/                # Shadcn-style UI components
│   ├── map/               # Mapbox komponenter
│   └── post/              # Post-relaterede komponenter
├── lib/
│   ├── supabase/          # Supabase clients
│   ├── exif.ts            # EXIF parsing
│   ├── heic.ts            # HEIC konvertering
│   └── utils.ts           # Utility functions
└── types/
    └── database.ts        # Supabase type definitions
\`\`\`

## 🎨 Design

Farvepalette baseret på det indiske flag:

- **Saffron Orange**: `#FF9933` - Primary/brand color
- **India Green**: `#138808` - Accent/success
- **Navy**: `#000080` - Text/secondary
- **White**: `#FFFFFF` - Background

## 📝 License

MIT

---

Bygget med ❤️ til at dokumentere et eventyr i Indien.
