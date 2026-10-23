const env = window.__ENV__ || {};
export const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && window.supabase);

export const sb = configured
  ? window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export const BUCKET = 'post-images';
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // deve coincidir com sql/storage.sql
export const MAX_IMAGE_WIDTH = 1600;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function isExpired(e) {
  return e?.code === 'PGRST301' || e?.code === 'PGRST303' || /jwt expired/i.test(e?.message || '');
}

export function friendlyError(e) {
  const msg = e?.message || '';
  if (isExpired(e)) return 'Sua sessão expirou. Entre novamente.';
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.';
  }
  if (e?.code === '42501' || e?.status === 401 || e?.status === 403) return 'Você não tem permissão para esta operação.';
  if (e?.status >= 500 || /paused|unavailable|timeout/i.test(msg)) {
    return 'O Supabase está indisponível no momento. No plano gratuito, o projeto pode estar pausado por inatividade.';
  }
  return msg ? `Erro: ${msg}` : 'Ocorreu um erro inesperado.';
}
