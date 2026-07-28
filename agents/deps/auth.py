"""FastAPI auth dependency: Supabase JWT -> AuthUser."""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.logger import logger
from core.security import InvalidTokenError, verify_supabase_jwt

security = HTTPBearer()


@dataclass
class AuthUser:
    id: str
    email: str | None = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """Verify the Supabase JWT and return the authenticated user."""
    token = credentials.credentials
    try:
        claims = verify_supabase_jwt(token)
    except InvalidTokenError as e:
        logger.error("auth_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthUser(id=user_id, email=claims.get("email"))
