'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/supabase.js': path.join(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  '/vendor/purify.min.js': path.join(__dirname, 'node_modules/dompurify/dist/purify.min.js'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function validateEnv(env) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (veja .env.example).');
  let origin;
  try { origin = new URL(url); } catch { throw new Error('SUPABASE_URL inválida.'); }
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    throw new Error('SUPABASE_URL deve usar https.');
  }
  let privileged = key.startsWith('sb_secret_');
  const parts = key.split('.');
  if (parts.length === 3) {
    try { privileged = privileged || JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'service_role'; } catch { /* ignora */ }
  }
  if (privileged) throw new Error('SUPABASE_ANON_KEY contém uma chave privilegiada (service_role/secret). Use apenas a chave anon/publishable.');
  return { url: origin.origin, key };
}

function createServer(env = process.env) {
  const cfg = validateEnv(env);
  const configJs = 'window.__ENV__=' +
    JSON.stringify({ SUPABASE_URL: cfg.url, SUPABASE_ANON_KEY: cfg.key }).replace(/</g, '\\u003c') + ';';
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self'",
    "img-src 'self' https:", `connect-src 'self' ${cfg.url}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');

  const baseHeaders = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  const send = (res, code, body, extra = {}) => {
    res.writeHead(code, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
    res.end(body);
  };

  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido', { Allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return send(res, 400, 'Requisição inválida'); }
    if (pathname.includes('\0')) return send(res, 400, 'Requisição inválida');

    if (pathname === '/healthz') return send(res, 200, 'ok');
    if (pathname === '/config.js') {
      return send(res, 200, req.method === 'HEAD' ? '' : configJs,
        { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    }

    let file = VENDOR[pathname];
    let cache = 'public, max-age=86400';
    if (!file) {
      if (pathname.endsWith('/')) pathname += 'index.html';
      file = path.join(PUBLIC_DIR, pathname);
      if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Acesso negado');
      cache = pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=300';
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'Não encontrado');
      res.writeHead(200, {
        ...baseHeaders, 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': cache,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  });
}

module.exports = { createServer, validateEnv };

if (require.main === module) {
  loadDotEnv(path.join(__dirname, '.env'));
  try {
    const port = Number(process.env.PORT) || 3000;
    createServer().listen(port, () => console.log(`Blog disponível em http://localhost:${port}`));
  } catch (e) {
    console.error('Erro de configuração:', e.message);
    process.exit(1);
  }
}
