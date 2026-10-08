// Contact and privacy pages. The name is SITE_AUTHOR; mail to the address reaches the author.

export const CONTACT_EMAIL = "contact@sstrabe.dev";

export const contact = (author: string) => `# Contact

This blog is written by ${author}. Write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) about anything on it, including to have a comment of yours removed.
`;

export const privacy = (author: string) => `# Privacy

This blog collects as little as it can. This page says what is processed, why, and for how long.

## Who is responsible

${author}, [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).

## Hosting

The blog runs on Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA). Cloudflare processes connection data such as your IP address to deliver pages and to protect the site from attacks. The blog itself does not store IP addresses. Legal basis: Art. 6 (1) (f) GDPR, our interest in a secure, working website. Cloudflare is certified under the EU-US Data Privacy Framework.

## Cookies

Readers get no cookies, except a \`theme\` cookie if you choose light or dark mode, which only stores that choice. The author's sign-in uses a session cookie on the admin pages.

## Comments

When you comment, the blog stores the name you enter, your comment and the time. Nothing else: no IP address, email address or browser details. Comments are published only after review. Legal basis: Art. 6 (1) (a) GDPR, your consent by submitting the form. To have a comment removed, write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).

## Spam protection with Cloudflare Turnstile

The comment form uses Cloudflare Turnstile to tell people from bots. Turnstile processes data such as your IP address and browser properties when the form loads and when you submit it. Legal basis: Art. 6 (1) (f) GDPR, our interest in keeping spam off the site. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

## Your rights

You have the right to access, rectification, erasure, restriction of processing, data portability and objection, and to complain to a data protection supervisory authority.
`;
