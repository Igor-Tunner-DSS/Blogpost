'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createServer, validateEnv } = require('../server');

const ENV = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test' };
let server, base, port;
before(async () => {
  server = createServer(ENV);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port; base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

const raw = (path, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ host: '127.0.0.1', port, path, method }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
  }).on('error', reject).end();
});

test('serve index.html com CSP', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await r.text(), /Chegou ao fim do blog\./);
});
test('/config.js expõe só URL e chave pública', async () => {
  const t = await (await fetch(base + '/config.js')).text();
  assert.match(t, /abc\.supabase\.co/); assert.doesNotMatch(t, /service_role/);
});
test('bibliotecas vendorizadas disponíveis', async () => {
  for (const p of ['/vendor/supabase.js', '/vendor/purify.min.js']) assert.strictEqual((await fetch(base + p)).status, 200, p);
});
test('bloqueia path traversal e arquivos fora de public', async () => {
  for (const p of ['/%2e%2e/package.json', '/..%2fpackage.json', '/..%2f.env', '/.env', '/../server.js']) {
    const r = await raw(p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.doesNotMatch(r.body, /blog-single-page|createServer/);
  }
  assert.strictEqual((await raw('/..%2fpackage.json')).status, 403);
});
test('métodos de escrita são rejeitados', async () => {
  assert.strictEqual((await raw('/', 'POST')).status, 405);
});
test('recusa chaves privilegiadas', () => {
  const jwt = (role) => 'x.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.y';
  assert.throws(() => validateEnv({ ...ENV, SUPABASE_ANON_KEY: jwt('service_role') }));
  assert.throws(() => validateEnv({ ...ENV, SUPABASE_ANON_KEY: 'sb_secret_abc' }));
  assert.doesNotThrow(() => validateEnv({ ...ENV, SUPABASE_ANON_KEY: jwt('anon') }));
  assert.throws(() => validateEnv({}));
});
