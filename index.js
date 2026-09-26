const APP_NAME = 'Dynamic AI 53';
const APP_VERSION = '3.3.0';
const SESSION_DAYS = 30;
const MAX_JSON_BYTES = 3_000_000;
const MAX_CODE_CHARS = 2_500_000;
const MAX_MISSION_CHARS = 20_000;
const MAX_HISTORY_ITEMS = 10;

const PLANS = {
  free: { label: 'Free', price: 0, monthlyTokens: 30000, chatBudget: 7000, budgets: { architect: 6000, engineer: 12000, auditor: 10000 }, premium: false, speed: 'Standard' },
  silver: { label: 'Silver', price: 753, monthlyTokens: 150000, chatBudget: 12000, budgets: { architect: 9000, engineer: 22000, auditor: 16000 }, premium: false, speed: 'Fast' },
  gold: { label: 'Gold', price: 1553, monthlyTokens: 600000, chatBudget: 20000, budgets: { architect: 12000, engineer: 38000, auditor: 26000 }, premium: true, speed: 'Priority' },
  diamond: { label: 'Diamond', price: 2553, monthlyTokens: 2000000, chatBudget: 32000, budgets: { architect: 18000, engineer: 58000, auditor: 42000 }, premium: true, speed: 'Elite' },
  owner: { label: 'Studio Owner', price: 0, monthlyTokens: null, chatBudget: 48000, budgets: { architect: 24000, engineer: 72000, auditor: 48000 }, premium: true, speed: 'Unlimited accounting' },
};

const memoryRate = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, ctx, url, method);
    }

    if (url.hostname.startsWith('admin.')) {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', request.url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, ctx, url, method) {
  try {
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin, env)) return json({ ok: false, error: 'Origin not allowed.' }, 403);

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });

    const path = url.pathname.slice('/api'.length) || '/';

    if (path === '/health' && method === 'GET') {
      return json({ ok: true, product: APP_NAME, version: APP_VERSION, database: !!env.DB, timestamp: new Date().toISOString() });
    }
    if (path === '/config' && method === 'GET') {
      return json({ ok: true, product: APP_NAME, version: APP_VERSION, role: 'cloudflare', api_base: '/api', plans: publicPlans() });
    }
    if (path === '/subscription/apply' && method === 'POST') return subscriptionApply(request, env);
    if (path === '/auth/login' && method === 'POST') return authLogin(request, env);
    if (path === '/auth/status' && method === 'POST') return authStatus(request, env);
    if (path === '/license/status' && method === 'POST') return authStatus(request, env);
    if (path === '/chat' && method === 'POST') return protectedAi(request, env, 'chat');
    if (path === '/swarm' && method === 'POST') return protectedAi(request, env, 'swarm');
    if (path === '/zip-project' && method === 'POST') return zipProject(request, env);
    if (path === '/github-push' && method === 'POST') return githubPush(request, env);
    if (path === '/whatsapp' && method === 'POST') return whatsapp(request, env);
    if (path === '/projects/list' && method === 'POST') return listProjects(request, env);
    if (path === '/projects/load' && method === 'POST') return loadProject(request, env);
    if (path === '/projects/save' && method === 'POST') return saveUserProject(request, env);

    if (path === '/admin/accounts' && method === 'POST') return adminAccounts(request, env);
    if (path === '/admin/approve' && method === 'POST') return adminApprove(request, env);
    if (path === '/admin/revoke' && method === 'POST') return adminRevoke(request, env);
    if (path === '/admin/transfer-device' && method === 'POST') return adminTransfer(request, env);
    if (path === '/admin/rotate-code' && method === 'POST') return adminRotateCode(request, env);
    if (path === '/admin/stats' && method === 'POST') return adminStats(request, env);
    if (path === '/admin/ai-check' && method === 'POST') return adminAiCheck(request, env);

    return json({ ok: false, error: 'Not found.' }, 404);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: safeError(err) }, 500);
  }
}

function originAllowed(origin, env) {
  if (!origin) return true;
  if (origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
  const configured = String(env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  if (configured.includes('*')) return true;
  return configured.includes(origin);
}

function corsHeaders(origin, env) {
  const allow = originAllowed(origin, env) ? (origin || '*') : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-DA53-Admin-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(payload, status = 200, extra = {}, origin = '*') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-DA53-Admin-Secret',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'X-XSS-Protection':'0',
      ...extra,
    },
  });
}

function safeError(err) {
  const message = err instanceof Error ? err.message : String(err);
  if (/api[_ -]?key|bearer|authorization|secret|token/i.test(message)) return 'The AI service request failed. Check the configured provider credentials.';
  return message.slice(0, 1200) || 'Unexpected server error.';
}

async function parseJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > MAX_JSON_BYTES) throw new Error('Request is too large.');
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new Error('Request is too large.');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Request body must be valid JSON.'); }
}

function nowIso() { return new Date().toISOString(); }
// Credits reset once per calendar day (UTC). The subscription itself (expires_at) still
// runs for a full month per payment — only the token allowance refills daily instead of
// being one lump sum for the whole month.
function dayKey(d = new Date()) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
function addOneMonth(d = new Date()) { const y=d.getUTCFullYear(), m=d.getUTCMonth(); const day=d.getUTCDate(); const last=new Date(Date.UTC(y, m+2, 0)).getUTCDate(); return new Date(Date.UTC(y, m+1, Math.min(day,last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())); }
function normalizePhone(value) { const digits = String(value || '').replace(/\D/g, ''); return digits ? `+${digits}` : ''; }
function validPhone(phone) { const n = phone.replace(/\D/g, ''); return n.length >= 8 && n.length <= 15; }
function cleanText(v, max = 10000) { return String(v ?? '').trim().slice(0, max); }
function projectSlug(v) { return cleanText(v || 'dynamic-ai-build', 120).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dynamic-ai-build'; }
function base64Url(bytes) { let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return base64Url(a); }
async function sha256(text) { const data = new TextEncoder().encode(text); const digest = await crypto.subtle.digest('SHA-256', data); return base64Url(new Uint8Array(digest)); }
async function timingSafeEqualText(a, b) { const ab = new TextEncoder().encode(String(a)); const bb = new TextEncoder().encode(String(b)); if (ab.length !== bb.length) return false; let x = 0; for (let i=0;i<ab.length;i++) x |= ab[i] ^ bb[i]; return x === 0; }
function publicPlans() { return Object.fromEntries(Object.entries(PLANS).filter(([k]) => k !== 'owner').map(([k,v]) => [k, { label:v.label, price:v.price, dailyTokens:v.monthlyTokens, monthlyTokens:v.monthlyTokens, speed:v.speed }])); }

async function getAccount(env, phone) {
  return env.DB.prepare('SELECT * FROM accounts WHERE phone = ?').bind(phone).first();
}

async function maybeResetDay(env, account) {
  if (!account) return null;
  const current = dayKey();
  if (account.month_key === current) return account;
  const tokens = account.monthly_tokens == null ? null : account.monthly_tokens;
  await env.DB.prepare('UPDATE accounts SET remaining_tokens = ?, month_key = ?, updated_at = ? WHERE phone = ?').bind(tokens, current, nowIso(), account.phone).run();
  return { ...account, remaining_tokens: tokens, month_key: current };
}

function accountView(a, includeHint = false) {
  if (!a) return null;
  const tier = PLANS[a.tier] ? a.tier : 'free';
  const out = {
    ok: true,
    phone: a.phone,
    tier,
    plan_name: PLANS[tier].label,
    speed: PLANS[tier].speed,
    approved: !!a.approved,
    expires_at: a.expires_at,
    session_expires_at: a.session_expires_at,
    remaining_tokens: a.remaining_tokens == null ? null : Number(a.remaining_tokens),
    limit_tokens: a.monthly_tokens == null ? null : Number(a.monthly_tokens),
    daily_limit_tokens: a.monthly_tokens == null ? null : Number(a.monthly_tokens),
    device_bound: !!a.device_id,
    timestamp: nowIso(),
  };
  if (includeHint && a.access_code_hint) out.access_code_hint = a.access_code_hint;
  return out;
}

async function subscriptionApply(request, env) {
  if (!env.DB) return json({ ok:false, error:'Database is not configured.' }, 503);
  const body = await parseJson(request);
  const phone = normalizePhone(body.phone);
  const tier = String(body.tier || 'silver').toLowerCase();
  const password = cleanText(body.password, 200);
  if (!validPhone(phone)) return json({ ok:false, error:'Enter a valid international phone number.' }, 400);
  if (!PLANS[tier] || tier === 'owner') return json({ ok:false, error:'Select a valid customer plan.' }, 400);

  const existing = await getAccount(env, phone);
  if (existing) {
    if (existing.password_hash) return json({ ok:false, error:'This phone number already has an account. Sign in instead, or ask the seller for a device transfer.' }, 409);
    if (password.length < 8) return json({ ok:false, error:'Choose a password with at least 8 characters.' }, 400);
    await env.DB.prepare('UPDATE accounts SET password_hash = ?, updated_at = ? WHERE phone = ?').bind(await sha256(password), nowIso(), phone).run();
    await env.DB.prepare('INSERT INTO subscription_requests (phone, tier, status, created_at) VALUES (?,?,?,?)').bind(phone, tier, 'pending', nowIso()).run();
  } else {
    if (password.length < 8) return json({ ok:false, error:'Choose a password with at least 8 characters.' }, 400);
    const p = PLANS[tier];
    // Free is a self-serve tier: no payment to verify, so it's approved immediately.
    // Paid tiers still go into the seller's approval queue once payment is confirmed.
    const autoApprove = tier === 'free';
    await env.DB.prepare(`INSERT INTO accounts (phone,tier,approved,password_hash,monthly_tokens,remaining_tokens,month_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(phone, tier, autoApprove ? 1 : 0, await sha256(password), p.monthlyTokens, p.monthlyTokens, dayKey(), nowIso(), nowIso()).run();
    await env.DB.prepare('INSERT INTO subscription_requests (phone, tier, status, created_at, resolved_at) VALUES (?,?,?,?,?)').bind(phone, tier, autoApprove ? 'approved' : 'pending', nowIso(), autoApprove ? nowIso() : null).run();
  }
  await logAudit(env, phone, 'subscription_apply', tier);
  if (tier === 'free') {
    return json({ ok:true, approved:true, message:'Your free Dynamic AI 53 account is ready. Sign in now with your phone number and password.' });
  }
  const ownerWhatsApp = String(env.OWNER_WHATSAPP || '').replace(/\D/g, '');
  const message = `Dynamic AI 53 subscription request%0APhone: ${encodeURIComponent(phone)}%0APlan: ${encodeURIComponent(PLANS[tier].label)} — ₹${PLANS[tier].price}/month%0AAction: please verify payment and approve in Seller Control.`;
  const url = ownerWhatsApp ? `https://wa.me/${ownerWhatsApp}?text=${message}` : null;
  return json({ ok:true, approved:false, message:'Application received. Complete payment with Dynamic AI 53, then the seller will approve your account. Sign in with the password you just created once approved.', owner_notification:url ? { method:'wa_me', url } : { method:'not_configured' } });
}

async function authLogin(request, env) {
  const body = await parseJson(request);
  const phone = normalizePhone(body.phone);
  const password = cleanText(body.password ?? body.code, 200);
  const deviceId = cleanText(body.device_id, 200);
  if (!validPhone(phone) || password.length < 6 || !deviceId) return json({ ok:false, error:'Enter your phone number and password, and allow this device to be registered.' }, 400);
  let a = await getAccount(env, phone);
  if (!a) return json({ ok:false, error:'No Dynamic AI 53 account exists for this number.' }, 404);
  a = await maybeResetDay(env, a);
  if (!a.approved) return json({ ok:false, approved:false, message:'Your Dynamic AI 53 access is awaiting approval.' }, 403);
  if (a.tier !== 'free' && a.tier !== 'owner' && a.expires_at && new Date(a.expires_at) <= new Date()) return json({ ok:false, error:'Your Dynamic AI 53 subscription has expired. Please contact Dynamic AI 53 to renew it.' }, 403);
  // Self-chosen password is the primary credential; a seller-issued activation code
  // (set via Seller Control) still works too, e.g. as a recovery path.
  const goodPassword = a.password_hash ? await timingSafeEqualText(await sha256(password), a.password_hash) : false;
  const goodCode = !goodPassword && a.access_code_hash ? await timingSafeEqualText(await sha256(password), a.access_code_hash) : false;
  if (!goodPassword && !goodCode) return json({ ok:false, error:'Incorrect phone number or password.' }, 401);
  if (a.device_id && a.device_id !== deviceId) return json({ ok:false, error:'This phone number is active on another device. Ask Dynamic AI 53 to transfer the device.' }, 409);
  const session = randomToken(32);
  const sessionHash = await sha256(session);
  const expiry = new Date(Date.now() + SESSION_DAYS*86400000).toISOString();
  await env.DB.prepare('UPDATE accounts SET device_id = ?, session_hash = ?, session_expires_at = ?, updated_at = ? WHERE phone = ?').bind(deviceId, sessionHash, expiry, nowIso(), phone).run();
  await logAudit(env, phone, 'login', 'customer login');
  a = { ...a, device_id: deviceId, session_hash: sessionHash, session_expires_at: expiry };
  return json({ ...accountView(a), session_token: session });
}

async function authenticate(request, env, body) {
  const phone = normalizePhone(body.phone);
  const session = cleanText(body.session_token, 300);
  const deviceId = cleanText(body.device_id, 200);
  if (!validPhone(phone) || !session || !deviceId) throw new Error('Your Dynamic AI 53 session is missing. Sign in again.');
  let a = await getAccount(env, phone);
  if (!a) throw new Error('No Dynamic AI 53 account exists for this number.');
  a = await maybeResetDay(env, a);
  if (!a.approved) throw new Error('Your Dynamic AI 53 access is awaiting approval.');
  if (a.tier !== 'free' && a.tier !== 'owner' && a.expires_at && new Date(a.expires_at) <= new Date()) throw new Error('Your Dynamic AI 53 subscription has expired.');
  if (!a.device_id || a.device_id !== deviceId) throw new Error('This account is active on another device. Ask Dynamic AI 53 to transfer it.');
  if (!a.session_hash || !(await timingSafeEqualText(await sha256(session), a.session_hash))) throw new Error('Your Dynamic AI 53 session is no longer active. Sign in again.');
  if (!a.session_expires_at || new Date(a.session_expires_at) <= new Date()) throw new Error('Your Dynamic AI 53 session expired. Sign in again.');
  return a;
}

async function authStatus(request, env) {
  const body = await parseJson(request);
  try {
    const a = await authenticate(request, env, body);
    return json(accountView(a));
  } catch (err) { return json({ ok:false, error:safeError(err) }, 401); }
}

function clientIp(request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'; }
function rateLimit(request, key, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const id = `${key}:${clientIp(request)}`;
  const old = memoryRate.get(id);
  if (!old || old.resetAt <= now) { memoryRate.set(id, { count:1, resetAt:now+windowMs }); return true; }
  old.count += 1;
  memoryRate.set(id, old);
  return old.count <= limit;
}

async function protectedAi(request, env, mode) {
  if (!rateLimit(request, mode === 'swarm' ? 'swarm' : 'chat', mode === 'swarm' ? 6 : 30, 60000)) return json({ ok:false, error:'Too many requests. Please slow down and try again.' }, 429);
  const body = await parseJson(request);
  let account;
  try { account = await authenticate(request, env, body); } catch (err) { return json({ ok:false, error:safeError(err) }, 401); }
  const tier = PLANS[account.tier] ? account.tier : 'free';
  if (mode === 'chat') return doChat(body, account, tier, env);
  return doSwarm(body, account, tier, env);
}

async function doChat(body, account, tier, env) {
  const message = cleanText(body.message, MAX_MISSION_CHARS);
  if (!message) return json({ ok:false, error:'Message cannot be empty.' }, 400);
  const plan = PLANS[tier];
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_ITEMS).map(x => ({ role: cleanText(x?.role,20), content: cleanText(x?.content,6000) })).filter(x => x.content) : [];
  const context = history.map(x => `${x.role.toUpperCase()}: ${x.content}`).join('\n\n');
  const system = `You are Dynamic AI 53, a premium general-purpose AI copilot. Answer accurately and practically. Help with software, robotics, design, business, writing, math, research planning and general knowledge. Do not claim to browse or verify live facts unless a tool actually did so. For coding, provide complete usable snippets and important assumptions. Never reveal internal provider credentials or private routing details.`;
  const prompt = context ? `CONVERSATION:\n${context}\n\nCURRENT USER MESSAGE:\n${message}` : `CURRENT USER MESSAGE:\n${message}`;
  const reserve = plan.chatBudget;
  let reserved = 0;
  try { reserved = await reserveUsage(env, account, reserve, 'chat'); } catch (err) { return json({ ok:false, error:safeError(err) }, 429); }
  const start = Date.now();
  try {
    const r = await providerCall(env, routeForStage('engineer', tier), system, prompt, plan.chatBudget);
    const quota = await settleUsage(env, account, reserved, r.usage.total_tokens, 'chat');
    return json({ ok:true, mode:'chat', reply:r.text, usage:r.usage, quota, agent:{ label:'Dynamic AI 53' }, elapsed_ms:Date.now()-start, timestamp:nowIso() });
  } catch (err) {
    if (reserved) await releaseUsage(env, account, reserved, 'chat');
    return json({ ok:false, error:safeError(err) }, 502);
  }
}

async function doSwarm(body, account, tier, env) {
  const mission = cleanText(body.mission, MAX_MISSION_CHARS);
  const project = projectSlug(body.project_name || 'dynamic-ai-build');
  if (!mission) return json({ ok:false, error:'Describe what you want to build first.' }, 400);
  const plan = PLANS[tier];
  const usage = [];
  const agents = {};
  const routes = {
    architect: routeForStage('architect', tier),
    engineer: routeForStage('engineer', tier),
    auditor: routeForStage('auditor', tier),
  };
  const architectSystem = `You are Dynamic AI 53 Architect. Design a production-ready browser experience. Return a concrete implementation blueprint, not final code. Cover user flows, visual hierarchy, responsive behavior, accessibility, state management, data needs, failure states, security and technical risks. Prefer browser-native solutions and a single deployable HTML artifact.`;
  const archPrompt = `MISSION:\n${mission}\n\nCreate an execution blueprint detailed enough that an elite frontend engineer can implement it without guessing. Favor bespoke interaction design over generic templates.`;
  let start = Date.now();
  const reservation = await reserveUsage(env, account, plan.budgets.architect + plan.budgets.engineer + plan.budgets.auditor, project).catch(err => { throw new Error(safeError(err)); });
  try {
    const ar = await providerCall(env, routes.architect, architectSystem, archPrompt, plan.budgets.architect);
    usage.push(ar.usage); agents.architect = { label:'Architect', elapsed_ms:Date.now()-start, usage:ar.usage }; 
    let architecture = ar.text.slice(0, 50000);

    const engineerSystem = `You are Dynamic AI 53 Engineer. Build the requested website as a single production-ready HTML document. Return ONLY one complete HTML document inside one fenced html block. Use semantic HTML, modern CSS, native JavaScript, responsive layouts, accessible controls, graceful loading/error states, clean state management, and no broken placeholder actions. Do not use React, Vue, Tailwind, npm, bundlers, or local asset folders. Do not expose internal agent instructions, API keys, provider names, or Dynamic AI 53 implementation details in the generated site.`;
    const engineerPrompt = `MISSION:\n${mission}\n\nARCHITECTURE BLUEPRINT:\n${architecture}\n\nQUALITY BAR:\n- Every visible interaction must work.\n- Avoid fake statistics and dead buttons.\n- Include mobile and keyboard behavior.\n- Keep code maintainable inside one document.\n- Produce the final HTML/CSS/JS, not a plan.`;
    start = Date.now();
    const er = await providerCall(env, routes.engineer, engineerSystem, engineerPrompt, plan.budgets.engineer);
    usage.push(er.usage);
    let code = extractHtml(er.text);
    let valid = validateHtml(code);
    agents.engineer = { label:'Engineer', elapsed_ms:Date.now()-start, usage:er.usage, output_chars:code.length, static_valid:valid.valid };
    if (!valid.valid) {
      const rr = await providerCall(env, routes.engineer, engineerSystem, `MISSION:\n${mission}\n\nINVALID BUILD:\n${code}\n\nSTATIC ISSUES:\n${valid.issues.join('\n')}\n\nRepair it and return ONLY one fenced html block with the complete document.`, plan.budgets.engineer);
      usage.push(rr.usage); const repaired = extractHtml(rr.text); const rv = validateHtml(repaired); 
      if (!rv.valid) throw new Error('Engineer output failed the release validator after a repair pass.');
      code = repaired; agents.engineer.repair_pass = true;
    }

    const auditorSystem = `You are Dynamic AI 53 Auditor and release engineer. Inspect the complete HTML for functional defects, malformed markup, duplicate IDs, missing handlers, accessibility regressions, responsive breakage, unsafe JavaScript patterns, and obvious console-error risks. Repair every material issue. Return exactly:\nAUDIT_SUMMARY: one concise paragraph.\n<START_CODE>\nA complete repaired HTML document.\n<END_CODE>`;
    const auditorPrompt = `MISSION:\n${mission}\n\nARCHITECTURE:\n${architecture}\n\nENGINEER BUILD:\n${code}`;
    start = Date.now();
    const aud = await providerCall(env, routes.auditor, auditorSystem, auditorPrompt, plan.budgets.auditor);
    usage.push(aud.usage);
    let parsed = parseAuditor(aud.text, code);
    valid = validateHtml(parsed.code);
    agents.auditor = { label:'Auditor', elapsed_ms:Date.now()-start, usage:aud.usage, output_chars:parsed.code.length, static_valid:valid.valid };
    if (!valid.valid) {
      const rr = await providerCall(env, routes.auditor, auditorSystem, `MISSION:\n${mission}\n\nCURRENT HTML:\n${parsed.code}\n\nRELEASE ISSUES:\n${valid.issues.join('\n')}\n\nRepair it and return exactly AUDIT_SUMMARY plus <START_CODE> complete HTML <END_CODE>.`, plan.budgets.auditor);
      usage.push(rr.usage); parsed = parseAuditor(rr.text, parsed.code); valid = validateHtml(parsed.code); agents.auditor.repair_pass = true;
      if (!valid.valid) throw new Error('Auditor could not produce a structurally valid release build.');
    }
    await saveProject(env, account.phone, project, architecture, parsed.code, parsed.summary);
    const total = totalUsage(usage);
    const quota = await settleUsage(env, account, reservation, total.total_tokens, project);
    return json({ ok:true, mode:'cloudflare', architecture, audit_summary:parsed.summary, final_code:parsed.code, agents, usage:total, quota, quality:{static_gate:true, repair_cap:2}, timestamp:nowIso() });
  } catch (err) {
    if (reservation) await releaseUsage(env, account, reservation, project);
    return json({ ok:false, error:safeError(err) }, 502);
  }
}

// Provider order per stage/tier — a quality ladder, not just a fallback list.
// Free routes are tried in the order that tends to give the strongest free answer first:
// Groq (fast Llama/GPT-OSS) -> Gemini -> OpenRouter's named Llama 3.3 70B -> OpenRouter's
// random free router as a last resort. Claude is the premium route: paid tiers (Gold/Diamond/
// owner) try it FIRST since their subscription funds it and it's the strongest model here;
// Free/Silver only fall back to it as an absolute last resort (and only if you've configured
// it), so a free-tier user never silently spends your Anthropic credits.
function routeForStage(stage, tier) {
  const premium = !!PLANS[tier]?.premium;
  const freeChain = ['groq', 'gemini', 'openrouter_llama', 'openrouter'];
  return premium ? ['anthropic', ...freeChain] : [...freeChain, 'anthropic'];
}

function clampInt(n, min, max) { n = Number(n) || min; return Math.max(min, Math.min(max, Math.round(n))); }

async function providerCall(env, chain, system, prompt, maxTokens) {
  const errors = [];
  for (const provider of chain) {
    try {
      if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) return await callAnthropic(env.ANTHROPIC_API_KEY, String(env.ANTHROPIC_MODEL || 'claude-sonnet-5'), system, prompt, clampInt(maxTokens, 256, 8192));
      if (provider === 'gemini' && env.GEMINI_API_KEY) return await callGemini(env.GEMINI_API_KEY, String(env.GEMINI_MODEL || 'gemini-3.8-flash'), system, prompt, maxTokens);
      if (provider === 'groq' && env.GROQ_API_KEY) return await callOpenAICompat('https://api.groq.com/openai/v1', env.GROQ_API_KEY, String(env.GROQ_MODEL || 'openai/gpt-oss-120b'), system, prompt, maxTokens, 'Groq');
      if (provider === 'openrouter_llama' && env.OPENROUTER_API_KEY) return await callOpenAICompat('https://openrouter.ai/api/v1', env.OPENROUTER_API_KEY, String(env.OPENROUTER_LLAMA_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'), system, prompt, maxTokens, 'OpenRouter');
      if (provider === 'openrouter' && env.OPENROUTER_API_KEY) return await callOpenAICompat('https://openrouter.ai/api/v1', env.OPENROUTER_API_KEY, String(env.OPENROUTER_MODEL || 'openrouter/free'), system, prompt, maxTokens, 'OpenRouter');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Dynamic AI 53] ${provider} failed:`, msg);
      errors.push(`${provider}: ${msg}`);
    }
  }
  // Client-facing message is deliberately generic — which providers/models are wired up
  // underneath is never revealed to customers. Full detail (including which provider failed
  // and why) is in the Worker logs via console.error above and in /api/admin/ai-check.
  if (errors.length) throw new Error('The AI engine is temporarily unavailable. Please try again in a moment.');
  throw new Error('The AI engine is not configured yet. (Owner: check /api/admin/ai-check.)');
}

async function readErrDetail(res) { try { const t = await res.text(); return t ? t.slice(0, 300).replace(/\s+/g, ' ').trim() : ''; } catch { return ''; } }

async function callAnthropic(key, model, system, prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json' },
    body: JSON.stringify({ model, max_tokens:maxTokens, temperature:0.2, system, messages:[{ role:'user', content:prompt }] }),
  });
  if (!res.ok) { const detail = await readErrDetail(res); throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail}` : ''}`); }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('').trim();
  if (!text) throw new Error('Anthropic returned an empty response.');
  const u = data.usage || {};
  const inTok = Number(u.input_tokens || 0), outTok = Number(u.output_tokens || 0);
  return { text, provider:'Claude', model, usage:{ prompt_tokens:inTok, completion_tokens:outTok, total_tokens:inTok + outTok } };
}

async function callGemini(key, model, system, prompt, maxTokens) {
  const models = [model, 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(Boolean);
  let lastErr;
  for (const m of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: Math.max(maxTokens, 120) }
        })
      });
      if (!res.ok) {
        const detail = await readErrDetail(res);
        throw new Error(`Gemini (${m}) HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
      if (!text) {
        const blockReason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason;
        throw new Error(`Gemini returned an empty response.${blockReason ? ` (${blockReason})` : ''}`);
      }
      const u = data.usageMetadata || {};
      return { text, provider: 'Gemini', model: m, usage: { prompt_tokens: Number(u.promptTokenCount || 0), completion_tokens: Number(u.candidatesTokenCount || 0), total_tokens: Number(u.totalTokenCount || 0) } };
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (msg.includes('503') || msg.includes('demand') || msg.includes('404')) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function callOpenAICompat(base, key, model, system, prompt, maxTokens, provider) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dynamicrobotics53.com',
      'X-Title': APP_NAME
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: Math.max(maxTokens, 64)
    })
  });
  if (!res.ok) {
    const detail = await readErrDetail(res);
    throw new Error(`${provider} HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  let content = choice?.content || choice?.reasoning || '';
  if (Array.isArray(content)) content = content.map(x => x.text || '').join('');
  content = String(content).trim();
  if (!content) throw new Error(`${provider} returned an empty response.`);
  return { text: content, provider, model, usage: { prompt_tokens: Number(data.usage?.prompt_tokens || 0), completion_tokens: Number(data.usage?.completion_tokens || 0), total_tokens: Number(data.usage?.total_tokens || 0) } };
}

function totalUsage(items) { return { prompt_tokens:items.reduce((n,x)=>n+Number(x.prompt_tokens||0),0), completion_tokens:items.reduce((n,x)=>n+Number(x.completion_tokens||0),0), total_tokens:items.reduce((n,x)=>n+Number(x.total_tokens||0),0) }; }

async function reserveUsage(env, account, amount, project) {
  if (account.tier === 'owner' || account.monthly_tokens == null) return 0;
  const a = await maybeResetDay(env, await getAccount(env, account.phone));
  const remaining = Number(a?.remaining_tokens || 0);
  const reserve = Math.max(0, Number(amount || 0));
  if (remaining < reserve) throw new Error(`Not enough Dynamic AI 53 credits. You have ${remaining.toLocaleString()} tokens remaining.`);
  const r = await env.DB.prepare('UPDATE accounts SET remaining_tokens = remaining_tokens - ?, updated_at = ? WHERE phone = ? AND remaining_tokens >= ?').bind(reserve, nowIso(), account.phone, reserve).run();
  if (!r.meta?.changes) throw new Error('Your available Dynamic AI 53 credits changed while this request was starting. Please retry.');
  return reserve;
}

async function settleUsage(env, account, reserved, actual, project) {
  if (account.tier === 'owner' || account.monthly_tokens == null) {
    await env.DB.prepare('INSERT INTO usage (phone, project, tokens, created_at) VALUES (?,?,?,?)').bind(account.phone, project, Math.max(0,Number(actual||0)), nowIso()).run();
    return { remaining_tokens:null, limit_tokens:null };
  }
  const used = Math.max(0, Number(actual || 0));
  const refund = Math.max(0, Number(reserved || 0) - used);
  const a = await getAccount(env, account.phone);
  const limit = Number(a?.monthly_tokens || 0);
  await env.DB.prepare('UPDATE accounts SET remaining_tokens = MIN(?, remaining_tokens + ?), updated_at = ? WHERE phone = ?').bind(limit, refund, nowIso(), account.phone).run();
  await env.DB.prepare('INSERT INTO usage (phone, project, tokens, created_at) VALUES (?,?,?,?)').bind(account.phone, project, used, nowIso()).run();
  const latest = await getAccount(env, account.phone);
  return { remaining_tokens:Number(latest?.remaining_tokens || 0), limit_tokens:limit };
}

async function releaseUsage(env, account, reserved, project) {
  if (!reserved || account.tier === 'owner' || account.monthly_tokens == null) return;
  const a = await getAccount(env, account.phone);
  const limit = Number(a?.monthly_tokens || 0);
  await env.DB.prepare('UPDATE accounts SET remaining_tokens = MIN(?, remaining_tokens + ?), updated_at = ? WHERE phone = ?').bind(limit, Number(reserved), nowIso(), account.phone).run();
}

function extractHtml(text) {
  const fenced = String(text || '').match(/```html\s*([\s\S]*?)```/i) || String(text || '').match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).replace(/^\s*<!doctype html>/i, '<!doctype html>').trim();
}

function validateHtml(code) {
  const issues=[]; const lower=String(code||'').toLowerCase();
  if (!lower.includes('<!doctype html>') && !lower.includes('<!doctype html')) issues.push('Missing HTML5 doctype.');
  if (!lower.includes('<html') || !lower.includes('</html>')) issues.push('Missing html document wrapper.');
  if (!lower.includes('<head') || !lower.includes('</head>')) issues.push('Missing head element.');
  if (!lower.includes('<body') || !lower.includes('</body>')) issues.push('Missing body element.');
  if ((code.match(/<script\b/gi)||[]).length !== (code.match(/<\/script>/gi)||[]).length) issues.push('Unbalanced script tags.');
  if ((code.match(/<style\b/gi)||[]).length !== (code.match(/<\/style>/gi)||[]).length) issues.push('Unbalanced style tags.');
  const ids=[...String(code).matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
  const dup=ids.filter((v,i)=>ids.indexOf(v)!==i); if (dup.length) issues.push(`Duplicate IDs: ${[...new Set(dup)].slice(0,8).join(', ')}`);
  if (code.length < 200) issues.push('Generated document is unexpectedly short.');
  if (code.length > MAX_CODE_CHARS) issues.push('Generated document exceeds size limit.');
  return { valid:issues.length===0, issues };
}

function parseAuditor(text, fallback) {
  const s=String(text||''); const summary=(s.match(/AUDIT_SUMMARY:\s*([^\n]+)/i)?.[1] || 'Release audit completed.').trim();
  const m=s.match(/<START_CODE>\s*([\s\S]*?)\s*<END_CODE>/i);
  const code=extractHtml(m ? m[1] : fallback);
  return { summary, code };
}

async function saveProject(env, phone, project, architecture, code, audit) {
  await env.DB.prepare(`INSERT INTO projects (phone, project, architecture, code, audit_summary, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(phone,project) DO UPDATE SET architecture=excluded.architecture, code=excluded.code, audit_summary=excluded.audit_summary, updated_at=excluded.updated_at`).bind(phone, project, architecture.slice(0,50000), code.slice(0,MAX_CODE_CHARS), audit.slice(0,4000), nowIso()).run();
}

async function listProjects(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  const rows = await env.DB.prepare('SELECT project, updated_at, substr(audit_summary, 1, 150) as summary_preview, length(code) as code_size FROM projects WHERE phone = ? ORDER BY updated_at DESC').bind(account.phone).all();
  return json({ ok:true, phone:account.phone, projects:rows.results || [] });
}

async function loadProject(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  const projectName = projectSlug(body.project_name || '');
  if (!projectName) return json({ ok:false, error:'Project name is required.' }, 400);
  const row = await env.DB.prepare('SELECT project, architecture, code, audit_summary, updated_at FROM projects WHERE phone = ? AND project = ?').bind(account.phone, projectName).first();
  if (!row) return json({ ok:false, error:'Project not found.' }, 404);
  return json({ ok:true, project:row.project, architecture:row.architecture, code:row.code, audit_summary:row.audit_summary, updated_at:row.updated_at });
}

async function saveUserProject(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  const projectName = projectSlug(body.project_name || 'dynamic-ai-build');
  const code = String(body.code || '');
  if (!code) return json({ ok:false, error:'No code to save.' }, 400);
  await saveProject(env, account.phone, projectName, String(body.architecture || ''), code, String(body.audit_summary || ''));
  return json({ ok:true, message:`Project "${projectName}" saved successfully.`, updated_at:nowIso() });
}

async function zipProject(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  const code = String(body.code || '');
  if (!validateHtml(code).valid) return json({ok:false,error:'Only a structurally valid HTML build can be exported.'},400);
  if (code.length > MAX_CODE_CHARS) return json({ok:false,error:'Generated build is too large.'},413);
  const name = projectSlug(body.project_name || 'dynamic-ai-build');
  const files = [
    {name:'index.html', data:code},
    {name:'ARCHITECTURE.md', data:String(body.architecture||'')},
    {name:'AUDIT.md', data:String(body.audit_summary||'')},
    {name:'README.md', data:`# Dynamic AI 53 Project\n\nGenerated project: ${name}\n\nOpen index.html in a browser or publish the files to your preferred static host.`},
  ];
  const zip = buildZip(files);
  const headers = { 'Content-Type':'application/zip', 'Content-Disposition':`attachment; filename="${name}.zip"`, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Strict-Transport-Security':'max-age=31536000; includeSubDomains', ...corsHeaders(request.headers.get('Origin'),env) };
  return new Response(zip, {status:200,headers});
}

async function githubPush(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  if (account.tier !== 'owner') return json({ok:false,error:'GitHub publishing is restricted to the Dynamic AI 53 owner account in this release.'},403);
  if (!env.GITHUB_TOKEN) return json({ok:false,error:'GitHub publishing is not configured yet. Add GITHUB_TOKEN to Worker secrets.'},503);
  const repoPath = cleanText(body.repo_path, 200).replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/i,'').replace(/\/$/,'');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoPath)) return json({ok:false,error:'Repository must be written as owner/repository.'},400);
  const allowed = String(env.GITHUB_ALLOWED_REPOS || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(repoPath)) return json({ok:false,error:'That repository is not on the approved publishing list.'},403);
  const code = String(body.code||''); if (!validateHtml(code).valid) return json({ok:false,error:'Generated build failed the release gate.'},400);
  const branch = cleanText(body.branch || 'main', 100) || 'main';
  const project = projectSlug(body.project_name || 'dynamic-ai-build');
  const files = [
    ['index.html', code],
    ['ARCHITECTURE.md', String(body.architecture||'')],
    ['AUDIT.md', String(body.audit_summary||'')],
  ];
  try {
    const results=[];
    for (const [path, content] of files) results.push(await githubPutFile(env.GITHUB_TOKEN, repoPath, path, content, branch, cleanText(body.commit_message || `feat: publish ${project}`, 140)));
    await logAudit(env, account.phone, 'github_push', repoPath);
    return json({ok:true,message:`Published ${project} to ${repoPath}.`,branch,files:results});
  } catch (err) { return json({ok:false,error:safeError(err)},502); }
}

async function githubPutFile(token, repo, path, text, branch, message) {
  const encoded = toBase64Utf8(text);
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const h = { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json', 'User-Agent':'Dynamic-AI-53' };
  let sha;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {headers:h});
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) throw new Error(`GitHub lookup HTTP ${existing.status}`);
  const payload = { message, content:encoded, branch }; if (sha) payload.sha = sha;
  const put = await fetch(url, {method:'PUT',headers:h,body:JSON.stringify(payload)});
  if (!put.ok) throw new Error(`GitHub publish HTTP ${put.status}`);
  const data = await put.json(); return {path,sha:data.content?.sha||null};
}

function toBase64Utf8(text) { const bytes=new TextEncoder().encode(String(text)); let binary=''; const chunk=0x8000; for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk)); return btoa(binary); }
function crc32(data) { let crc=0xffffffff; for (const byte of data) { crc ^= byte; for(let k=0;k<8;k++) crc=(crc>>>1) ^ (0xedb88320 & -(crc&1)); } return (crc ^ 0xffffffff)>>>0; }
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function concatBytes(...parts){let total=0; for(const p of parts) total+=p.length; const out=new Uint8Array(total); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out;}
function buildZip(files){
  const enc=new TextEncoder(); const locals=[]; const centrals=[]; let offset=0; const date=new Date();
  const dosTime=(date.getHours()<<11)| (date.getMinutes()<<5)| Math.floor(date.getSeconds()/2);
  const dosDate=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  for(const f of files){
    const name=enc.encode(f.name); const data=enc.encode(String(f.data??'')); const crc=crc32(data); const lh=concatBytes(u32(0x04034b50),u16(20),u16(0x800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name); locals.push(concatBytes(lh,data));
    const ch=concatBytes(u32(0x02014b50),u16(20),u16(20),u16(0x800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name); centrals.push(ch); offset += lh.length + data.length;
  }
  const central=concatBytes(...centrals); const local=concatBytes(...locals); const end=concatBytes(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(local.length),u16(0)); return concatBytes(local,central,end);
}

async function whatsapp(request, env) {
  const body = await parseJson(request);
  let account; try { account = await authenticate(request, env, body); } catch (err) { return json({ok:false,error:safeError(err)},401); }
  if (account.tier !== 'owner') return json({ok:false,error:'WhatsApp delivery controls are restricted to the owner account.'},403);
  const phone = normalizePhone(body.client_phone); const message = cleanText(body.message, 4096);
  if (!validPhone(phone) || !message) return json({ok:false,error:'Enter a valid client WhatsApp number and message.'},400);
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    const version = String(env.WHATSAPP_API_VERSION || 'v23.0');
    const endpoint=`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const res=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone.replace(/\D/g,''),type:'text',text:{preview_url:false,body:message}})});
    if(res.ok){const data=await res.json(); return json({ok:true,message:'WhatsApp message sent.',notification:{method:'cloud_api',message_id:data.messages?.[0]?.id||null}});}
  }
  return json({ok:true,message:'WhatsApp ready in manual mode.',notification:{method:'wa_me',url:`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`} });
}

async function adminAuth(request, env) {
  const secret = String(request.headers.get('X-DA53-Admin-Secret') || '');
  const expected = String(env.ADMIN_SECRET || 'dynamic-ai-admin-secret');
  if (!expected) throw new Error('Seller admin is not configured. Add ADMIN_SECRET to environment.');
  if (!(await timingSafeEqualText(secret, expected))) throw new Error('Seller admin authorization failed.');
  if (!rateLimit(request, 'admin', 60, 60000)) throw new Error('Too many admin requests.');
}

async function adminAccounts(request, env) { try{await adminAuth(request,env);const rows=await env.DB.prepare('SELECT * FROM accounts ORDER BY updated_at DESC').all();return json({ok:true,accounts:(rows.results||[]).map(a=>accountView(a,true))});}catch(e){return json({ok:false,error:safeError(e)},401);} }
async function adminApprove(request, env) {
  try { await adminAuth(request,env); const body=await parseJson(request); const phone=normalizePhone(body.phone); const tier=String(body.tier||'silver').toLowerCase(); if(!validPhone(phone)||!PLANS[tier]||tier==='owner') return json({ok:false,error:'Valid phone and customer plan are required.'},400); let a=await getAccount(env,phone); if(!a) return json({ok:false,error:'Account not found.'},404); const code=cleanText(body.code,30)||String(Math.floor(10000000+Math.random()*90000000)); const hash=await sha256(code); const p=PLANS[tier]; const expiry=addOneMonth(new Date()); await env.DB.prepare('UPDATE accounts SET tier=?, approved=1, access_code_hash=?, access_code_hint=?, monthly_tokens=?, remaining_tokens=?, month_key=?, expires_at=?, updated_at=? WHERE phone=?').bind(tier,hash,code,p.monthlyTokens,p.monthlyTokens,dayKey(),tier==='free'?null:expiry.toISOString(),nowIso(),phone).run(); await env.DB.prepare("UPDATE subscription_requests SET status='approved', resolved_at=? WHERE phone=? AND status='pending'").bind(nowIso(),phone).run(); await logAudit(env,phone,'admin_approve',tier); return json({ok:true,message:'Account approved.',phone,tier,plan_name:p.label,access_code:code}); }catch(e){return json({ok:false,error:safeError(e)},401);} }
async function adminRevoke(request, env) { try {await adminAuth(request,env);const b=await parseJson(request);const phone=normalizePhone(b.phone);const r=await env.DB.prepare('UPDATE accounts SET approved=0,session_hash=NULL,session_expires_at=NULL,updated_at=? WHERE phone=?').bind(nowIso(),phone).run();if(!r.meta?.changes) return json({ok:false,error:'Account not found.'},404);await logAudit(env,phone,'admin_revoke','access revoked');return json({ok:true,message:'Access revoked.'});}catch(e){return json({ok:false,error:safeError(e)},401);} }
async function adminTransfer(request, env){try{await adminAuth(request,env);const b=await parseJson(request);const phone=normalizePhone(b.phone);const r=await env.DB.prepare('UPDATE accounts SET device_id=NULL,session_hash=NULL,session_expires_at=NULL,updated_at=? WHERE phone=?').bind(nowIso(),phone).run();if(!r.meta?.changes)return json({ok:false,error:'Account not found.'},404);await logAudit(env,phone,'admin_transfer_device','device released');return json({ok:true,message:'Device binding cleared. The next login will bind the new device.'});}catch(e){return json({ok:false,error:safeError(e)},401);}}
async function adminRotateCode(request, env){try{await adminAuth(request,env);const b=await parseJson(request);const phone=normalizePhone(b.phone);const a=await getAccount(env,phone);if(!a)return json({ok:false,error:'Account not found.'},404);const code=String(Math.floor(10000000+Math.random()*90000000));await env.DB.prepare('UPDATE accounts SET access_code_hash=?,access_code_hint=?,updated_at=? WHERE phone=?').bind(await sha256(code),code,nowIso(),phone).run();await logAudit(env,phone,'admin_rotate_code','activation code rotated');return json({ok:true,message:'Activation code rotated.',access_code:code});}catch(e){return json({ok:false,error:safeError(e)},401);}}
async function adminStats(request, env){try{await adminAuth(request,env);const [u,p,r]=await Promise.all([env.DB.prepare('SELECT COUNT(*) n FROM accounts').first(),env.DB.prepare("SELECT COUNT(*) n FROM accounts WHERE approved=1").first(),env.DB.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='pending'").first()]);return json({ok:true,stats:{users:Number(u?.n||0),approved:Number(p?.n||0),pending_requests:Number(r?.n||0)}});}catch(e){return json({ok:false,error:safeError(e)},401);}}

async function adminAiCheck(request, env) {
  try {
    await adminAuth(request, env);
    const pingSystem = 'You are a health check. Reply with exactly one word.';
    const pingPrompt = 'Reply with only the word: OK';
    const providers = [
      { name:'anthropic', key:env.ANTHROPIC_API_KEY, label:'Claude (Anthropic)', run:() => callAnthropic(env.ANTHROPIC_API_KEY, String(env.ANTHROPIC_MODEL || 'claude-sonnet-5'), pingSystem, pingPrompt, 16) },
      { name:'gemini', key:env.GEMINI_API_KEY, label:'Gemini', run:() => callGemini(env.GEMINI_API_KEY, String(env.GEMINI_MODEL || 'gemini-3.8-flash'), pingSystem, pingPrompt, 256) },
      { name:'groq', key:env.GROQ_API_KEY, label:'Groq', run:() => callOpenAICompat('https://api.groq.com/openai/v1', env.GROQ_API_KEY, String(env.GROQ_MODEL || 'openai/gpt-oss-120b'), pingSystem, pingPrompt, 16, 'Groq') },
      { name:'openrouter_llama', key:env.OPENROUTER_API_KEY, label:'OpenRouter (Llama 3.3 70B)', run:() => callOpenAICompat('https://openrouter.ai/api/v1', env.OPENROUTER_API_KEY, String(env.OPENROUTER_LLAMA_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'), pingSystem, pingPrompt, 16, 'OpenRouter') },
      { name:'openrouter', key:env.OPENROUTER_API_KEY, label:'OpenRouter (free router)', run:() => callOpenAICompat('https://openrouter.ai/api/v1', env.OPENROUTER_API_KEY, String(env.OPENROUTER_MODEL || 'openrouter/free'), pingSystem, pingPrompt, 16, 'OpenRouter') },
    ];
    const results = {};
    for (const p of providers) {
      if (!p.key) { results[p.name] = { label:p.label, configured:false, ok:false, message:'No API key set for this provider.' }; continue; }
      try {
        const r = await p.run();
        results[p.name] = { label:p.label, configured:true, ok:true, model:r.model, sample:r.text.slice(0,60) };
      } catch (err) {
        results[p.name] = { label:p.label, configured:true, ok:false, error:(err instanceof Error ? err.message : String(err)).slice(0,300) };
      }
    }
    // Note: openrouter and openrouter_llama share one OPENROUTER_API_KEY — if it's set,
    // both rows will show, since one key unlocks both routes.
    const anyOk = Object.values(results).some(r => r.ok);
    return json({ ok:true, any_provider_working:anyOk, results, timestamp:nowIso() });
  } catch (e) { return json({ ok:false, error:safeError(e) }, 401); }
}

async function logAudit(env, phone, action, detail='') { await env.DB.prepare('INSERT INTO audit_log(phone,action,detail,created_at) VALUES (?,?,?,?)').bind(phone||null,action,String(detail).slice(0,2000),nowIso()).run(); }
