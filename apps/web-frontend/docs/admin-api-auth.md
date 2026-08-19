# Authenticating the archival API's admin endpoints

The admin dashboard at `/admin` calls `GET /api/v1/admin/status` on the archival
service with the signed-in user's **Firebase ID token**:

```
Authorization: Bearer <firebase-id-token>
```

This document is the server-side half. It lives here because that service is
deployed separately; nothing in this repository implements it.

## Why not `X-Admin-Token`

A browser dashboard has to hold whatever it sends. A static token would either be
compiled into the JavaScript bundle — readable by every visitor — or pasted in by
hand, giving a long-lived bearer secret with no expiry, no revocation, and no
record of which admin acted.

An ID token is short-lived (one hour), tied to a specific account, revocable by
disabling that account, and already present in the browser.

Keep `X-Admin-Token` for `curl` and server-to-server use. Read it from an
environment variable, never a source file, and rotate it if it is ever pasted
anywhere — a chat window, an issue, a screenshot.

## What the server must verify

Verifying only the signature is not enough. Check all of:

| Claim | Expected |
|---|---|
| signature | Signed by Google's current keys (see below) |
| `iss` | `https://securetoken.google.com/<project-id>` |
| `aud` | `<project-id>` |
| `exp` | In the future |
| `admin` | `true` |

Signing keys rotate. Fetch them from
`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`
and honour the `Cache-Control: max-age` header rather than fetching per request or
pinning them forever.

## FastAPI example

```python
import os
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, Header

# Application default credentials, or a service account file.
firebase_admin.initialize_app(credentials.ApplicationDefault(), {
    "projectId": os.environ["FIREBASE_PROJECT_ID"],
})


async def require_admin(authorization: str | None = Header(None)):
    """Verifies the caller's Firebase ID token and its `admin` claim."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization: Bearer <firebase-id-token> required")

    try:
        # check_revoked catches an account disabled since the token was issued,
        # which is the difference between revocation working and only appearing to.
        decoded = auth.verify_id_token(authorization[7:], check_revoked=True)
    except Exception:
        # Deliberately vague: distinguishing "expired" from "forged" helps an
        # attacker more than it helps a legitimate caller.
        raise HTTPException(401, "Invalid or expired token")

    if decoded.get("admin") is not True:
        raise HTTPException(403, "Admin access required")

    return decoded


@app.get("/api/v1/admin/status", dependencies=[Depends(require_admin)])
async def admin_status():
    ...
```

`verify_id_token` checks the signature, issuer, audience and expiry. Do not
hand-roll this.

## CORS

Already correct on the deployed service — `https://lineage.nexus` is allowed and
`authorization` is in `access-control-allow-headers`. If the origin list changes,
`authorization` must stay allowed or the browser will reject the preflight before
any request is sent.

## Granting admin

```bash
node scripts/set-admin-claim.mjs you@example.com
node scripts/set-admin-claim.mjs someone@example.com --revoke
```

Claims apply to the account's next token, so sign out and back in to see the
change without waiting for the hourly refresh.

## What the frontend guarantees, and what it does not

`useAuth` reads `admin` from the ID token to decide whether to show the dashboard
link and allow the `/admin` route. **That is presentation only.** The value comes
from the client and must never be trusted by the API — anyone can navigate to
`/admin`, and the page must be useless to them because the server refuses.
