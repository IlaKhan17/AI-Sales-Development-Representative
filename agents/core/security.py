"""Supabase JWT verification.

Verifies tokens locally, audience "authenticated". Supabase projects using
asymmetric JWT signing keys issue ES256/RS256 tokens verified against the
project JWKS; legacy projects issue HS256 tokens verified with
SUPABASE_JWT_SECRET. Both are supported, selected by the token's `alg`.
If neither path is configured, falls back to a supabase.auth.get_user
network call (with a one-time warning).
"""

import functools

import jwt

from config import settings
from core.db import get_supabase
from core.logger import logger

_warned_no_secret = False

_ASYMMETRIC_ALGS = ("ES256", "RS256")


class InvalidTokenError(Exception):
    pass


@functools.lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    """JWKS client for the project's public signing keys (keys are cached)."""
    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(url)


def verify_supabase_jwt(token: str) -> dict:
    """Verify a Supabase access token and return its claims.

    Returns a dict with at least `sub` (user id) and usually `email`.
    Raises InvalidTokenError on any verification failure.
    """
    global _warned_no_secret

    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as e:
        raise InvalidTokenError(f"JWT verification failed: {e}") from e

    if alg in _ASYMMETRIC_ALGS:
        try:
            signing_key = _jwks_client().get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=list(_ASYMMETRIC_ALGS),
                audience="authenticated",
            )
        except (jwt.PyJWTError, jwt.PyJWKClientError) as e:
            raise InvalidTokenError(f"JWT verification failed: {e}") from e

    if settings.SUPABASE_JWT_SECRET:
        try:
            return jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as e:
            raise InvalidTokenError(f"JWT verification failed: {e}") from e

    # Network fallback
    if not _warned_no_secret:
        logger.warning(
            "SUPABASE_JWT_SECRET not set — falling back to supabase.auth.get_user "
            "network call for every request (slower). Set the JWT secret to verify locally."
        )
        _warned_no_secret = True

    try:
        result = get_supabase().auth.get_user(token)
    except Exception as e:
        raise InvalidTokenError(f"Token verification failed: {e}") from e

    if not result or not result.user:
        raise InvalidTokenError("Invalid authentication token")

    return {"sub": result.user.id, "email": result.user.email}
