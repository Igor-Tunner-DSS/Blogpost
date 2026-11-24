# Blog single-page com Supabase

Blog de página única: todos os posts em uma coluna contínua (mais recente primeiro), carregamento progressivo por rolagem e mensagem final **"Chegou ao fim do blog."**. Um único administrador cria, edita e exclui posts com um editor HTML e envia imagens.

- **Frontend:** HTML, CSS e JavaScript puro (módulos ES), sem build.
- **Servidor:** Node.js com [Express](https://expressjs.com/) (`server.js`) — serve os arquivos estáticos, gera `/config.js` com a configuração pública, expõe `/healthz` e aplica os cabeçalhos de segurança (CSP etc.) por middleware.
- **Backend:** Supabase (PostgreSQL + Auth + Storage).
- **Dependências npm:** `express` (servidor HTTP), `@supabase/supabase-js` e `dompurify` (sanitização de HTML; leve, gratuita e mantida). As duas últimas são servidas localmente em `/vendor/`.

## Estrutura

```
public/            index.html, css/style.css, js/{main,supabase,auth,posts,editor,sanitize}.js, assets/end.svg
sql/               schema.sql, policies.sql, set_admin.sql, storage.sql
test/              server.test.js
server.js  package.json  .env.example  .gitignore
```
