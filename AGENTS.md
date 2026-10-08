# Notes for agents

- Read README.md first: routes, security rules and setup live there.
- Stack: Cloudflare Worker (Hono + hono/jsx, TypeScript), D1, R2, Turnstile. No client framework; `public/admin.js` is the only script.
- UI follows the Heimdall house style as a sibling app: tokens in `public/styles.css`, accent leaf green `#65a30d` (light primary `#406c00`, dark `#4f8200`), mark = white quill on a `#91cc58 → #4b7c00` tile. Never raw colours outside the token blocks and the mark.
- Author sign-in is a Heimdall external app (OIDC in `src/auth.tsx`). Don't add Cloudflare Access.
- Never render user or comment text as HTML, never add inline script or style, never store commenter IPs.
- Schema changes go in a new file under `migrations/`; never edit an applied migration.
- Before pushing: `npm run typecheck && npm test`.
