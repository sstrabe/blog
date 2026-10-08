# blog.sstrabe.dev

One Cloudflare Worker with server-rendered pages, posts and comments in D1, images in R2, author sign-in through Heimdall, and anonymous comments behind Turnstile and pre-moderation.

Plan and decisions: [Blog architecture plan](https://claude.ai/code/artifact/68dc3de5-97a0-4e8e-a208-f4b52eb2d31c).

## How it fits together

| Route | Who | Gate |
| --- | --- | --- |
| `GET /`, `/posts/:slug`, `/feed.xml`, `/impressum`, `/privacy` | Anyone | None |
| `POST /api/comments` | Anyone | Honeypot, length and link checks, rate limit binding, Turnstile; stored as pending |
| `/auth/login`, `/auth/callback`, `/auth/logout` | Author | OIDC with Heimdall (code flow + PKCE) |
| `/admin/*` | Author | `__Host-blog_session` + same Origin + CSRF token on every write |
| `GET /api/admin/pending-count` | VPS notifier | `Authorization: Bearer $NOTIFY_TOKEN` |
| `/media/:key` | Anyone | Images from R2, type sniffed at upload, served with a sandbox CSP |

Security rules that the code relies on (keep them when changing things):

- Comments are plain text, escaped on output, never Markdown or HTML, and links in them aren't clickable.
- Post Markdown shows raw HTML as text, allows only `http(s)`, `mailto`, relative and `#` links, and only `/media/` images.
- No inline script or style anywhere; the CSP in `src/security.ts` forbids it.
- Nothing about commenters is stored beyond name, text and time. No IP addresses.
- Every `*.sstrabe.dev` name is one site to the browser, so SameSite doesn't protect admin writes: they also need the `Origin` check and the CSRF token.

## One-time setup

1. **Heimdall app.** In Heimdall's developer portal, register an external app:
   - Client ID `blog`, confidential, standard flow only, PKCE S256.
   - Redirect URI `https://blog.sstrabe.dev/auth/callback`, post-logout redirect `https://blog.sstrabe.dev/`.
   - A client role `author`, granted to you, with the client-roles mapper set to add roles to the ID token.
   - Put the realm's issuer URL into `OIDC_ISSUER` in `wrangler.jsonc` (replace `REALM`).
2. **Cloudflare resources.**
   ```sh
   npx wrangler d1 create blog          # put the database_id into wrangler.jsonc
   npx wrangler r2 bucket create blog-media
   ```
3. **Turnstile.** Create a managed widget for `blog.sstrabe.dev`; put its site key into `TURNSTILE_SITE_KEY`.
4. **Secrets.**
   ```sh
   npx wrangler secret put OIDC_CLIENT_SECRET
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put NOTIFY_TOKEN   # e.g. openssl rand -base64 32
   ```
5. **WAF rate limiting rule** (free plan, one rule): `http.request.uri.path eq "/api/comments" and http.request.method eq "POST"`, counting per IP, 3 requests per 10 seconds, action Block.
6. **GitHub Actions.** Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, Workers Routes edit) and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` then apply migrations and deploy.
7. **First sign-in.** Visit `/admin`. Heimdall signs you in, the blog refuses (no author yet) and shows your account id. Put it into `AUTHOR_SUBS` and deploy again.
8. **Legal pages.** Fill in the bracketed parts of `src/content.ts`.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev        # http://localhost:8787
npm run typecheck
npm test
```

Locally the Turnstile test keys always pass. Sign-in needs a reachable Heimdall; to try `/admin` without it, insert a session row by hand (only a SHA-256 of the cookie value is stored) and send `__Host-blog_session=<value>`.
