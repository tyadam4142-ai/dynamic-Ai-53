# Dynamic AI 53 — No-Card Cloudflare Deployment

This package is the Cloudflare-native production-oriented build. It uses one Worker for the API and static site, Cloudflare D1 for accounts/projects/usage, and server-side AI provider secrets.

## 1. Requirements

- A Cloudflare account with `dynamicrobotics53.com` added and active.
- Node.js 20+ recommended.
- A GitHub repository is optional. GitHub publishing is disabled until configured.
- AI provider keys are optional for deployment but required for AI responses.

## 2. Install Wrangler

```bash
cd Dynamic_AI_53_PRO
npm install
npx wrangler login
```

## 3. Create the D1 database

```bash
npx wrangler d1 create dynamic-ai-53-db
```

Copy the returned `database_id` into `wrangler.toml`, replacing:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

## 4. Create the schema

```bash
npx wrangler d1 execute dynamic-ai-53-db --remote --file=./schema.sql
```

## 5. Set secrets

Generate a long admin secret yourself, then:

```bash
npx wrangler secret put ADMIN_SECRET
```

For AI, add at least one provider:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Optional fallbacks (Groq and OpenRouter both have real free tiers, so it's worth setting both):

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

Optional premium route — Claude (Anthropic). There is no free tier that matches Claude Pro/Max
quality; the Claude API is pay-as-you-go (new accounts get a small, time-limited trial credit).
If you add this key, Gold/Diamond/owner accounts are routed to Claude FIRST (best quality, paid
for by their subscription); Free/Silver accounts only fall back to it as a last resort if Gemini,
Groq and OpenRouter all fail, so it never silently spends your Anthropic credits on free users:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

After setting any provider secrets, verify them from Seller Control (`/admin.html` →
"Test AI providers") or by calling `/api/admin/ai-check` with your `X-DA53-Admin-Secret` header —
it makes one tiny live request per configured provider and tells you exactly which ones work and
why the ones that don't are failing (bad key, wrong model name, rate limit, etc.), instead of you
having to guess from a generic "AI does not work" symptom in the customer app.

Optional GitHub publishing:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Optional WhatsApp Cloud API:

```bash
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

Do not put any of these values in `public/index.html`.

## 6. Test locally

```bash
npm run check
npx wrangler dev
```

Open the local URL Wrangler prints. The AI still needs provider secrets in the local environment if you want live AI responses.

## 7. Deploy

```bash
npm run check
npx wrangler deploy
```

## 8. Attach domains

In Cloudflare, attach the same Worker to:

- `dynamicrobotics53.com`
- `www.dynamicrobotics53.com` (optional)
- `api.dynamicrobotics53.com` (optional; the API also works at `/api` on the main domain)
- `admin.dynamicrobotics53.com`

The dashboard can map the admin hostname to the same Worker. The Worker detects `admin.` and serves `admin.html`.

## 9. First owner setup

The owner account is created through the normal customer application flow. In Seller Control, approve the owner's number as `gold`/`diamond` initially, then the first commercial release keeps GitHub/WhatsApp owner tools restricted to the `owner` tier. For a permanent owner record, use the database editor to set the tier to `owner` and approved=1 after confirming the phone number.

Suggested owner update:

```sql
UPDATE accounts SET tier='owner', approved=1, monthly_tokens=NULL, remaining_tokens=NULL, expires_at=NULL WHERE phone='+YOUR_OWNER_NUMBER';
```

## 10. Customer flow

1. Customer opens `https://dynamicrobotics53.com`.
2. Customer enters phone number, chooses a plan, and sets their own password (8+ characters).
3. **Free plan:** the account is approved instantly — no seller step needed. The customer
   switches to "Sign In" and signs in with the password they just set.
4. **Paid plans:** the application is queued and a WhatsApp link can be generated for the seller.
5. Seller verifies manual payment.
6. Seller opens `https://admin.dynamicrobotics53.com` (or `/admin.html`) and approves the number.
7. Customer signs in with the phone number and password they created at signup — no code to
   relay. (Seller Control's "New activation code" button still exists as a manual override/
   recovery credential if a customer ever needs one.)
8. The device is bound to that account until the seller transfers it.

## 11. Important launch notes

Cloudflare Workers Free currently has a 100,000-request/day limit and 10 ms CPU time per invocation; D1 Free currently includes 5 million rows read/day and 100,000 rows written/day. These limits are suitable for an early release but are not a promise of unlimited commercial capacity.

The AI provider limits/costs are separate from Cloudflare. A server-side key is required for provider calls, and the single most common reason "the AI does nothing" on a fresh deploy is that no provider secret has actually been set yet (`/api/admin/ai-check` confirms this in seconds). A system cannot honestly guarantee unlimited free AI inference: Gemini, Groq and OpenRouter's free tiers are real but rate-limited and can change without notice, and there is no free API that matches Claude Pro, Max or Claude Code — Claude's API is paid, which is why it's wired in as an optional premium route rather than a "free" one.

Before taking real customer money, add reviewed Terms of Service, Privacy Policy, refund/cancellation language, a support contact, abuse controls, account recovery procedures, and a tested backup/export process.
