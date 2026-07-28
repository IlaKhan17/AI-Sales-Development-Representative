"""Supabase client factories (module-level singletons)."""

from supabase import Client, create_client

from config import settings
from core.logger import logger

_anon_client: Client | None = None
_admin_client: Client | None = None


def get_supabase() -> Client:
    """Supabase client using the anon key (subject to RLS)."""
    global _anon_client
    if _anon_client is None:
        _anon_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _anon_client


def get_supabase_admin() -> Client:
    """Supabase client using the service-role key (bypasses RLS).

    Falls back to the anon client (with a warning) if the key is not set.
    """
    global _admin_client
    if _admin_client is None:
        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            logger.warning(
                "SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon client; "
                "admin operations may fail under RLS"
            )
            return get_supabase()
        _admin_client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
        )
    return _admin_client
