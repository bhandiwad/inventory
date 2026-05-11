#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
from pathlib import Path


FILES = [
    "supabase/migrations/0001_phase1_schema.sql",
    "supabase/migrations/0002_reference_seed.sql",
    "supabase/migrations/0003_phase1_app_api.sql",
    "supabase/migrations/0004_phase1_pilot_stock.sql",
    "supabase/migrations/0005_product_overrides.sql",
    "supabase/migrations/0006_chat_source.sql",
    "catalog/raw_catalog_rows.sql",
    "catalog/clean_seed.sql",
]


def read_env_value(key: str) -> str:
    for line in Path(".env").read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{key} is missing")


def parse_postgres_url(url: str) -> tuple[str, str, str, str, str]:
    if not (url.startswith("postgresql://") or url.startswith("postgres://")):
        raise SystemExit("SUPABASE_DB_URL must start with postgresql:// or postgres://")
    rest = url.split("://", 1)[1]
    userpass, hostpart = rest.rsplit("@", 1)
    user, password = userpass.split(":", 1)
    hostport, db_and_query = hostpart.split("/", 1)
    dbname = db_and_query.split("?", 1)[0]
    host, port = hostport.rsplit(":", 1) if ":" in hostport else (hostport, "5432")
    return host, port, user, password, dbname


def main() -> int:
    host, port, user, password, dbname = parse_postgres_url(read_env_value("SUPABASE_DB_URL"))
    env = os.environ.copy()
    env["PGPASSWORD"] = password
    for file in FILES:
        if not Path(file).exists():
            continue
        print(f"Applying {file}")
        result = subprocess.run(
            ["psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-v", "ON_ERROR_STOP=1", "-f", file],
            env=env,
        )
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
