import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AppEnv, Env, Session } from "./env";
import { base64url, randomToken, safeEqual, sameOrigin, sha256 } from "./security";
import { now } from "./db";
import { SignInPage } from "./views/signin";

// The blog is a Heimdall external app: the Worker runs the OIDC authorization
// code flow with PKCE itself and keeps its own session, stored in D1.

export const SESSION_COOKIE = "__Host-blog_session";
const FLOW_COOKIE = "__Host-blog_oidc";
const SESSION_HOURS = 12;

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

let discoveryCache: { issuer: string; at: number; doc: Discovery } | null = null;
let jwksCache: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;

async function discovery(env: Env): Promise<Discovery> {
  const issuer = env.OIDC_ISSUER.replace(/\/$/, "");
  if (discoveryCache && discoveryCache.issuer === issuer && Date.now() - discoveryCache.at < 3600_000) {
    return discoveryCache.doc;
  }
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`Heimdall discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  if (doc.issuer !== issuer) throw new Error("Heimdall discovery returned a different issuer");
  discoveryCache = { issuer, at: Date.now(), doc };
  return doc;
}

function jwks(uri: string) {
  if (!jwksCache || jwksCache.uri !== uri) jwksCache = { uri, set: createRemoteJWKSet(new URL(uri)) };
  return jwksCache.set;
}

function redirectUri(env: Env) {
  return `${env.SITE_URL.replace(/\/$/, "")}/auth/callback`;
}

function safeReturnPath(path: string | undefined): string {
  return path && /^\/admin(\/|$|\?)/.test(path) ? path : "/admin";
}

interface Flow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export function authorIsAllowed(env: Env, claims: JWTPayload): boolean {
  const subs = env.AUTHOR_SUBS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!claims.sub || !subs.includes(claims.sub)) return false;
  if (env.AUTHOR_ROLE) {
    const access = claims.resource_access as Record<string, { roles?: string[] }> | undefined;
    const roles = access?.[env.OIDC_CLIENT_ID]?.roles ?? [];
    if (!roles.includes(env.AUTHOR_ROLE)) return false;
  }
  return true;
}

export const auth = new Hono<AppEnv>();

auth.get("/login", async (c) => {
  const d = await discovery(c.env);
  const flow: Flow = {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(48),
    returnTo: safeReturnPath(c.req.query("return")),
  };
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(flow.verifier)));
  // Lax, because Heimdall's redirect back to /auth/callback is a cross-site navigation.
  setCookie(c, FLOW_COOKIE, base64url(new TextEncoder().encode(JSON.stringify(flow))), {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 600,
  });
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: redirectUri(c.env),
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return c.redirect(url.toString(), 302);
});

function readFlow(raw: string | undefined): Flow | null {
  if (!raw) return null;
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Flow;
  } catch {
    return null;
  }
}

auth.get("/callback", async (c) => {
  const flow = readFlow(getCookie(c, FLOW_COOKIE));
  deleteCookie(c, FLOW_COOKIE, { path: "/", secure: true });
  const fail = (message: string, status: 400 | 403 = 400) => {
    c.status(status);
    return c.html(<SignInPage env={c.env} theme={c.get("theme")} error={message} />);
  };

  if (c.req.query("error")) return fail("Heimdall didn't complete the sign-in. Please try again.");
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!flow || !code || !state || !(await safeEqual(state, flow.state))) {
    return fail("The sign-in took too long or was started in another tab. Please try again.");
  }

  const d = await discovery(c.env);
  const tokenRes = await fetch(d.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${encodeURIComponent(c.env.OIDC_CLIENT_ID)}:${encodeURIComponent(c.env.OIDC_CLIENT_SECRET)}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(c.env),
      code_verifier: flow.verifier,
    }),
  });
  if (!tokenRes.ok) return fail("Heimdall didn't accept the sign-in. Please try again.");
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return fail("Heimdall didn't return an identity. Please try again.");

  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(tokens.id_token, jwks(d.jwks_uri), {
      issuer: d.issuer,
      audience: c.env.OIDC_CLIENT_ID,
    }));
  } catch {
    return fail("The sign-in couldn't be verified. Please try again.");
  }
  if (claims.nonce !== flow.nonce) return fail("The sign-in couldn't be verified. Please try again.");
  if (!authorIsAllowed(c.env, claims)) {
    return fail(`This Heimdall account can't write here. Account id: ${claims.sub}`, 403);
  }

  const sessionId = randomToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  const name = String(claims.name ?? claims.preferred_username ?? claims.email ?? "");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    c.env.DB.prepare("INSERT INTO sessions (id_hash, sub, name, csrf, expires_at) VALUES (?, ?, ?, ?, ?)").bind(
      await sha256(sessionId),
      claims.sub,
      name,
      randomToken(),
      expires,
    ),
  ]);
  setCookie(c, SESSION_COOKIE, sessionId, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    maxAge: SESSION_HOURS * 3600,
  });
  // A Strict cookie isn't sent on a redirect that started on heimdall.strabix.com,
  // so the hop to /admin is a same-site navigation from this page instead.
  const target = safeReturnPath(flow.returnTo);
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="refresh" content={`0;url=${target}`} />
        <title>Signing in…</title>
      </head>
      <body>
        <a href={target}>Continue</a>
      </body>
    </html>,
  );
});

auth.post("/logout", async (c) => {
  const session = c.get("session");
  if (session) {
    const form = await c.req.parseBody();
    if (!sameOrigin(c.req.raw) || !(await safeEqual(String(form._csrf ?? ""), session.csrf))) {
      return c.text("Forbidden", 403);
    }
    const id = getCookie(c, SESSION_COOKIE);
    if (id) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(id)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  const d = await discovery(c.env);
  if (!d.end_session_endpoint) return c.redirect("/", 303);
  const url = new URL(d.end_session_endpoint);
  url.search = new URLSearchParams({
    client_id: c.env.OIDC_CLIENT_ID,
    post_logout_redirect_uri: `${c.env.SITE_URL.replace(/\/$/, "")}/`,
  }).toString();
  return c.redirect(url.toString(), 303);
});

export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = getCookie(c, SESSION_COOKIE);
  let session: Session | null = null;
  if (id) {
    session = await c.env.DB.prepare(
      "SELECT sub, name, csrf FROM sessions WHERE id_hash = ? AND expires_at > ?",
    )
      .bind(await sha256(id), now())
      .first<Session>();
  }
  c.set("session", session);
  await next();
};

// Every admin request needs a live session; every admin write also needs the
// same origin and the session's CSRF token.
export const requireAuthor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.get("session");
  c.header("Cache-Control", "no-store");
  if (!session) {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized" }, 401);
    const back = new URL(c.req.url);
    return c.redirect(`/auth/login?return=${encodeURIComponent(back.pathname + back.search)}`, 302);
  }
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const token =
      c.req.header("X-CSRF-Token") ??
      (c.req.header("Content-Type")?.includes("form") ? String((await c.req.parseBody())._csrf ?? "") : "");
    if (!sameOrigin(c.req.raw) || !(await safeEqual(token, session.csrf))) {
      return c.text("Forbidden", 403);
    }
  }
  await next();
};
