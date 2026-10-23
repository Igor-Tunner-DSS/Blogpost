import { configured } from './supabase.js';
import { initAuth } from './auth.js';
import { initFeed, reloadFeed } from './posts.js';
import { initEditor, openEditor } from './editor.js';

if (!configured) {
  document.querySelector('#error-text').textContent =
    'Configuração do Supabase ausente. Verifique SUPABASE_URL e SUPABASE_ANON_KEY no servidor.';
  document.querySelector('#error').hidden = false;
  document.querySelector('#retry').hidden = true;
} else {
  initAuth();
  initFeed({ onEdit: (id) => openEditor(id) });
  initEditor({ onSaved: reloadFeed });
  reloadFeed();
}
