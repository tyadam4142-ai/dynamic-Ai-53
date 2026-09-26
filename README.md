# Dynamic AI 53 — Commercial Cloudflare Build

Version 3.3.0

## What changed in 3.3.0

- **Self-serve passwords.** Signing up now means choosing your own password (8+ characters)
  instead of waiting on a seller-issued activation code. Free-tier accounts are approved
  instantly since no payment needs verifying; Silver/Gold/Diamond still queue for the
  seller's manual payment check, but the password you set at signup is what you sign in
  with once approved. A seller-issued activation code (Seller Control → "New activation
  code") still works too, as a recovery path.
- **Daily credits, monthly billing.** Each plan's token allowance now refills every day
  instead of being one lump sum for the whole month. The subscription itself is still a
  monthly charge (`expires_at` is unchanged) — only the credit refill cadence changed.
- Fixed a stray hardcoded placeholder admin secret (`taha2152`) in `admin.html` that didn't
  even match the server's own fallback value — Seller Control now just asks for whatever
  `ADMIN_SECRET` you actually configured.

A no-card Cloudflare-native full-stack build of Dynamic AI 53:

- Bright premium frontend based on the existing Dynamic AI 53 UI.
- Cloudflare Worker API.
- Cloudflare D1 database.
- Phone + activation-code login.
- One active device per account with seller transfer controls.
- Free / Silver / Gold / Diamond plan accounting.
- Seller control dashboard.
- AI provider fallback across Gemini, Groq, OpenRouter (all free-tier) and Claude/Anthropic (paid, premium route).
- One-click `/admin/ai-check` diagnostic to confirm which providers are actually working.
- Architect → Engineer → Auditor → repair loop for website generation.
- Live HTML preview in the client.
- ZIP export.
- Owner-only GitHub publishing using a server-side GitHub token.
- Owner-only WhatsApp delivery controls with wa.me fallback.
- Security headers and basic rate limiting.

## Current AI defaults

Free and Silver accounts route Groq `openai/gpt-oss-120b` → Gemini 3.8 Flash → OpenRouter `meta-llama/llama-3.3-70b-instruct:free` → OpenRouter `openrouter/free` (random free router), in that order, falling back to Claude (`claude-sonnet-5`) only if all four free routes fail and a Claude key is configured. Gold, Diamond and the owner tier route to Claude first, then fall back through the same free chain if Claude is unavailable. All model names live in environment variables (`wrangler.toml` `[vars]`), so they can be updated without touching client code or redeploying app logic.

**Provider names never reach the customer.** Chat/build responses only ever say "Dynamic AI 53", "Architect", "Engineer" or "Auditor" — never "Gemini", "Groq", "Claude" etc. — and a failed request returns a generic "temporarily unavailable" message instead of the real provider error. The real detail (which provider failed and why) only ever goes to your Worker logs and to `/api/admin/ai-check`, which is owner-only.

**On "a free Claude that's as good as Pro/Max/Code":** that isn't something that exists anywhere, from Anthropic or otherwise — Anthropic's own API has no permanent free tier (new accounts get a small trial credit that expires), and running Claude at Pro/Max quality costs real money per request. What's included instead is honest: Claude wired in as a proper paid option that your paying tiers use first, real free providers (Gemini/Groq/OpenRouter) for everyone else, and a diagnostic endpoint so you always know which of them is actually working.

## What is intentionally NOT packaged

- API keys
- GitHub tokens
- WhatsApp Cloud API credentials
- Admin secret

Those must be configured as Worker secrets.

## What “ready to sell” means here

This is a production-oriented deployable release, not a claim that software can be guaranteed to have zero bugs without deployment against your actual Cloudflare account, domain, secrets and traffic. The repository contains a syntax-check command and an explicit deployment checklist so you can validate the real environment before accepting customers.
