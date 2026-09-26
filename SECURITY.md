# Dynamic AI 53 Security Notes

## Secrets

All provider keys/tokens are expected to be Cloudflare Worker secrets. Never paste real credentials into `public/`, GitHub Pages, browser JavaScript, or customer ZIPs.

## Admin

The seller dashboard requires the `X-DA53-Admin-Secret` header. Use a long random secret and keep access to `admin.dynamicrobotics53.com` private.

## Customer sessions

Customer passwords, activation codes, and session tokens are all stored as SHA-256 hashes in D1 — the plaintext value is never persisted anywhere. One active device ID is enforced per account. The seller can clear the device binding without seeing the customer's password or session token.

## Limits

The API rejects oversized JSON requests, applies basic per-IP in-memory rate limiting, and caps generated HTML size. Cloudflare's platform limits are still authoritative.

## GitHub

GitHub publishing is restricted to the `owner` tier and can be further restricted with `GITHUB_ALLOWED_REPOS`. For customer-specific GitHub access, use GitHub OAuth/app installations rather than a shared owner token.

## Commercial checklist

Before accepting real payments, verify Terms/Privacy/Refund policies, customer support details, abuse handling, recovery procedures, data retention, backups, provider billing, and local legal/tax requirements.
