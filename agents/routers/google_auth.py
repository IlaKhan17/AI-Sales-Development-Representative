"""Google OAuth endpoints.

Note: /auth/google/callback is intentionally unauthenticated (Google redirects
the browser here), so auth is applied per-route rather than at router level.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from config import settings
from core.logger import logger
from deps.auth import AuthUser, get_current_user
from services.google_service import GoogleService

router = APIRouter()

# Shared GoogleService instance (also used by the emails and calendar routers)
google_service = GoogleService()


def _safe_return_path(path: str) -> str:
    """Only same-site relative paths (no scheme, no //host) are allowed."""
    if path.startswith("/") and not path.startswith("//") and "\\" not in path:
        return path
    return "/workspaces"


def _redirect_with(return_to: str, param: str) -> RedirectResponse:
    frontend_url = (settings.FRONTEND_URL or "http://localhost:3000").rstrip("/")
    path = _safe_return_path(return_to)
    sep = "&" if "?" in path else "?"
    return RedirectResponse(url=f"{frontend_url}{path}{sep}{param}")


@router.get("/auth/google")
async def google_auth(return_to: str = "/workspaces", user: AuthUser = Depends(get_current_user)):
    """Generate Google OAuth consent URL for the authenticated user."""
    try:
        auth_url = google_service.get_auth_url(user.id, _safe_return_path(return_to))
        return {"auth_url": auth_url}
    except Exception as e:
        logger.error(f"Error generating Google auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Google OAuth callback and store tokens.

    ``state`` is the one-time nonce from get_auth_url; the user id and PKCE
    code_verifier are looked up server-side, never taken from the URL.
    """
    saved = None
    try:
        saved = google_service.consume_oauth_state(state)
    except Exception as e:
        logger.error(f"Google OAuth state lookup failed: {e}", exc_info=True)
    return_to = (saved or {}).get("return_to") or "/workspaces"

    if error:  # user clicked Cancel on the consent screen
        return _redirect_with(return_to, "google_error=access_denied")
    if not saved or not code:
        logger.warning("Google OAuth callback with unknown or expired state")
        return _redirect_with(return_to, "google_error=session_expired")

    try:
        await google_service.exchange_code(
            code, saved["user_id"], code_verifier=saved.get("code_verifier")
        )
        logger.info(f"Google account connected for user {saved['user_id']}")
        return _redirect_with(return_to, "google_connected=true")
    except Exception as e:
        # Never reflect exception internals into the redirect URL — they can
        # contain token-exchange details. Log server-side, return a generic code.
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        return _redirect_with(return_to, "google_error=connection_failed")


@router.get("/auth/google/status")
async def google_status(user: AuthUser = Depends(get_current_user)):
    """Check if the user has connected their Google account."""
    try:
        status = await google_service.get_connection_status(user.id)
        return status
    except Exception as e:
        logger.error(f"Error checking Google status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/google/disconnect")
async def google_disconnect(user: AuthUser = Depends(get_current_user)):
    """Disconnect the user's Google account."""
    try:
        await google_service.disconnect(user.id)
        return {"status": "disconnected"}
    except Exception as e:
        logger.error(f"Error disconnecting Google: {e}")
        raise HTTPException(status_code=500, detail=str(e))
