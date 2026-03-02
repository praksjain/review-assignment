import logging
from functools import wraps

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth import decode_access_token

log = logging.getLogger("api.middleware")

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = decode_access_token(credentials.credentials)
        return {
            "employee_id": int(payload["sub"]),
            "username": payload["username"],
            "roles": payload["roles"],
        }
    except Exception as exc:
        log.warning("JWT validation failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_role(role: str):
    """Dependency that checks the current user has a specific role."""
    async def _check(user: dict = Depends(get_current_user)):
        if role not in user.get("roles", []):
            raise HTTPException(
                status_code=403,
                detail=f"Role '{role}' required",
            )
        return user
    return _check
