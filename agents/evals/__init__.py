"""Eval suites for Davis 2.0.

Importing this package bootstraps the environment so suites can run from any
working directory (repo root or agents/) without a configured .env: dummy
Supabase creds are injected when missing (deterministic suites never touch
the network) and the agents/ dir is put on sys.path.
"""

import os
import sys
from pathlib import Path

_AGENTS_DIR = Path(__file__).resolve().parent.parent
if str(_AGENTS_DIR) not in sys.path:
    sys.path.insert(0, str(_AGENTS_DIR))

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "eval-dummy-anon-key")

DATASETS_DIR = Path(__file__).resolve().parent / "datasets"
