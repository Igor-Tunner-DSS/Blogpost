const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'b', 'strong', 'i', 'em', 'mark', 'ul', 'ol', 'li', 'a', 'blockquote', 'img', 'br'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'width', 'height'];
let hooked = false;

function escapeText(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function sanitize(html) {
  const input = String(html ?? '');
  const P = window.DOMPurify;
  if (!P || !P.isSupported) return escapeText(input); // falha fechada: nunca renderiza HTML sem sanitizar
  if (!hooked) {
    hooked = true;
    P.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.tagName === 'IMG') {
        // DOMPurify permite data: em <img> por padrão; aqui só aceitamos http(s).
        if (node.hasAttribute('src') && !/^https?:/i.test(node.getAttribute('src').trim())) node.removeAttribute('src');
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
        node.setAttribute('referrerpolicy', 'no-referrer');
      }
    });
  }
  return P.sanitize(input, {
    ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}
