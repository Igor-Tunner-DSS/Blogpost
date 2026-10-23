import { sb, friendlyError } from './supabase.js';

const $ = (s) => document.querySelector(s);

async function applySession(session) {
  let admin = false;
  if (session) {
    const { data, error } = await sb.rpc('is_admin'); // verificação feita pelo banco; só controla a UI
    admin = !error && data === true;
  }
  document.body.dataset.signedIn = String(Boolean(session));
  document.body.dataset.admin = String(admin);
}

export async function forceSignOut() {
  try { await sb.auth.signOut(); } catch { /* ignora */ }
  await applySession(null);
}

export function initAuth() {
  const dlg = $('#login-dialog'), form = $('#login-form'), err = $('#login-error');

  $('#btn-login').addEventListener('click', () => { err.textContent = ''; form.reset(); dlg.showModal(); });
  $('#login-cancel').addEventListener('click', () => dlg.close());
  $('#btn-logout').addEventListener('click', forceSignOut);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: form.email.value.trim(), password: form.password.value,
      });
      if (error) { err.textContent = error.status === 400 ? 'E-mail ou senha incorretos.' : friendlyError(error); return; }
      form.reset();
      dlg.close();
    } catch (ex) {
      err.textContent = friendlyError(ex);
    } finally {
      btn.disabled = false;
    }
  });

  // Não chamar o Supabase dentro do callback (risco de deadlock): adia com setTimeout.
  sb.auth.onAuthStateChange((_event, session) => setTimeout(() => applySession(session), 0));
}
