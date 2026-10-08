# blog.sstrabe.dev

One Cloudflare Worker with server-rendered pages, posts and comments in D1, images in R2, author sign-in through Heimdall, and anonymous comments behind Turnstile and pre-moderation.

Plan and decisions: [Blog architecture plan](https://claude.ai/code/artifact/68dc3de5-97a0-4e8e-a208-f4b52eb2d31c).

## How it fits together

| Route | Who | Gate |
| --- | --- | --- |
| `GET /`, `/posts/:slug`, `/feed.xml`, `/impressum`, `/privacy` | Anyone | None |
| `POST /api/comments` | Anyone | Honeypot, length and link checks, rate limit binding, Turnstile; stored as pending |
| `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/signed-out` | Author | OIDC with Heimdall (code flow + PKCE) |
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

Steps 1 to 5 were done on 2026-10-08: the IDs are in `wrangler.jsonc`, the Worker secrets are set, and the GitHub Actions token has Workers Scripts, D1 and Account Settings on the account plus Workers Routes on sstrabe.dev.

1. **Heimdall app.** At https://heimdall.strabix.com/developers, create an app named Blog:
   - Redirect URIs `https://blog.sstrabe.dev/auth/callback` and `https://blog.sstrabe.dev/auth/signed-out` (Heimdall only returns there after sign-out if it is registered).
   - Scope `profile`.
   - Put the client ID the portal shows into `OIDC_CLIENT_ID` in `wrangler.jsonc`; the secret goes in with step 4.
   - The portal makes it confidential with PKCE S256. It can't add client roles, so `AUTHOR_SUBS` decides who can write; it already holds your account id.
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
7. **First sign-in.** Visit `/admin` and allow the app on Heimdall's consent page. Another account would be refused and shown its account id, which is what goes into `AUTHOR_SUBS` to add a writer.
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
