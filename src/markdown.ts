import { Marked, type Tokens } from "marked";

// Posts are Markdown written by the author. Raw HTML in them is shown as text,
// links are limited to safe schemes, and images only load from this site
// (the CSP's img-src 'self' would block anything else anyway).

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (h.startsWith("#")) return h;
  return null;
}

function safeImageSrc(href: string): string | null {
  const h = href.trim();
  return h.startsWith("/media/") ? h : null;
}

const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (!safe) return inner;
      const external = /^https?:/i.test(safe);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      const rel = external ? ` rel="noopener noreferrer"` : "";
      return `<a href="${escapeHtml(safe)}"${titleAttr}${rel}>${inner}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const src = safeImageSrc(href);
      if (!src) return escapeHtml(text);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}
