import { sb, BUCKET, MAX_UPLOAD_BYTES, MAX_IMAGE_WIDTH, ALLOWED_TYPES, friendlyError, isExpired } from './supabase.js';
import { sanitize } from './sanitize.js';
import { getPost, savePost } from './posts.js';
import { forceSignOut } from './auth.js';

const $ = (s) => document.querySelector(s);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const attr = (s) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
let currentId = null;
let onSaved = () => {};
let ta, dlg, form, err;

function wrap(open, close, placeholder) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  const inner = ta.value.slice(s, e) || placeholder;
  ta.setRangeText(open + inner + close, s, e, 'end');
  ta.setSelectionRange(s + open.length, s + open.length + inner.length);
  ta.focus();
}

function list(tag) {
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || 'Item';
  const items = sel.split('\n').filter((l) => l.trim()).map((l) => `  <li>${l.trim()}</li>`).join('\n');
  wrap(`<${tag}>\n`, `\n</${tag}>`, items);
}

function command(cmd) {
  switch (cmd) {
    case 'h1': case 'h2': case 'h3': case 'p': case 'strong': case 'em': case 'mark': case 'blockquote':
      return wrap(`<${cmd}>`, `</${cmd}>`, 'texto');
    case 'ul': case 'ol': return list(cmd);
    case 'a': {
      const url = window.prompt('Endereço do link (https://… ou mailto:…)');
      if (!url) return;
      if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) return window.alert('Use um endereço que comece com https://, http:// ou mailto:.');
      return wrap(`<a href="${attr(url.trim())}">`, '</a>', 'texto do link');
    }
    case 'img': return openImageDialog();
  }
}

function setTab(preview) {
  $('#tab-html').setAttribute('aria-selected', String(!preview));
  $('#tab-preview').setAttribute('aria-selected', String(preview));
  ta.hidden = preview;
  $('#ed-preview').hidden = !preview;
  if (preview) $('#ed-preview').innerHTML = sanitize(ta.value); // mesma sanitização do blog público
}

/* ---- Imagens ---- */
async function prepare(file) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Formato não permitido. Use JPEG, PNG, WebP ou GIF.');
  let blob = file, type = file.type;
  if (type !== 'image/gif') {
    try {
      const bmp = await createImageBitmap(file);
      if (bmp.width > MAX_IMAGE_WIDTH) {
        const c = document.createElement('canvas');
        c.width = MAX_IMAGE_WIDTH; c.height = Math.round((bmp.height * MAX_IMAGE_WIDTH) / bmp.width);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const out = await new Promise((r) => c.toBlob(r, 'image/webp', 0.85));
        if (out && out.type === 'image/webp' && out.size < file.size) { blob = out; type = 'image/webp'; }
      }
      bmp.close?.();
    } catch { /* usa o original */ }
  }
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`A imagem tem mais de ${MAX_UPLOAD_BYTES / 1048576} MB. Reduza o arquivo e tente novamente.`);
  return { blob, type };
}

async function uploadImage(file) {
  const { blob, type } = await prepare(file);
  const path = `${crypto.randomUUID()}.${EXT[type]}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function openImageDialog() {
  $('#image-form').reset(); $('#img-error').textContent = '';
  $('#image-dialog').showModal();
}

function initImageDialog() {
  const idlg = $('#image-dialog'), iform = $('#image-form'), ierr = $('#img-error');
  $('#img-cancel').addEventListener('click', () => idlg.close());
  iform.addEventListener('submit', async (e) => {
    e.preventDefault(); ierr.textContent = '';
    const file = $('#img-file').files[0], url = $('#img-url').value.trim(), alt = $('#img-alt').value.trim();
    const btn = $('#img-insert'); btn.disabled = true;
    try {
      let src;
      if (file) src = await uploadImage(file);
      else if (/^https:\/\//i.test(url)) src = url;
      else throw new Error('Escolha um arquivo ou informe uma URL https:// válida.');
      const tag = `<img src="${attr(src)}" alt="${attr(alt)}">`;
      ta.setRangeText(tag, ta.selectionStart, ta.selectionEnd, 'end');
      idlg.close(); ta.focus();
    } catch (ex) {
      ierr.textContent = friendlyError(ex);
      if (isExpired(ex)) forceSignOut();
    } finally { btn.disabled = false; }
  });
}

/* ---- Abertura e salvamento ---- */
export async function openEditor(id = null) {
  currentId = id; form.reset(); err.textContent = ''; setTab(false);
  $('#ed-heading').textContent = id ? 'Editar post' : 'Novo post';
  if (id) {
    try {
      const p = await getPost(id);
      $('#ed-title').value = p.title; $('#ed-subtitle').value = p.subtitle || ''; ta.value = p.body;
    } catch (e) { window.alert(friendlyError(e)); return; }
  }
  dlg.showModal();
}

export function initEditor(opts) {
  onSaved = opts.onSaved;
  ta = $('#ed-body'); dlg = $('#editor-dialog'); form = $('#editor-form'); err = $('#ed-error');

  $('#btn-new').addEventListener('click', () => openEditor(null));
  $('#ed-cancel').addEventListener('click', () => dlg.close());
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => { setTab(false); command(b.dataset.cmd); }));
  $('#tab-html').addEventListener('click', () => setTab(false));
  $('#tab-preview').addEventListener('click', () => setTab(true));
  initImageDialog();

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const title = $('#ed-title').value, body = ta.value;
    if (!title.trim()) { err.textContent = 'Informe o título.'; return; }
    if (!sanitize(body).trim()) { err.textContent = 'O conteúdo está vazio ou só contém HTML não permitido.'; return; }
    const btn = $('#ed-save'); btn.disabled = true;
    try {
      await savePost({ id: currentId, title, subtitle: $('#ed-subtitle').value, body });
      dlg.close();
      await onSaved();
    } catch (ex) {
      err.textContent = friendlyError(ex);
      if (isExpired(ex)) forceSignOut();
    } finally { btn.disabled = false; }
  });
}
