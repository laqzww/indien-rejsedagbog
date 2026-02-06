# Plan: Offline Download af Rejsedagbogen

## Motivation

Rejsedagbogen er en personlig rejsedagbog med billeder, videoer og kort fra en tur gennem Indien. Når rejsen er slut, bør indholdet kunne bevares og tilgås offline - uafhængigt af om Supabase, Vercel eller Mapbox fortsat kører. Det her er minder, ikke en SaaS-app.

## Nuværende status

- **Service worker**: Minimal - håndterer kun badge-notifikationer
- **Caching**: Ingen offline caching af sider, data eller mediefiler
- **IndexedDB**: Bruges kun til `lastVisit`-timestamp
- **PWA**: Installérbar, men fungerer ikke offline
- **Mediefiler**: Ligger i Supabase Storage, serveres via offentlige URLs
- **Kort**: Mapbox GL JS - kræver netværk til tiles

## Overordnet strategi: To-sporet tilgang

### Spor 1: PWA med fuld offline-support (primær)
Udvid den eksisterende PWA så brugeren kan trykke "Gem til offline" og derefter bruge appen uden internet.

### Spor 2: Statisk HTML-arkiv (sekundær)
En "Download arkiv"-funktion der genererer en selvstændig ZIP-fil med alt indhold som statisk HTML. Fungerer i enhver browser uden server.

---

## Spor 1: PWA Offline Mode

### Arkitektur

```
┌─────────────────────────────────────────────┐
│  UI: Download-knap + progress              │
│  "Gem rejsedagbog offline"                  │
└──────────────┬──────────────────────────────┘
               │ postMessage
┌──────────────▼──────────────────────────────┐
│  Service Worker (sw.js v2.0)                │
│  ┌────────────────┐  ┌──────────────────┐   │
│  │ Cache API       │  │ IndexedDB        │   │
│  │ - App shell     │  │ - Posts          │   │
│  │ - Mediefiler    │  │ - Media metadata │   │
│  │ - Kort-tiles    │  │ - Milestones     │   │
│  │ - Statiske filer│  │ - Profiles       │   │
│  └────────────────┘  │ - Links          │   │
│                       │ - Download-status│   │
│                       └──────────────────┘   │
└─────────────────────────────────────────────┘
```

### Fase 1: Data-lag (IndexedDB)

**Ny fil: `src/lib/offline/db.ts`**

Opret en IndexedDB-database (`rejsedagbog-offline`) med object stores der spejler Supabase-tabellerne:

| Store | Key | Indhold |
|-------|-----|---------|
| `posts` | `id` | Alle posts med body, location, tags, captured_at |
| `media` | `id` | Media-metadata (ikke selve filerne - de caches separat) |
| `milestones` | `id` | Alle milestones med koordinater og datoer |
| `profiles` | `id` | Forfatterprofiler |
| `links` | `id` | OG-link previews |
| `meta` | `key` | Download-status, version, sidst opdateret |

Brug et letvægts-wrapper-bibliotek som **idb** (~1.5 KB gzipped) for at undgå callback-helvede med rå IndexedDB.

**API:**
```typescript
// src/lib/offline/db.ts
export async function savePostsOffline(posts: PostWithMedia[]): Promise<void>
export async function getOfflinePosts(): Promise<PostWithMedia[]>
export async function getOfflinePost(id: string): Promise<PostWithMedia | null>
export async function getOfflineMilestones(): Promise<Milestone[]>
export async function getOfflineStatus(): Promise<OfflineStatus>
export async function clearOfflineData(): Promise<void>
```

### Fase 2: Media-download med progress

**Ny fil: `src/lib/offline/media-downloader.ts`**

Download og cache alle mediefiler via Service Worker's Cache API:

```typescript
interface DownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  currentFile: string;
  status: 'idle' | 'downloading' | 'paused' | 'complete' | 'error';
  errors: Array<{ url: string; error: string }>;
}
```

**Strategi:**
1. Hent liste over alle medie-URLs fra IndexedDB (efter fase 1 har gemt metadata)
2. Download i parallel batches (3-5 samtidige requests) for at undgå at overbelaste netværket
3. Brug Cache API (`caches.open('offline-media')`) til at gemme responses
4. Gem carousel-thumbnails OG full-resolution billeder
5. For video: Gem kun thumbnail (video-filer er for store til offline cache). Vis en "Kræver internet"-besked ved videoafspilning offline
6. Track progress i IndexedDB og send opdateringer til UI via `BroadcastChannel`
7. Support pause/resume: Gem hvilke filer der allerede er downloadet

**Estimeret lagerplads:**
- ~100 posts med 2-3 billeder pr. post = ~250-300 billeder
- Full-resolution (~200-500 KB efter kompression) = ~75-150 MB
- Carousel thumbnails (~30-50 KB) = ~10-15 MB
- Tekst-data (posts, milestones, etc.) = ~500 KB
- **Total: ~100-170 MB**

### Fase 3: Service Worker udvidelse

**Opdater: `public/sw.js`**

Tilføj fetch-interceptor med cache-strategier:

| Request-type | Strategi | Cache-navn |
|-------------|----------|------------|
| App shell (HTML, JS, CSS) | Network-first, fallback cache | `app-shell-v1` |
| Supabase media URLs | Cache-first, fallback network | `offline-media` |
| Mapbox tiles | Cache-first, fallback network | `map-tiles` |
| API-kald (`/api/`) | Network-first, fallback IndexedDB | (via IndexedDB) |
| Næste.js data-routes | Network-first, fallback IndexedDB | (via IndexedDB) |

```javascript
// Pseudokode for fetch-interceptor
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase media
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirst(event.request, 'offline-media'));
    return;
  }

  // Mapbox tiles
  if (url.hostname.includes('mapbox.com') || url.hostname.includes('mapbox.cn')) {
    event.respondWith(cacheFirst(event.request, 'map-tiles'));
    return;
  }

  // App shell
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(event.request));
    return;
  }
});
```

**Offline fallback-side:**
Når brugeren navigerer offline og siden ikke er cached, vis en speciel offline-side der:
1. Loader data fra IndexedDB
2. Renderer feed/posts client-side
3. Viser cached billeder fra Cache API

### Fase 4: Offline-bevidst rendering

**Ny fil: `src/hooks/useOfflineStatus.ts`**

```typescript
export function useOfflineStatus() {
  // Returnerer: { isOffline, isDownloaded, downloadProgress }
  // Lytter på navigator.onLine + IndexedDB status
}
```

**Tilpasning af eksisterende komponenter:**

1. **`HomeClient.tsx`**: Detekter offline mode → brug data fra IndexedDB i stedet for server-props
2. **`PostFeedCard.tsx`**: Brug cached billeder. Vis placeholder for video offline
3. **`JourneyMap.tsx`**: Brug cached tiles. Hvis ingen tiles: vis simpelt statisk kort som fallback (forudgenereret PNG med milestones)
4. **`MediaGallery.tsx`**: Indlæs fra Cache API i stedet for Supabase URLs

**Mønster for offline data-loading:**

```typescript
// src/lib/offline/data-provider.ts
export async function getPostsWithOfflineFallback(
  serverPosts: PostWithMedia[] | null
): Promise<PostWithMedia[]> {
  if (serverPosts && serverPosts.length > 0) return serverPosts;
  if (!navigator.onLine) return getOfflinePosts();
  return [];
}
```

### Fase 5: Download-UI

**Ny komponent: `src/components/offline/OfflineDownloadButton.tsx`**

Placering: Indstillinger-siden (`/settings`) + eventuelt som banner i bunden af feed.

**UI-flow:**
1. Knap: "Gem rejsedagbog offline" med estimeret størrelse
2. Klik → bekræftelsesdialog med info om lagerplads
3. Download starter → progress-bar med:
   - "Downloader posts... (45/100)"
   - "Downloader billeder... (120/287 - 45 MB / 130 MB)"
   - "Cacher kort-tiles..."
4. Færdig → grøn bekræftelse: "Rejsedagbogen er gemt offline!"
5. Statusvisning: "Sidst opdateret: 15. jan 2026" + "Slet offline data"-knap

**Ny komponent: `src/components/offline/OfflineIndicator.tsx`**

En lille indikator i header/navbar der viser:
- 📶 Online (normal drift)
- ✈️ Offline (bruger cached data)
- ⬇️ Downloader... (i gang med sync)

### Fase 6: Kort-tiles offline

Mapbox GL JS har en begrænset offline-kapabilitet:

**Option A: Cache tiles on-view (simpel)**
- Service worker'en cacher automatisk alle tiles der bliver loadet mens brugeren er online
- Brugeren opfordres til at panorere rundt på kortet for at "opvarme" cachen
- Pro: Simpelt. Kon: Ufuldstændig dækning

**Option B: Foruddownload tiles for ruten (bedre)**
- Beregn bounding boxes for alle milestones
- Download tiles for zoom-niveauer 5-12 for hele Indien + zoom 12-15 for milestone-områder
- Brug Mapbox Static Tiles API
- Pro: Komplet dækning. Kon: Potentielt mange tiles (~50-100 MB ekstra)

**Option C: Statisk kort-fallback (pragmatisk, anbefalet)**
- Generer et statisk kort-billede (PNG) server-side med alle milestones og ruten plottet
- Vis dette som fallback når Mapbox ikke kan loade tiles
- Pro: Simpelt, lille filstørrelse (~2-5 MB). Kon: Ikke interaktivt
- Kan genereres via Mapbox Static Images API og caches som del af download

**Anbefaling:** Start med Option A + C. Cache tiles on-view, og hav et statisk kort som fallback.

---

## Spor 2: Statisk HTML-arkiv

### Koncept

En "Download alt som ZIP"-funktion der genererer en selvstændig HTML-side med alt indhold. Brugeren får en ZIP-fil der kan åbnes i enhver browser - ingen server nødvendig.

### Implementation

**Ny API-route: `src/app/api/archive/route.ts`**

Genererer ZIP-filen server-side:

1. Hent alle posts, media, milestones fra Supabase
2. Download alle mediefiler fra Supabase Storage
3. Generer statisk HTML med:
   - Inline CSS (Tailwind subset eller minimal custom CSS)
   - Alle billeder som lokale filer (`media/[post-id]/[filename]`)
   - Simpel feed-visning med posts grupperet efter dag
   - Statisk kort-billede
4. Pak alt i en ZIP via **JSZip** eller **archiver**
5. Stream ZIP som response

**Alternativ: Client-side generering**

For at undgå server-belastning kan arkivet genereres client-side:

1. Hent alle data via Supabase client
2. Download mediefiler via fetch
3. Generer HTML med en template
4. Brug **JSZip** (browser) til at oprette ZIP
5. Trigger download via `URL.createObjectURL()`

Pro: Ingen server-belastning. Kon: Kræver at brugeren holder fanen åben.

### Arkiv-struktur

```
rejsedagbog-arkiv/
├── index.html              # Hovedside med feed
├── style.css               # Minimal styling
├── posts/
│   ├── [id].html           # Individuelle post-sider (valgfrit)
├── media/
│   ├── [post-id]/
│   │   ├── image1.jpg
│   │   ├── image2.jpg
│   │   └── ...
├── map.png                 # Statisk kort med ruten
└── data.json               # Struktureret data (til evt. re-import)
```

---

## Implementeringsrækkefølge

| # | Opgave | Afhængigheder | Estimat |
|---|--------|---------------|---------|
| 1 | IndexedDB data-lag (`lib/offline/db.ts`) | Ingen | Lille |
| 2 | `useOfflineStatus` hook | #1 | Lille |
| 3 | Service worker fetch-interceptor | #1 | Medium |
| 4 | Media download-manager med progress | #1, #3 | Medium |
| 5 | Download-UI (knap + progress) | #2, #4 | Medium |
| 6 | Offline data-provider for feed | #1, #3 | Medium |
| 7 | Tilpas PostFeedCard til offline billeder | #6 | Lille |
| 8 | Statisk kort-fallback | Ingen | Lille |
| 9 | Offline-indikator i header | #2 | Lille |
| 10 | Statisk HTML-arkiv (Spor 2) | Ingen | Stor |

**Anbefalet prioritering:** 1 → 3 → 4 → 5 → 2 → 6 → 7 → 9 → 8 → 10

Spor 1 (trin 1-9) giver den bedste brugeroplevelse og bør laves først. Spor 2 (trin 10) er en "nice-to-have" for langtidsarkivering.

---

## Tekniske overvejelser

### Lagerpladsbegrænsninger

| Browser | Kvote |
|---------|-------|
| Chrome | Op til 80% af diskplads (typisk 10+ GB) |
| Firefox | Op til 50% af diskplads |
| Safari (iOS) | ~1 GB per origin (kan ryddes af OS) |
| Safari (macOS) | Større, men stadig begrænset |

**iOS-problemet:** Safari på iOS kan rydde cache-data når der er pres på lagerpladsen. For at modvirke dette:
- Anmod om `navigator.storage.persist()` for at bede browseren om at beholde data
- Vis brugeren en advarsel på iOS om at dataene ikke er garanteret permanente
- Spor 2 (ZIP-download) er det sikreste valg på iOS

### Storage Quota API

```typescript
const estimate = await navigator.storage.estimate();
const available = estimate.quota - estimate.usage;
// Vis brugeren: "Tilgængelig plads: X MB" før download
```

### Inkrementel opdatering

Efter første download bør efterfølgende "opdateringer" kun downloade nye/ændrede posts:
- Gem `lastSyncTimestamp` i IndexedDB
- Hent kun posts med `created_at > lastSyncTimestamp`
- Download kun nye mediefiler

### Fejlhåndtering

- Afbrudt download (lukket browser): Genoptag fra hvor den stoppede
- Netværksfejl på enkelt fil: Retry 3 gange, spring over og log fejl, fortsæt med resten
- Fuldt lager: Afbryd og vis besked med oversigt over hvad der er gemt

### Video-håndtering

Videoer er typisk 10-100+ MB hver. Realistiske muligheder:
1. **Gem kun thumbnails** (anbefalet): Vis thumbnail + "Kræver internet"-ikon
2. **Valgfri video-download**: Lad brugeren vælge om video skal inkluderes
3. **Komprimerede video-versioner**: Kræver server-side transcoding (out of scope)

---

## Afhængigheder (nye pakker)

| Pakke | Formål | Størrelse |
|-------|--------|-----------|
| `idb` | IndexedDB wrapper | ~1.5 KB gzip |
| `jszip` | ZIP-generering (kun Spor 2) | ~45 KB gzip |

Begge er veletablerede, velholdte og har ingen transitive afhængigheder.

---

## Konklusion

Den anbefalede tilgang er at starte med **Spor 1** (PWA offline mode), som giver den mest naturlige brugeroplevelse: tryk "Gem offline", vent, og brug appen som normalt - også uden internet. Det bygger på den eksisterende PWA-infrastruktur og kræver ingen separat viewer.

**Spor 2** (statisk arkiv) kan tilføjes senere som en ekstra sikkerhed for langtidsarkivering, eller som alternativ til brugere på iOS hvor browser-cachen er upålidelig.

Kernen i implementeringen er:
1. Et IndexedDB data-lag der spejler Supabase
2. En service worker der intercepter requests og serverer fra cache
3. En media-downloader med progress-tracking
4. Små tilpasninger til eksisterende komponenter for at bruge offline data
