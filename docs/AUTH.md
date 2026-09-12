# Authentication

## Current Authentication

The current frontend uses `auth-guard.js` and a session token flow tied to the existing Google Apps Script backend. The shared guard also protects requests to the Apps Script API.

## Current Risks to Review

- repeated authentication/network verification;
- token lifetime and renewal behavior;
- browser storage exposure;
- client-side configuration that must not be treated as a secret;
- unauthorized API responses and redirect behavior.

## Future Authentication

The planned architecture is to use a proper authenticated identity boundary with Supabase Auth or a server-side authentication layer, with database authorization enforced separately through RLS.

Authentication proves who the user is. Authorization determines what that user may access or change.

## Rules

- Never commit passwords, service-role keys, private tokens, or credentials.
- Do not rely on a browser-only secret for authorization.
- Keep privileged operations behind a trusted server boundary.
- Test login, logout, session expiry, refresh, Remember Me, and unauthorized requests.
- Do not remove the current authentication guard until its replacement has been tested.
