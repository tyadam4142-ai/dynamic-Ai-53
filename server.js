import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import worker from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Initialize SQLite database
const dbPath = path.join(__dirname, 'dynamic-ai-53.sqlite');
let db;
try {
  db = new DatabaseSync(dbPath);
} catch (err) {
  console.warn('[Dynamic AI 53] Could not create file-based SQLite, falling back to in-memory:', err.message);
  db = new DatabaseSync(':memory:');
}

// Execute schema
try {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }
} catch (err) {
  console.error('[Dynamic AI 53] Schema setup error:', err);
}

// Seed default approved test account if not exists
try {
  const existing = db.prepare('SELECT phone FROM accounts WHERE phone = ?').get('+919876543210');
  const now = new Date().toISOString();
  const d = new Date();
  // Credits reset daily now, so the seeded row's period key must be a day (not a month)
  // or the worker will treat it as stale on the very first request — harmless here since
  // it resets to the same 150000, but keeping it correct avoids confusion when reading the DB.
  const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const codeHash = 'XxPAWuFaufp8bECE_1hSm51CGFYZP7gEiITbl0Bvyww';

  if (!existing) {
    db.prepare(`
      INSERT INTO accounts (phone, tier, approved, access_code_hash, access_code_hint, monthly_tokens, remaining_tokens, month_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('+919876543210', 'silver', 1, codeHash, '53535353', 150000, 150000, dayKey, now, now);
    console.log('[Dynamic AI 53] Pre-seeded demo account: +919876543210 with activation code: 53535353');
  } else {
    // Reset device binding so new sessions can sign in without lock
    db.prepare('UPDATE accounts SET device_id = NULL, session_hash = NULL, updated_at = ? WHERE phone = ?').run(now, '+919876543210');
  }
} catch (seedErr) {
  console.warn('[Dynamic AI 53] Seed account notice:', seedErr.message);
}

// Cloudflare D1 adapter
const d1 = {
  prepare(sql) {
    const stmt = db.prepare(sql);
    let bound = [];
    const wrapper = {
      bind(...args) {
        bound = args;
        return wrapper;
      },
      async first() {
        const row = stmt.get(...bound);
        return row ?? null;
      },
      async all() {
        const rows = stmt.all(...bound);
        return { results: rows };
      },
      async run() {
        const res = stmt.run(...bound);
        return {
          meta: {
            changes: res.changes,
            last_row_id: Number(res.lastInsertRowid)
          }
        };
      }
    };
    return wrapper;
  }
};

function resolveModel(envVal, fallback, invalidKeywords = []) {
  const val = (envVal || '').trim();
  if (!val) return fallback;
  // If the user inadvertently pasted a key or a non-model string (e.g. "openrouter", "Llama 3.3", or an API key)
  if (val.length > 40 || invalidKeywords.some(kw => val.toLowerCase() === kw.toLowerCase())) {
    return fallback;
  }
  return val;
}

// Worker Environment getter
function getEnv() {
  return {
    DB: d1,
    CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
    ADMIN_SECRET: (process.env.ADMIN_SECRET || 'dynamic-ai-admin-secret').trim(),
    GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
    GEMINI_MODEL: resolveModel(process.env.GEMINI_MODEL, 'gemini-3.8-flash', ['gemini', 'gemini-model']),
    ANTHROPIC_API_KEY: (process.env.ANTHROPIC_API_KEY || '').trim(),
    ANTHROPIC_MODEL: resolveModel(process.env.ANTHROPIC_MODEL, 'claude-3-5-sonnet-20241022', ['claude', 'anthropic', 'fable 5.1']),
    GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
    GROQ_MODEL: resolveModel(process.env.GROQ_MODEL, 'openai/gpt-oss-120b', ['llama', 'llama 3.3', 'groq']),
    OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY || '').trim(),
    OPENROUTER_MODEL: resolveModel(process.env.OPENROUTER_MODEL, 'openrouter/auto', ['openrouter', 'free', 'openrouter/free']),
    OPENROUTER_LLAMA_MODEL: resolveModel(process.env.OPENROUTER_LLAMA_MODEL, 'openrouter/auto', ['llama', 'llama 3.3', 'meta-llama/llama-3.3-70b-instruct:free']),
    GITHUB_TOKEN: (process.env.GITHUB_TOKEN || '').trim(),
    GITHUB_ALLOWED_REPOS: process.env.GITHUB_ALLOWED_REPOS || '',
    OWNER_WHATSAPP: process.env.OWNER_WHATSAPP || '',
    WHATSAPP_ACCESS_TOKEN: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v23.0',
    ASSETS: {
      async fetch(req) {
        return new Response('Not found', { status: 404 });
      }
    }
  };
}

const app = express();

// Universal CORS headers for web preview and custom domains
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DA53-Admin-Secret');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Serve static assets from public/
app.use(express.static(publicDir));

// Direct admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// API middleware: capture raw body for WHATWG Request
app.use('/api', express.raw({ type: '*/*', limit: '10mb' }));

// Forward all /api requests to worker
app.use('/api', async (req, res, next) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || '127.0.0.1:3000';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          for (const v of val) headers.append(key, v);
        } else {
          headers.set(key, val);
        }
      }
    }

    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && req.body.length > 0) {
      init.body = req.body;
      init.duplex = 'half';
    }

    const webReq = new Request(url, init);
    const webRes = await worker.fetch(webReq, getEnv(), {});

    res.status(webRes.status);
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await webRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    next(err);
  }
});

// Fallback to index.html for SPA/root
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

console.log('[Dynamic AI 53] GEMINI_API_KEY length:', (process.env.GEMINI_API_KEY || '').length, 'prefix:', (process.env.GEMINI_API_KEY || '').slice(0, 10));

app.listen(PORT, HOST, () => {
  console.log(`[Dynamic AI 53] Server listening on http://${HOST}:${PORT}`);
});
