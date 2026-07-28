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


@router.get("/auth/google")
async def google_auth(user: AuthUser = Depends(get_current_user)):
    """Generate Google OAuth consent URL for the authenticated user."""
    try:
        state = user.id
        auth_url = google_service.get_auth_url(state=state)
        return {"auth_url": auth_url}
    except Exception as e:
        logger.error(f"Error generating Google auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/google/callback")
async def google_callback(code: str, state: str = ""):
    """Handle Google OAuth callback and store tokens."""
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    try:
        user_id = state
        if not user_id:
            raise HTTPException(status_code=400, detail="Missing user state")

        await google_service.exchange_code(code, user_id)
        logger.info(f"Google account connected for user {user_id}")
        return RedirectResponse(url=f"{frontend_url}/dashboard?google_connected=true")
    except Exception as e:
        # Never reflect exception internals into the redirect URL — they can
        # contain token-exchange details. Log server-side, return a generic code.
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        return RedirectResponse(
            url=f"{frontend_url}/dashboard?google_error=connection_failed"
        )


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
