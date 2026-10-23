import { sb, friendlyError, isExpired } from './supabase.js';
import { sanitize } from './sanitize.js';
import { forceSignOut } from './auth.js';

const PAGE_SIZE = 10;
const TZ = 'America/Sao_Paulo';
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: TZ });
const $ = (s) => document.querySelector(s);

const state = { cursor: null, done: false, loading: false, errored: false, gen: 0, count: 0 };
const els = {};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function renderPost(p) {
  const art = el('article', 'post');
  art.dataset.id = p.id;
  art.append(el('h2', null, p.title));
  if (p.subtitle) art.append(el('p', 'subtitle', p.subtitle));

  const meta = el('p', 'meta');
  const created = el('span'); created.append('Publicado em ');
  const t = el('time', null, dateFmt.format(new Date(p.created_at))); t.dateTime = p.created_at;
  created.append(t); meta.append(created);
  if (new Date(p.updated_at) - new Date(p.created_at) > 1000) {
    const upd = el('span'); upd.append('Atualizado em ');
    const t2 = el('time', null, dateFmt.format(new Date(p.updated_at))); t2.dateTime = p.updated_at;
    upd.append(t2); meta.append(upd);
  }
  art.append(meta);

  const body = el('div', 'post-body');
  body.innerHTML = sanitize(p.body);
  art.append(body);

  const actions = el('div', 'post-actions admin-only');
  const edit = el('button', 'btn', 'Editar'); edit.type = 'button'; edit.dataset.action = 'edit';
  const del = el('button', 'btn danger', 'Excluir'); del.type = 'button'; del.dataset.action = 'delete';
  actions.append(edit, del);
  art.append(actions);
  return art;
}

function setStatus({ loading = false, error = '', empty = false, end = false }) {
  els.loading.hidden = !loading;
  els.error.hidden = !error;
  if (error) els.errorText.textContent = error;
  els.empty.hidden = !empty;
  els.end.hidden = !end;
}

async function loadMore() {
  if (state.loading || state.done || state.errored) return;
  const gen = state.gen;
  state.loading = true;
  setStatus({ loading: true });
  try {
    let q = sb.from('posts')
      .select('id, created_at, updated_at, title, subtitle, body')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1); // +1 revela se há mais registros sem consulta extra
    if (state.cursor) {
      const { t, id } = state.cursor;
      q = q.or(`created_at.lt."${t}",and(created_at.eq."${t}",id.lt.${id})`);
    }
    const { data, error } = await q;
    if (gen !== state.gen) return;
    if (error) throw error;

    const rows = data.slice(0, PAGE_SIZE);
    state.done = data.length <= PAGE_SIZE;
    const frag = document.createDocumentFragment();
    rows.forEach((p) => frag.append(renderPost(p)));
    els.feed.append(frag);
    state.count += rows.length;
    if (rows.length) state.cursor = { t: rows.at(-1).created_at, id: rows.at(-1).id };
    state.loading = false;
    setStatus({ empty: state.done && state.count === 0, end: state.done && state.count > 0 });
    if (!state.done) requestAnimationFrame(fillViewport);
  } catch (e) {
    if (gen !== state.gen) return;
    state.errored = true;
    state.loading = false;
    setStatus({ error: friendlyError(e) });
  }
}

// O IntersectionObserver só dispara em mudanças; se a página ainda não enche a tela, continua carregando.
function fillViewport() {
  if (!state.done && !state.loading && !state.errored &&
      els.sentinel.getBoundingClientRect().top < window.innerHeight + 800) loadMore();
}

export async function reloadFeed() {
  Object.assign(state, { cursor: null, done: false, loading: false, errored: false, count: 0 });
  state.gen++;
  els.feed.replaceChildren();
  setStatus({});
  await loadMore();
}

export function initFeed({ onEdit }) {
  Object.assign(els, {
    feed: $('#feed'), sentinel: $('#sentinel'), loading: $('#loading'), error: $('#error'),
    errorText: $('#error-text'), empty: $('#empty'), end: $('#end'),
  });
  new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '800px 0px' })
    .observe(els.sentinel);

  $('#retry').addEventListener('click', () => { state.errored = false; loadMore(); });

  els.feed.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') { e.target.classList.add('img-failed'); if (!e.target.alt) e.target.alt = 'Imagem indisponível'; }
  }, true);

  els.feed.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const art = btn.closest('.post');
    if (btn.dataset.action === 'edit') return onEdit(art.dataset.id);
    const title = art.querySelector('h2').textContent;
    if (!window.confirm(`Excluir o post "${title}"? Esta ação não pode ser desfeita.`)) return;
    btn.disabled = true;
    try {
      await deletePost(art.dataset.id);
      await reloadFeed();
    } catch (ex) {
      btn.disabled = false;
      window.alert(friendlyError(ex));
      if (isExpired(ex)) forceSignOut();
    }
  });
}

/* ---- Operações administrativas (a autorização real é feita pelas políticas RLS) ---- */
const denied = () => Object.assign(new Error('Operação não permitida.'), { code: '42501' });

export async function getPost(id) {
  const { data, error } = await sb.from('posts').select('id, title, subtitle, body').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function savePost({ id, title, subtitle, body }) {
  const row = { title: title.trim(), subtitle: subtitle.trim() || null, body };
  const q = id ? sb.from('posts').update(row).eq('id', id) : sb.from('posts').insert(row);
  const { data, error } = await q.select('id');
  if (error) throw error;
  if (!data?.length) throw denied(); // RLS filtra silenciosamente: 0 linhas = negado
}

export async function deletePost(id) {
  const { data, error } = await sb.from('posts').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw denied();
}
