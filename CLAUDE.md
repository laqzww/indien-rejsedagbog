# CLAUDE.md - AI Assistant Guidelines

This document provides context and guidelines for AI assistants working on the T&A Indien Rejsedagbog codebase.

## Project Overview

**T&A Indien Rejsedagbog** is a Danish travel diary web application for documenting a trip through India. It features a social media-style feed with posts, an interactive map with Mapbox GL, media uploads (images/videos), and PWA support.

- **Language**: The UI and content are in Danish
- **Purpose**: Personal travel blog/diary with location tracking and media sharing
- **Users**: Authors (content creators) and readers (viewers)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router, Server Components) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS with custom theme |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (magic links) |
| Storage | Supabase Storage (images, videos) |
| Maps | Mapbox GL JS |
| Testing | Vitest + React Testing Library |
| UI Components | Custom components with `class-variance-authority` |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Author-only admin pages
│   │   ├── new/            # Create new post
│   │   ├── edit/[id]/      # Edit existing post
│   │   └── timeline/       # Edit journey milestones
│   ├── api/                # API routes
│   ├── auth/               # Authentication flows
│   ├── login/              # Login page
│   ├── post/[id]/          # Individual post view
│   └── settings/           # User settings
├── components/
│   ├── map/                # Map-related components
│   ├── post/               # Post-related components
│   ├── admin/              # Admin-specific components
│   └── ui/                 # Base UI components (Button, Card, etc.)
├── hooks/                  # Custom React hooks
├── lib/
│   ├── supabase/           # Supabase client utilities
│   ├── notifications/      # PWA notification utilities
│   └── *.ts                # Utility modules
├── types/
│   └── database.ts         # Supabase TypeScript types
└── middleware.ts           # Next.js middleware for auth
```

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage
```

## Key Conventions

### TypeScript & Imports

- Use `@/` path alias for imports from `src/` directory
- Strict TypeScript is enabled - avoid `any` types when possible
- Database types are defined in `src/types/database.ts`
- Export helper types for common patterns (e.g., `PostWithMedia`)

```typescript
import { createClient } from "@/lib/supabase/server";
import type { Post, PostWithMedia } from "@/types/database";
```

### Component Patterns

**Server Components** (default in App Router):
- Fetch data directly in components
- Use `async/await` for data fetching
- Place in `app/` directory for pages

**Client Components**:
- Mark with `"use client"` directive at top
- Use for interactivity, hooks, browser APIs
- Named with `*Client.tsx` suffix when paired with server component

```typescript
// Server component (page.tsx)
export default async function Page() {
  const data = await fetchData();
  return <ClientComponent data={data} />;
}

// Client component (PageClient.tsx)
"use client";
export function PageClient({ data }: Props) {
  const [state, setState] = useState(data);
  // ...
}
```

### UI Components

Base UI components use `class-variance-authority` for variants:

```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "..." },
    size: { default: "...", sm: "...", lg: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
});
```

Use the `cn()` utility for merging Tailwind classes:

```typescript
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class", className)} />
```

### Custom Color Palette

The app uses Indian flag-inspired colors defined in `tailwind.config.js`:

| Color | Variable | Hex |
|-------|----------|-----|
| Saffron Orange | `saffron` | #FF9933 |
| India Green | `india-green` | #138808 |
| Navy Blue | `navy` | #000080 |
| Cream | `cream` | #FFFDD0 |

```html
<button className="bg-saffron text-white hover:bg-saffron-dark">
```

### Supabase Clients

**Server-side** (API routes, Server Components):
```typescript
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();
```

**Client-side** (Client Components):
```typescript
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

### Author/Admin Checks

Use `getIsAuthor()` to check if user has author privileges:

```typescript
import { getIsAuthor } from "@/lib/author";

const { data: { user } } = await supabase.auth.getUser();
const isAuthor = await getIsAuthor(supabase, user);
```

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles with `is_author` flag |
| `posts` | Blog posts with text, location, tags |
| `media` | Images/videos attached to posts |
| `milestones` | Journey destinations/waypoints |
| `links` | OpenGraph link previews for posts |

### Key Relationships

- `posts.author_id` → `profiles.id`
- `media.post_id` → `posts.id`
- `links.post_id` → `posts.id`

### Common Queries

```typescript
// Posts with media and profile
const { data } = await supabase
  .from("posts")
  .select(`
    id, body, location_name, captured_at, created_at, tags, lat, lng,
    media (id, type, storage_path, thumbnail_path, width, height, display_order),
    profile:profiles (display_name, avatar_url)
  `)
  .order("captured_at", { ascending: false });
```

## Testing Guidelines

- Tests are in `src/__tests__/` directory
- Use Vitest with React Testing Library
- Test setup in `src/__tests__/setup.ts` mocks environment variables
- Focus coverage on `src/lib/` utilities

```typescript
import { describe, it, expect, vi } from "vitest";

describe("myFunction", () => {
  it("does something", () => {
    expect(myFunction(input)).toBe(expected);
  });
});
```

### Running Tests

```bash
npm run test         # Watch mode
npm run test:run     # Single run
npm run test:coverage # With coverage report
```

## Environment Variables

Required variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox public token |
| `NEXT_PUBLIC_SITE_URL` | App URL for auth redirects |

Optional variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_EMAILS` | (empty) | Comma-separated author emails |
| `NEXT_PUBLIC_JOURNEY_START_DATE` | 2025-12-18 | Journey start date |
| `NEXT_PUBLIC_MAX_FILE_SIZE_MB` | 500 | Max upload size |

## Important Patterns

### Date Handling

- Use `captured_at` for the actual date of an event (retrospective posts)
- Use `created_at` for when the post was created
- Date formatting uses Danish locale (`da-DK`)

```typescript
import { formatDate, formatRelativeDate } from "@/lib/utils";
formatDate("2025-12-25"); // "25. december 2025"
formatRelativeDate(date);  // "I dag", "I går", "3 dage siden"
```

### Image/Media Handling

- HEIC files are converted to JPEG client-side (`lib/heic.ts`)
- Images are compressed before upload (`lib/image-compression.ts`)
- EXIF data is extracted for GPS coordinates (`lib/exif.ts`)
- Video thumbnails are generated client-side (`lib/video-thumbnail.ts`)
- Large files use TUS resumable uploads (`lib/resumable-upload.ts`)

### Map Features

- Posts with `lat`/`lng` appear on the map
- Milestones define the journey route
- Marker decluttering prevents overlap (`lib/map-declutter.ts`)
- Map supports streets and satellite views

## API Route Patterns

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Check auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Handle request
  const { data, error } = await supabase.from("posts").select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
```

## PWA Support

The app is installable as a PWA with:
- Web manifest at `/manifest.webmanifest`
- Service worker at `/public/sw.js`
- App icons (192x192 and 512x512)
- Theme color: #FF9933 (Saffron)

## Code Style

- Use ESLint configuration from `eslint.config.mjs`
- Follow Next.js core-web-vitals and TypeScript recommendations
- Prefer functional components with hooks
- Use named exports for components, default exports for pages
- Keep components focused and single-responsibility

## Common Tasks for AI Assistants

### Adding a New Page

1. Create `src/app/[route]/page.tsx` (Server Component)
2. Add `"use client"` Client Component if needed for interactivity
3. Use `createClient()` from `@/lib/supabase/server` for data

### Adding a New Component

1. Create in appropriate `src/components/` subdirectory
2. Use `cn()` for className merging
3. Export from the file (named export preferred)
4. Add TypeScript types for props

### Adding a New API Route

1. Create `src/app/api/[route]/route.ts`
2. Export `GET`, `POST`, etc. handler functions
3. Use Supabase server client for auth and data
4. Return `NextResponse.json()` for responses

### Modifying Database

1. Add migration in `supabase/migrations/`
2. Update types in `src/types/database.ts`
3. Run migration against Supabase project

## Notes

- The codebase uses Danish for UI text and comments in some places
- Node.js 20+ is required (see `.nvmrc`)
- The app is deployed on Vercel (see `.vercel/` in gitignore)
- Images are served through Supabase Storage with Next.js Image optimization
