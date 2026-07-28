"""Apply SQL migrations in agents/migrations/ in filename order.

Idempotent: every applied file is recorded in the schema_migrations table and
skipped on subsequent runs. Each file runs inside a transaction, so a failing
migration leaves no partial state.

Usage (from agents/):
    python -m scripts.migrate            # apply pending migrations
    python -m scripts.migrate --status   # list applied / pending, apply nothing
"""

import argparse
import asyncio
import hashlib
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# Convenience bundle for pasting into the Supabase SQL editor — it contains
# every other file, so applying it here would double-run everything.
EXCLUDED = {"ALL_MIGRATIONS.sql"}

TRACKING_TABLE = """
create table if not exists public.schema_migrations (
    filename    text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
)
"""


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", action="store_true", help="show state, apply nothing")
    args = parser.parse_args()

    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("SUPABASE_DB_URL is not set (see agents/.env)", file=sys.stderr)
        return 1

    files = sorted(f for f in MIGRATIONS_DIR.glob("*.sql") if f.name not in EXCLUDED)
    if not files:
        print(f"No .sql files found in {MIGRATIONS_DIR}", file=sys.stderr)
        return 1

    # statement_cache_size=0 keeps this working through Supabase's pooler.
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        await conn.execute(TRACKING_TABLE)
        applied = {
            r["filename"]: r["checksum"]
            for r in await conn.fetch("select filename, checksum from public.schema_migrations")
        }

        pending = []
        for path in files:
            sql = path.read_text()
            if path.name in applied:
                marker = "ok" if applied[path.name] == _checksum(sql) else "CHANGED SINCE APPLIED"
                print(f"  applied  {path.name:<45} {marker}")
            else:
                pending.append((path, sql))
                print(f"  pending  {path.name}")

        if args.status:
            return 0
        if not pending:
            print("\nNothing to apply — database is up to date.")
            return 0

        print(f"\nApplying {len(pending)} migration(s)…\n")
        for path, sql in pending:
            try:
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "insert into public.schema_migrations (filename, checksum) values ($1, $2)",
                        path.name,
                        _checksum(sql),
                    )
                print(f"  ✓ {path.name}")
            except Exception as e:
                print(f"  ✗ {path.name}\n    {type(e).__name__}: {e}", file=sys.stderr)
                return 1

        print("\nAll migrations applied.")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
