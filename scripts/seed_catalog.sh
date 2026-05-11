#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Postgres connection string}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_phase1_schema.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_reference_seed.sql
if [[ -f catalog/raw_catalog_rows.sql ]]; then
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f catalog/raw_catalog_rows.sql
fi
if [[ -f catalog/clean_seed.sql ]]; then
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f catalog/clean_seed.sql
fi
