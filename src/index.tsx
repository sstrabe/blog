import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Theme } from "./env";
import { isLocalPath, securityHeaders } from "./security";
import { auth, loadSession, requireAuthor } from "./auth";
import { admin, notify } from "./admin";
import { comments } from "./comments";
import { approvedComments, postBySlug, publishedPosts } from "./db";
import { escapeHtml } from "./markdown";
import { contact, privacy } from "./content";
import { IndexPage, NotFoundPage, PostPage, TextPage } from "./views/public";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);

app.use("*", async (c, next) => {
  const t = getCookie(c, "theme");
  c.set("theme", t === "light" || t === "dark" ? t : "system");
  await next();
});

app.use("/admin/*", loadSession, requireAuthor);
app.use("/admin", loadSession, requireAuthor);
app.use("/auth/logout", loadSession);

app.route("/auth", auth);
app.route("/admin", admin);
app.route("/api/admin", notify);
app.route("/api/comments", comments);

// Reading side

app.get("/", async (c) => {
  return c.html(<IndexPage env={c.env} theme={c.get("theme")} posts={await publishedPosts(c.env.DB)} />);
});

app.get("/posts/:slug", async (c) => {
  const post = await postBySlug(c.env.DB, c.req.param("slug"));
  if (!post || post.status !== "published") return c.notFound();
  const list = await approvedComments(c.env.DB, post.id);
  const sent = c.req.query("comment") === "sent";
  return c.html(<PostPage env={c.env} theme={c.get("theme")} post={post} comments={list} form={{ sent }} />);
});

app.get("/contact", (c) =>
  c.html(<TextPage env={c.env} theme={c.get("theme")} title="Contact" path="/contact" markdown={contact(c.env.SITE_AUTHOR)} />),
);
app.get("/privacy", (c) =>
  c.html(<TextPage env={c.env} theme={c.get("theme")} title="Privacy" path="/privacy" markdown={privacy(c.env.SITE_AUTHOR)} />),
);

app.get("/feed.xml", async (c) => {
  const site = c.env.SITE_URL.replace(/\/$/, "");
  const posts = await publishedPosts(c.env.DB, 30);
  const items = posts
    .map(
      (p) => `<item>
  <title>${escapeHtml(p.title)}</title>
  <link>${site}/posts/${p.slug}</link>
  <guid isPermaLink="true">${site}/posts/${p.slug}</guid>
  <pubDate>${new Date(p.published_at!).toUTCString()}</pubDate>
  <description>${escapeHtml(p.summary)}</description>
</item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(c.env.SITE_NAME)}</title>
  <link>${site}/</link>
  <description>${escapeHtml(c.env.SITE_NAME)} by ${escapeHtml(c.env.SITE_AUTHOR)}</description>
${items}
</channel>
</rss>`;
  return c.body(xml, 200, { "Content-Type": "application/rss+xml; charset=utf-8" });
});

// Images uploaded through /admin, served with the type sniffed at upload and a
// sandbox CSP, so even a file opened directly can't run anything.
app.get("/media/:key{[A-Za-z0-9_-]+\\.(png|jpg|gif|webp|avif)}", async (c) => {
  const obj = await c.env.MEDIA.get(c.req.param("key"));
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return new Response(obj.body, { headers });
});

app.post("/theme", async (c) => {
  const form = await c.req.parseBody();
  const theme = String(form.theme ?? "") as Theme;
  if (theme === "light" || theme === "dark") {
    setCookie(c, "theme", theme, { path: "/", secure: true, sameSite: "Lax", maxAge: 31536000 });
  } else {
    setCookie(c, "theme", "", { path: "/", secure: true, sameSite: "Lax", maxAge: 0 });
  }
  const back = String(form.back ?? "/");
  return c.redirect(isLocalPath(back) ? back : "/", 303);
});

app.notFound((c) => c.html(<NotFoundPage env={c.env} theme={c.get("theme") ?? "system"} path={c.req.path} />, 404));

app.onError((err, c) => {
  console.error(err);
  return c.text("Something went wrong. Please try again.", 500);
});

export default app;
