"""
Admin authentication for the archival gateway.

Two ways in, deliberately:

  1. A Firebase ID token (`Authorization: Bearer …`) carrying an `admin` custom
     claim. This is what the web dashboard uses — nothing secret lives in the
     browser, tokens expire in an hour, and access is revoked per account.

  2. The `X-Admin-Token` shared secret, for curl and server-to-server use.

The token is verified here rather than with firebase-admin, because that would
require a service account key sitting on this host. Verification only needs
Google's *public* certificates, so this box holds no credential at all.

The cost of that choice: no `check_revoked`. Revoking an account takes effect
when its current token expires, so within an hour rather than instantly. For an
admin dashboard with a handful of accounts that trade is worth it; if it stops
being worth it, add firebase-admin and a service account.
"""
import os
import secrets
import time
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Header, HTTPException, status

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
ADMIN_SECRET_TOKEN = os.environ.get("ADMIN_SECRET_TOKEN", "")

_CERT_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)

# Google rotates these keys. Cached in-process and refreshed when the cache
# expires, rather than fetched per request (slow) or pinned forever (breaks
# silently at the next rotation).
_certs: Dict[str, Any] = {}
_certs_expire_at: float = 0.0


def _load_certs() -> Dict[str, Any]:
    global _certs, _certs_expire_at
    if _certs and time.time() < _certs_expire_at:
        return _certs

    response = httpx.get(_CERT_URL, timeout=10.0)
    response.raise_for_status()

    # Honour the server's own cache lifetime instead of inventing one.
    max_age = 3600
    cache_control = response.headers.get("cache-control", "")
    for part in cache_control.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=", 1)[1])
            except ValueError:
                pass

    _certs = response.json()
    _certs_expire_at = time.time() + max(60, max_age)
    return _certs


def verify_firebase_token(token: str) -> Dict[str, Any]:
    """
    Returns the decoded claims, or raises HTTPException.

    Checks the signature *and* the issuer, audience and expiry. A signature check
    alone is not enough: a token minted by Google for a different project would
    pass it.
    """
    if not FIREBASE_PROJECT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="FIREBASE_PROJECT_ID is not configured on this service.",
        )

    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        certs = _load_certs()
        if kid not in certs:
            # A key rotation we have not picked up yet; refetch once before failing.
            global _certs_expire_at
            _certs_expire_at = 0.0
            certs = _load_certs()
        if kid not in certs:
            raise ValueError("unknown signing key")

        public_key = _public_key_from_cert(certs[kid])

        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except HTTPException:
        raise
    except Exception:
        # Deliberately uniform: telling a caller whether a token was expired,
        # forged or for the wrong project helps an attacker more than a user.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired identity token.",
        )


def _public_key_from_cert(pem: str):
    from cryptography.hazmat.backends import default_backend
    from cryptography.x509 import load_pem_x509_certificate

    return load_pem_x509_certificate(pem.encode("utf-8"), default_backend()).public_key()


async def require_admin(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """FastAPI dependency: allows either a signed-in admin or the shared secret."""
    if authorization and authorization.startswith("Bearer "):
        claims = verify_firebase_token(authorization[7:])
        if claims.get("admin") is not True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account does not have admin access.",
            )
        return {"via": "firebase", "uid": claims.get("sub"), "email": claims.get("email")}

    if x_admin_token and ADMIN_SECRET_TOKEN:
        # Constant-time: a plain `!=` returns faster on an early mismatch, which
        # leaks the shared secret one character at a time to a patient caller.
        if secrets.compare_digest(x_admin_token, ADMIN_SECRET_TOKEN):
            return {"via": "shared-token", "uid": None, "email": None}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Admin access requires a Firebase ID token or a valid X-Admin-Token.",
    )
