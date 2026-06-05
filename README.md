# Real Estate Outreach Manager

A mobile-first, fully client-side web app that helps a real-estate professional
organize contacts, segment prospects, build personalized message templates, and
run **WhatsApp-assisted** outreach campaigns — where every message is reviewed
and sent manually. No backend, no automation, no bulk blasting.

All data lives in the browser (IndexedDB) and survives refresh, restart and
device reboot.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript 6** (strict)
- **TailwindCSS 4** + lightweight **shadcn/ui**-style primitives · **Inter** font
- **Zustand 5** for transient UI state · **Dexie.js** over **IndexedDB** for persistence
- **lucide-react** icons (no emojis) · light theme only · installable PWA
- **Vitest** + **React Testing Library** (no browser automation)

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

On first run, open the **Contacts** tab and tap **Load demo data** to seed
contacts, categories and templates from `public/seed/`, then create a campaign
in seconds.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the unit + integration test suite |
| `npm run typecheck` | Type-check without emitting |

## Architecture

Feature-based folders keep UI separate from business logic. The domain logic is
made of small, pure, fully-tested functions; repositories wrap Dexie; components
stay thin.

```
src/
  app/                         # Routes
    (main)/                    #   Tab routes share the bottom navigation
      contacts | categories | templates | campaigns
    campaigns/[id]/            #   Sending queue (no bottom nav)
  components/
    layout/                    # AppHeader, BottomNav
    ui/                        # Button, Input, Sheet, VirtualList, …
  features/
    contacts/
      lib/  phone · vcf · merge · import · search · repository
      components/  ContactsExplorer · ContactRow · ImportSheet · AssignCategorySheet
      store/  selection (Zustand)
    categories/ lib/repository · components/CategoriesManager
    templates/  lib/render · repository · components/{TemplatesManager,TemplateEditor}
    campaigns/  lib/{generate,progress,whatsapp,repository}
                components/{CampaignsManager,CampaignCreateSheet,SendingQueue}
  lib/
    db/db.ts                   # Dexie schema (the single source of truth)
    types.ts · utils.ts · id.ts · seed.ts
```

### Key design decisions

- **Phone number is the contact identity.** `+91 9876543210`, `9876543210` and
  `91-9876543210` all normalize (via `libphonenumber-js`, default region `IN`)
  to one identifier, which drives deduplication and merging. Existing country
  codes are detected and collapsed, so a contact already saved with `+91` is
  never prefixed again (`+91919676887489` → `+919676887489`).
- **First names are configurable.** A multi-word first name is reduced to its
  first word ("Ramesh Kumar" → "Ramesh"), unless that word is an initial shorter
  than the configurable threshold ("K Ramesh" → "K Ramesh"). Tune it in
  **Settings** (gear icon). The rule is applied at *render* time, so changing it
  affects every new campaign and live preview immediately; an existing campaign
  can be refreshed with the queue's **Regenerate (↻)** button, which re-renders
  all messages from the current template and settings without losing progress.
- **Installable PWA.** A web manifest, maskable icons and a production
  service worker make the app installable via "Add to Home Screen" and usable
  offline.
- **Import is preview-then-commit.** The pipeline reports
  *Imported / Updated / Merged / Skipped* plus per-record warnings before any
  write. Records without a valid phone never enter the database.
- **Campaign snapshots are frozen.** When a campaign is generated, each
  contact's message is rendered and stored verbatim, so later template edits can
  never alter an active campaign.
- **Recovery is automatic.** The Campaigns tab surfaces a Resume banner, and the
  queue reopens exactly where you left off (`resumeIndex` recomputes the next
  actionable message from stored statuses).
- **Large lists stay smooth.** The contact explorer uses an in-memory search
  index and a fixed-height virtual list, comfortably handling 10k+ contacts.

## WhatsApp integration

Messages are opened via `wa.me/<phone>?text=<message>` deep links. The app
**never** sends automatically — the user always presses send inside WhatsApp.
This is intentional.

## Testing

`npm test` runs unit coverage for VCF parsing, phone normalization,
deduplication, contact merging, template rendering, campaign generation,
progress/recovery, search and "Select search results", plus integration tests
covering the full *Import → Category → Template → Campaign → Queue → Resume*
workflow against IndexedDB (`fake-indexeddb`).

## Seed data

- `public/seed/demo-contacts.vcf` — varied contacts incl. duplicates and one
  invalid record (to exercise merge + skip)
- `public/seed/demo-categories.json`
- `public/seed/demo-templates.json`
