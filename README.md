# Voice-First Inventory for Car Accessory Shops

Multi-tenant, mobile-first inventory PWA for Indian car accessory shops. Phase 1 manual inventory is implemented with Supabase RLS, catalog normalization, offline stock writes, Excel adjustment import, role-based user management, and guarded voice/chat confirmation flows.

## What Is Included

- Supabase/Postgres schema with RLS helpers, policies, `current_stock`, idempotent mutations, and sole-owner protection.
- Reference seeds for brands, category codes, and starter vehicle aliases.
- Phase 0 catalog loader for `/Users/pb/Downloads/SMTC_Stock.xlsx`.
- Admin curation UI at `/en/admin/catalog`.
- Next.js App Router PWA shell with OTP login, onboarding, stock operations, product management, current stock, reports, users, Excel export/import, offline indicator, voice, and typed chat commands.
- IndexedDB write queue using `client_mutation_id`; viewers are blocked before queueing and again by RLS at sync time.
- Voice and chat never auto-execute. They show candidate confirmation cards and commit only after a tap.
- English strings plus Kannada and Hindi JSON stubs.

## Local Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set these values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_DB_URL=
SARVAM_API_KEY=
```

Phone OTP must be enabled in the Supabase dashboard under Authentication providers. Configure SMS provider credentials there; no API keys belong in this repo.

## Supabase Setup

Apply migrations in order:

```bash
supabase db push
```

Or run directly against a Postgres URL:

```bash
npm run seed
```

The storage bucket is not required unless audio retention is enabled. Voice transcription sends the current recording to Sarvam and stores the transcript/candidates in `voice_logs`.

## Catalog Normalization

Load the seed workbook:

```bash
npm run catalog:load
```

This writes:

- `catalog/raw_catalog_rows.csv`
- `catalog/raw_catalog_rows.sql`
- `catalog/review_candidates.json`

Important: `LLM`, `DCC`, `WFK`, `DVSL`, `DV`, and `TLC` are preserved as abbreviations and marked for pilot-owner confirmation. The script generates candidate mappings but does not silently merge fuzzy matches.

After admin review, export clean seed SQL:

```bash
npm run catalog:seed
```

Then apply `catalog/clean_seed.sql`.

## Demo Tenant and Users

Create one tenant through onboarding, then add memberships:

- Owner: full tenant management, stock writes, adjustments, reports.
- Staff: purchase and sale, custom products, own recent undo.
- Viewer: read-only inventory, low stock, details, and transactions.

Use phone OTP users in Supabase Auth. Insert matching `profiles` rows and `tenant_memberships` rows. The RLS policies enforce permissions even if UI controls are bypassed.

## Testing Offline Sync

1. Log in as owner or staff.
2. Open `/en`.
3. Disable network in browser devtools.
4. Record stock-outs.
5. Confirm the pending count increases.
6. Re-enable network.
7. Confirm queued writes sync, the server validates current role/RLS, and duplicate `client_mutation_id` values do not create duplicate transactions.

Viewer users cannot queue offline mutations.

## Testing RLS and Roles

Use direct SQL/API probes, not only the UI:

- Viewer insert into `transactions` must fail.
- Viewer insert into `tenant_products` must fail.
- Staff can insert `purchase` and `sale`.
- Staff cannot insert `adjustment`, `return`, or `damage`.
- Staff cannot modify `tenant_memberships`.
- Staff cannot update opening balance.
- Owner can manage users and tenant settings.
- Sole owner cannot demote or remove themselves.
- Owner can demote/remove themselves only after a second active owner exists.

The probe checklist lives in `tests/rls/phase1_rls_probe.sql`.

## Stock Adjustment Import

Use the app-generated current stock export. Arbitrary Excel/catalog files are rejected by the template marker. Each changed row should become an `adjustment` transaction with:

```text
new_quantity - current_quantity
```

Only owners can run the final import because adjustment transactions require owner RLS.

## Voice and Chat

Set `SARVAM_API_KEY` for Sarvam transcription. Use `http://localhost:3210`, not a LAN IP, so browser microphone permissions work in local development.

Voice and chat commands share the same confirmation flow:

```text
sell 2 Brezza LLM
stock in 3 Swift mat
```

The app extracts quantity/action, retrieves top candidates from the active catalog with the Supabase `search_tenant_products` trigram RPC, and waits for the user to confirm. The quantity can be corrected before confirmation. Voice logs are linked to confirmed voice transactions.

Review recent voice attempts at `/en/admin/voice`. The dashboard shows transcript, parsed action, top candidates, confirmed match, language, and latency. Audio is not retained by default to keep pilot cost and privacy risk low.

## Phase 1 Verification

Run:

```bash
npm test
npm run build
npm run typecheck
```

Then verify tenant isolation and role enforcement with direct Supabase API/SQL probes, not only UI controls. The probe checklist lives in `tests/rls/phase1_rls_probe.sql`.
