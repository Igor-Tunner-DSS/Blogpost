'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/supabase.js': path.join(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  '/vendor/purify.min.js': path.join(__dirname, 'node_modules/dompurify/dist/purify.min.js'),
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

function createApp(env = process.env) {
  const cfg = validateEnv(env);
  const configJs = 'window.__ENV__=' +
    JSON.stringify({ SUPABASE_URL: cfg.url, SUPABASE_ANON_KEY: cfg.key }).replace(/</g, '\\u003c') + ';';
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self'",
    "img-src 'self' https:", `connect-src 'self' ${cfg.url}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');

  const app = express();
  app.disable('x-powered-by');

  // Cabeçalhos de segurança em todas as respostas (inclusive erros).
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  // Somente leitura: o frontend fala direto com o Supabase.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    res.set('Allow', 'GET, HEAD').status(405).type('text/plain').send('Método não permitido');
  });

  app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

  app.get('/config.js', (req, res) => {
    res.set('Cache-Control', 'no-cache').type('text/javascript').send(configJs);
  });

  for (const [route, file] of Object.entries(VENDOR)) {
    app.get(route, (req, res, next) => {
      res.sendFile(file, { maxAge: '1d', dotfiles: 'allow' }, (err) => err && next(err));
    });
  }

  // Arquivos estáticos de public/ (index.html em '/'; bloqueia path traversal e dotfiles).
  app.use(express.static(PUBLIC_DIR, {
    maxAge: '5m',
    fallthrough: false, // repassa 400/403/404 ao handler de erro em vez de virar 404
    redirect: false,
    setHeaders: (res, file) => {
      if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache');
    },
  }));

  app.use((req, res) => res.status(404).type('text/plain').send('Não encontrado'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const msg = { 400: 'Requisição inválida', 403: 'Acesso negado', 404: 'Não encontrado' }[status] || 'Erro interno';
    if (res.headersSent) return res.destroy();
    res.status(status >= 400 && status < 600 ? status : 500).type('text/plain').send(msg);
  });

  return app;
}

function createServer(env = process.env) {
  return http.createServer(createApp(env));
}

module.exports = { createApp, createServer, validateEnv };

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
