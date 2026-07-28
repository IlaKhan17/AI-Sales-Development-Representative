"""Set the password in SUPABASE_DB_URL safely, then verify the connection.

Handles URL-encoding of special characters, so a password containing @ : / ? #
& or + can't silently corrupt the connection string.

Usage (from agents/):
    python -m scripts.set_db_password            # prompts, input hidden
    python -m scripts.set_db_password --verify   # just test the current URL
"""

import argparse
import asyncio
import getpass
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _current_url() -> str:
    if not ENV_PATH.exists():
        print(f"{ENV_PATH} not found", file=sys.stderr)
        sys.exit(1)
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    print("SUPABASE_DB_URL not present in agents/.env", file=sys.stderr)
    sys.exit(1)


async def _verify(url: str) -> bool:
    try:
        import asyncpg
    except ImportError:
        print("asyncpg not installed — skipping verification")
        return True
    try:
        conn = await asyncpg.connect(url, statement_cache_size=0, timeout=20)
        version = await conn.fetchval("select version()")
        await conn.close()
        print(f"✓ connected — {version.split(',')[0]}")
        return True
    except Exception as e:
        print(f"✗ {type(e).__name__}: {str(e)[:160]}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="test the existing URL only")
    args = parser.parse_args()

    url = _current_url()
    if args.verify:
        return 0 if asyncio.run(_verify(url)) else 1

    parsed = urlparse(url)
    print(f"host : {parsed.hostname}")
    print(f"user : {parsed.username}")
    print("Paste the database password from Supabase → Settings → Database.\n")

    password = getpass.getpass("Database password: ").strip()
    if not password:
        print("No password entered.", file=sys.stderr)
        return 1
    if re.search(r"YOUR|PASSWORD|\[|\]", password, re.I):
        print("That looks like the dashboard placeholder, not a real password.", file=sys.stderr)
        return 1

    # safe="" so every reserved character is percent-encoded
    encoded = quote(password, safe="")
    if encoded != password:
        print("(password contained special characters — URL-encoded automatically)")

    userinfo = parsed.username or "postgres"
    netloc = f"{userinfo}:{encoded}@{parsed.hostname}"
    if parsed.port:
        netloc += f":{parsed.port}"
    new_url = parsed._replace(netloc=netloc).geturl()

    print("\nVerifying…")
    if not asyncio.run(_verify(new_url)):
        print("\nNot saved — the password was rejected. Reset it in the dashboard and retry.",
              file=sys.stderr)
        return 1

    text = ENV_PATH.read_text()
    text = re.sub(r"^SUPABASE_DB_URL=.*$", f"SUPABASE_DB_URL={new_url}", text, flags=re.M)
    ENV_PATH.write_text(text)
    print(f"\n✓ saved to {ENV_PATH}\n  next: python -m scripts.migrate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
