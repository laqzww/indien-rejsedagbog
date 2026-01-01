# 🇮🇳 T&A Indien Rejsedagbog

En moderne, mobilvenlig rejsedagbog-webapp til at dokumentere Tommy og Amalies eventyr gennem Indien. Bygget med Next.js 14, Supabase og Mapbox.

## ✨ Features

### Feed & Opslag
- **Social media-inspireret feed**: Kronologisk visning med billeder, video og tekst
- **Multi-medie opslag**: Upload flere billeder og videoer per opslag med carousel-visning
- **Drag-and-drop sortering**: Omarranger billeder i den ønskede rækkefølge
- **Automatisk billedekomprimering**: Reducerer filstørrelse med bibeholdt kvalitet
- **HEIC/HEIF support**: iPhone-billeder konverteres automatisk til JPEG
- **Video thumbnails**: Automatisk generering af video-miniaturebilleder
- **Retrospektive opslag**: Vælg en tidligere dato for ældre oplevelser
- **Tags**: Kategoriser opslag med hashtags

### Interaktivt Kort
- **Mapbox GL integration**: Flot interaktivt kort med rejserute
- **Feed/Kort toggle**: Skift nemt mellem listevisning og kortvisning
- **Milepæle**: Definer vigtige destinationer på rejsen
- **Post-markører**: Se præcis hvor hvert opslag blev taget
- **Carousel navigation**: Gennemse opslag og destinationer i en elegant karrusel
- **Kort stil skift**: Vælg mellem gadekort og satellitkort
- **Auto-decluttering**: Markører flyttes automatisk for at undgå overlap
- **GPS fra billeder**: Lokation ekstraheres automatisk fra EXIF-data

### Upload System
- **Parallel upload**: Flere filer uploades samtidigt for hurtigere overførsel
- **Resumable uploads**: TUS-protokol til store videofiler med pause/genoptag
- **Automatisk retry**: Fejlede uploads forsøges igen med exponential backoff
- **Adaptive concurrency**: Upload-hastighed tilpasses netværksforhold
- **Carousel thumbnails**: Små optimerede thumbnails til hurtig indlæsning

### Brugervenlige Features
- **PWA-support**: Installér som app på telefonen
- **Magic link login**: Nem email-baseret authentication
- **Profil-indstillinger**: Opdater visningsnavn og profilbillede
- **Password management**: Skift password når som helst
- **Author-rolle**: Kun forfattere kan oprette og redigere opslag

### Admin Panel
- **Opslag management**: Opret, rediger og slet opslag
- **Tidslinje-editor**: Tilføj og rediger rejsedestinationer med drag-and-drop
- **Destination cover-billeder**: Upload cover-billeder til destinationer

## 🛠 Tech Stack

### Frontend
- **Next.js 14** (App Router) - React framework med server components
- **TypeScript** - Type-sikker JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Smukke SVG ikoner

### Backend & Data
- **Supabase** - Auth, Postgres database og Storage
- **TUS Protocol** - Resumable uploads til store filer

### Kort & Medier
- **Mapbox GL JS** - Interaktive kort
- **Sharp** - Server-side billede-processering
- **Exifr** - EXIF metadata parsing
- **heic2any** - HEIC til JPEG konvertering

### UI Libraries
- **Embla Carousel** - Touch-venlig carousel
- **DND Kit** - Drag-and-drop funktionalitet
- **class-variance-authority** - Component variants

## 🚀 Hurtig Start

### Prerequisites

- Node.js 20+
- npm 10+
- Et Supabase projekt
- En Mapbox konto

### 1. Klon repository

```bash
git clone https://github.com/laqzww/indien-rejsedagbog.git
cd indien-rejsedagbog
```

### 2. Installer dependencies

```bash
npm install
```

### 3. Opsæt miljøvariabler

Opret en `.env.local` fil med følgende variabler:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your-public-token
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Supabase Setup

Database-tabeller der kræves:

- `profiles` - Bruger-profiler med `is_author` flag
- `posts` - Opslag med tekst, lokation og metadata
- `media` - Billeder og videoer tilknyttet opslag
- `milestones` - Rejsedestinationer med koordinater og datoer
- `links` - OpenGraph links tilknyttet opslag

**Gør en bruger til author:**

```sql
UPDATE public.profiles
SET is_author = true
WHERE id = 'din-bruger-uuid';
```

### 5. Start udviklingsserver

```bash
npm run dev
```

Åbn [http://localhost:3000](http://localhost:3000)

## 📁 Projektstruktur

```
src/
├── app/                       # Next.js App Router
│   ├── page.tsx              # Forside (feed + kort)
│   ├── layout.tsx            # Root layout med fonts
│   ├── manifest.ts           # PWA manifest
│   ├── admin/                # Author-beskyttede sider
│   │   ├── page.tsx          # Admin dashboard
│   │   ├── new/              # Opret nyt opslag
│   │   ├── edit/[id]/        # Rediger opslag
│   │   └── timeline/         # Rediger rejserute
│   ├── api/
│   │   ├── og/               # OpenGraph scraping
│   │   └── posts/            # Posts API
│   ├── auth/                 # Authentication flows
│   ├── login/                # Login side
│   ├── post/[id]/            # Opslags detaljer
│   ├── journey/              # Redirect til kort
│   └── settings/             # Bruger-indstillinger
├── components/
│   ├── Header.tsx            # Navigation header
│   ├── HomeClient.tsx        # Feed/kort client component
│   ├── Logo.tsx              # App logo
│   ├── map/                  # Kort komponenter
│   │   ├── JourneyMap.tsx    # Mapbox kort wrapper
│   │   ├── PostCarousel.tsx  # Kort carousel navigation
│   │   ├── PostMarker.tsx    # Post markør styling
│   │   └── Timeline.tsx      # Tidslinje sidebar
│   ├── post/                 # Opslags komponenter
│   │   ├── PostFeed.tsx      # Feed med gruppering
│   │   ├── PostFeedCard.tsx  # Enkelt opslag kort
│   │   ├── MediaUpload.tsx   # Fil upload component
│   │   ├── MediaGallery.tsx  # Billede/video visning
│   │   ├── MediaSortable.tsx # Drag-and-drop sortering
│   │   ├── LocationPicker.tsx # Lokations-vælger
│   │   ├── TagInput.tsx      # Tag input
│   │   └── UploadProgress.tsx # Upload progress UI
│   └── ui/                   # Basis UI komponenter
├── lib/
│   ├── supabase/             # Supabase clients
│   │   ├── client.ts         # Browser client
│   │   ├── server.ts         # Server client
│   │   └── middleware.ts     # Auth middleware
│   ├── author.ts             # Author check utilities
│   ├── exif.ts               # EXIF parsing
│   ├── heic.ts               # HEIC konvertering
│   ├── image-compression.ts  # Billede komprimering
│   ├── journey.ts            # Post gruppering logic
│   ├── map-declutter.ts      # Markør decluttering
│   ├── parallel-upload.ts    # Parallel upload manager
│   ├── resumable-upload.ts   # TUS resumable uploads
│   ├── upload.ts             # Upload utilities
│   ├── url-utils.ts          # URL parsing
│   ├── utils.ts              # Generelle utilities
│   └── video-thumbnail.ts    # Video thumbnail generation
└── types/
    └── database.ts           # Supabase type definitions
```

## 🎨 Design

### Farvepalette (Indisk flag-inspireret)

| Farve | Hex | Anvendelse |
|-------|-----|------------|
| **Saffron Orange** | `#FF9933` | Primary, header, accents |
| **India Green** | `#138808` | Secondary, success states |
| **Navy Blue** | `#000080` | Text, headings |
| **Cream** | `#FFFDD0` | Background accents |
| **White** | `#FFFFFF` | Main background |

### Typografi

- **Outfit** - Primary sans-serif font
- **Tillana** - Decorative headlines (indisk stil)
- **JetBrains Mono** - Monospace til kode

### Ikoner

Lucide React ikoner bruges konsistent gennem hele appen for en ren, moderne æstetik.

## 🔧 Scripts

```bash
npm run dev      # Start udviklings-server
npm run build    # Byg til produktion
npm run start    # Start produktions-server
npm run lint     # Kør ESLint
```

## 📱 PWA Features

Appen understøtter installation som Progressive Web App:

- **Standalone mode** - Kører uden browser-chrome
- **Custom ikoner** - 192x192 og 512x512 PNG ikoner
- **Theme color** - Saffron orange (`#FF9933`)
- **Offline-ready** - Grundlæggende offline support

## 📝 License

Apache 2.0 - Se [LICENSE](LICENSE) filen for detaljer.

---

Bygget med ❤️ til at dokumentere et eventyr i Indien.
