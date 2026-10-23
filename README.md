# Blog single-page com Supabase

Blog de página única: todos os posts em uma coluna contínua (mais recente primeiro), carregamento progressivo por rolagem e mensagem final **"Chegou ao fim do blog."**. Um único administrador cria, edita e exclui posts com um editor HTML e envia imagens.

- **Frontend:** HTML, CSS e JavaScript puro (módulos ES), sem build.
- **Servidor:** Node.js (`server.js`, sem framework) — serve os arquivos estáticos e gera `/config.js` com a configuração pública.
- **Backend:** Supabase (PostgreSQL + Auth + Storage). Não há API Express própria.
- **Dependências npm:** `@supabase/supabase-js` e `dompurify` (sanitização de HTML; leve, gratuita e mantida). São servidas localmente em `/vendor/`.

## Estrutura

```
public/            index.html, css/style.css, js/{main,supabase,auth,posts,editor,sanitize}.js, assets/end.svg
sql/               schema.sql, policies.sql, set_admin.sql, storage.sql
test/              server.test.js
server.js  package.json  .env.example  .gitignore
```

## Pré-requisitos

Node.js 18 ou superior, npm e uma conta gratuita no [Supabase](https://supabase.com).

## 1. Configurar o Supabase

1. Crie um projeto em *New project* e guarde a senha do banco.
2. Em **SQL Editor**, execute **nesta ordem**: `sql/schema.sql` e `sql/policies.sql`.
3. **Desabilite o cadastro público:** *Authentication → Sign In / Providers* (ou *Settings*) → desative **Allow new users to sign up**.
4. **Crie o administrador:** *Authentication → Users → Add user → Create new user*, informe e-mail e senha forte e marque *Auto Confirm User*. Copie o **UID** do usuário criado.
5. Edite `sql/set_admin.sql`, troque o UUID de exemplo pelo UID copiado e execute no SQL Editor. (Para trocar de administrador, repita o passo com outro UID.)
6. Execute `sql/storage.sql` (cria o bucket público `post-images`, limite de 2 MB, só imagens, e políticas de escrita restritas ao administrador).
7. Em *Project Settings → API*, copie a **Project URL** e a chave **anon** (legacy) ou **publishable** (`sb_publishable_…`).

> **Segurança:** apenas a chave anon/publishable vai ao navegador. **Nunca** use `service_role`/`secret` — o servidor se recusa a iniciar se detectar uma. Mesmo com a chave pública exposta, quem não é o administrador não consegue escrever: as políticas RLS comparam `auth.uid()` ao UID guardado em `private.app_config` (schema não exposto pela API), via a função `is_admin()`.

## 2. Executar localmente

```bash
npm install
cp .env.example .env     # preencha SUPABASE_URL e SUPABASE_ANON_KEY
npm start                # http://localhost:3000
```

| Variável | Uso |
|---|---|
| `PORT` | Porta do servidor (padrão 3000). |
| `SUPABASE_URL` | Pública. URL do projeto. |
| `SUPABASE_ANON_KEY` | Pública. Chave anon/publishable. |

## 3. Testes

Automatizados (servidor: arquivos, CSP, path traversal, métodos, recusa de chave privilegiada): `npm test`.

Checklist manual (com o app rodando):

| Item | Como validar | Esperado |
|---|---|---|
| Leitura pública | Abra em janela anônima | Posts visíveis, sem botões de admin |
| Rolagem contínua | Crie 25+ posts e role | Carrega de 10 em 10, sem repetição; mensagem final só após o último post |
| Blog vazio | Sem posts | "Ainda não há posts publicados." |
| Login/logout | Entrar com o admin; depois Sair | Botões "Novo post/Editar/Excluir" aparecem e somem |
| Login inválido | Senha errada | "E-mail ou senha incorretos." |
| Criar / editar / excluir | Use o painel | Lista recarrega; excluir pede confirmação; "Atualizado em" aparece após editar |
| Upload | Envie PNG/JPEG < 2 MB | `<img>` inserido; arquivo aparece em Storage → post-images |
| Upload inválido | Envie PDF ou arquivo > 2 MB | Mensagem de erro, nada enviado |
| URL externa | Informe `https://…/foto.jpg` | Imagem inserida; URL `http://` ou `javascript:` é recusada |
| Imagem quebrada | URL inexistente | Caixa com texto alternativo, layout intacto |
| Sanitização | Cole no HTML: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">x</a>` | Nada executa; tags/atributos perigosos removidos na visualização e no blog |
| RLS direta | No console anônimo: `await supabase.from('posts').insert({title:'x',body:'y'})` (ou via REST com a anon key) | Erro de política RLS / nenhuma linha afetada |
| RLS com outro usuário | Crie um segundo usuário e tente escrever | Negado (não é o UID do admin) |
| Datas | Compare com o horário de Brasília | Exibidas em pt-BR, fuso `America/Sao_Paulo` (constante `TZ` em `posts.js`) |

## 4. Implantação gratuita

O app é um servidor Node comum: serve em qualquer plataforma com plano gratuito para Node.js (por exemplo Render, Railway ou Fly.io — **confira os termos atuais de cada uma**, pois planos gratuitos mudam). Configuração típica: repositório no GitHub, *Build command* `npm install`, *Start command* `npm start`, e as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` no painel (a `PORT` costuma ser definida pela plataforma).

### Limites e ressalvas dos planos gratuitos

Verificados em fontes públicas em out/2026; **confirme em [supabase.com/pricing](https://supabase.com/pricing)** antes de depender deles:

- Supabase Free: 500 MB de banco, 5 GB de egress, 50 mil usuários ativos/mês, 2 projetos ativos. Armazenamento de arquivos: as fontes divergem (500 MB a 1 GB) — por isso o projeto limita cada imagem a 2 MB e redimensiona imagens acima de 1600 px no navegador.
- **Projetos gratuitos são pausados após ~7 dias sem atividade.** Se o blog parar de carregar, abra o painel do Supabase e use *Restore project*; os dados são mantidos.
- Hospedagens gratuitas de Node podem "dormir" após inatividade: a primeira visita pode demorar dezenas de segundos.
- Limites do Supabase podem mudar; o código não assume cotas ilimitadas.

## 5. Decisões de design

- **Sem duplicatas/omissões:** paginação por cursor `(created_at, id)` com índice dedicado; busca `limite + 1` para saber com certeza se acabaram os posts. A mensagem final só aparece quando isso é confirmado.
- **Datas no banco:** trigger `set_post_timestamps` define `created_at`/`updated_at` e impede alterar `created_at`.
- **Sanitização:** DOMPurify com lista branca (h1–h3, p, b, strong, i, em, mark, ul, ol, li, a, blockquote, img, br), só URLs `http(s)`/`mailto`, links com `rel="noopener noreferrer"`. O botão "Negrito" insere `<strong>` e "Itálico" insere `<em>`; `<b>` e `<i>` digitados no HTML também são aceitos.
- **CSP restrita** enviada pelo servidor (scripts e estilos apenas do próprio domínio; conexões apenas ao seu projeto Supabase; imagens de `https:` para permitir URLs externas).
- Os botões de admin ficam ocultos por CSS, mas isso é só visual: a proteção real é o RLS.

## 6. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Servidor não inicia: "Defina SUPABASE_URL…" | Falta o `.env` ou as variáveis na hospedagem. |
| "Configuração do Supabase ausente" na página | `/vendor/supabase.js` não carregou: rode `npm install`. |
| Posts não carregam / "indisponível" | Projeto pausado (restaure no painel) ou sem rede. |
| Login funciona mas não aparece "Novo post" | `set_admin.sql` não foi executado ou o UID está errado (`select * from private.app_config;`). |
| "Você não tem permissão" ao salvar | Usuário logado não é o admin cadastrado, ou `policies.sql` não foi aplicado. |
| Upload falha | Arquivo > 2 MB, tipo não permitido, ou `storage.sql` não foi executado. |
| "Sua sessão expirou" | O token venceu e não renovou; entre novamente. |
| Imagem externa não aparece | O site de origem bloqueia hotlink ou não usa `https`. |
