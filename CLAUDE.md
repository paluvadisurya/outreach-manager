# Project rules & guide — WhatsApp Helper

A mobile-first, fully client-side WhatsApp outreach manager for real-estate
professionals. Everything runs in the browser; there is no server.

## Rules

### 1. Backend / stored-data changes need explicit approval
Any change that affects **stored data** must be confirmed before it happens —
both in code review and at runtime:

- **At runtime (in-app):** destructive or bulk data operations must prompt the
  user for confirmation before executing — deletes, soft-removals/blocklist,
  bulk category add/remove, regenerate/reset, restore, and "delete forever".
  Use the existing `window.confirm(...)` pattern (see
  `SendingQueue.regenerate/remove/resetProgress`). Never mutate stored data as a
  silent side-effect of opening a screen.
- **In development:** before writing code that changes the data model or how data
  is persisted — Dexie schema/version bumps & migrations, new tables, changing
  what `*Repo` methods write, the import/blocklist behavior, or backup/restore
  shape — pause and get the user's sign-off on the approach first. When in doubt,
  ask rather than assume.

Read-only/UI-only work (styling, layout, search, collapse, haptics, copy) does
not require this gate.

### 2. Don't run a production build while the dev server is running
Use `npm run typecheck` and `npm test` to validate. Only `npm run build` when no
dev server is up.

## Stack & conventions

- **Next.js 16 / React 19**, App Router, TypeScript. Client components render the
  whole app (`"use client"`); there is no server data layer.
- **Persistence:** IndexedDB via **Dexie** (`src/lib/db/db.ts`). All reads/writes
  go through per-feature repositories (`src/features/*/lib/repository.ts`). Live
  UI uses `useLiveQuery` from `dexie-react-hooks`.
- **Contacts** are keyed by their normalized **Indian E.164** phone number
  (`src/features/contacts/lib/phone.ts`); dedup/merge is by that id. A contact's
  `firstName` shown in messages is configurable (Settings → First name).
- **Soft-removed contacts** (`Contact.removed`) are hidden from every active list
  and skipped on import (the blocklist); they're restorable from
  Settings → Removed contacts. Active queries must exclude `removed`.
- **PWA:** installable; respects iOS safe-area insets. Floating UI clears the
  bottom nav via the `--bottom-nav-gap` CSS var.
- **Styling:** Tailwind v4 + a small local UI kit in `src/components/ui`.
  Reuse `Sheet`, `Button`, `Collapsible`/`ExpandableText`, and the `haptic()`
  helper (`src/lib/haptics.ts`) rather than re-rolling them.
- **WhatsApp links:** build via `buildWaLink`; open via `openWhatsApp`
  (`src/features/campaigns/lib/whatsapp.ts`), which falls back to `wa.me` when a
  native app scheme doesn't open. The app never auto-sends — the user taps send.

## Testing

`npm test` (Vitest). Pure logic lives in `lib/` modules with co-located
`*.test.ts`. Prefer testing logic there over component tests.
