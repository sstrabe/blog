import { Hono, type Context } from "hono";
import type { AppEnv } from "./env";
import { allPosts, commentsByStatus, now, pendingCount, postById, type Media, type Post } from "./db";
import { renderMarkdown } from "./markdown";
import { randomToken, safeEqual } from "./security";
import { CommentsPage, EditPostPage, MediaPage, PostsPage, type PostForm } from "./views/admin";
import { PostPage } from "./views/public";

export const admin = new Hono<AppEnv>();

const MAX_IMAGE = 10 * 1024 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

// Recognise images by their first bytes, not by the name or the browser's claim.
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", ext: "png" };
  if (starts([0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (starts([0x47, 0x49, 0x46, 0x38])) return { type: "image/gif", ext: "gif" };
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { type: "image/webp", ext: "webp" };
  if (starts([0x66, 0x74, 0x79, 0x70], 4) && (starts([0x61, 0x76, 0x69, 0x66], 8) || starts([0x61, 0x76, 0x69, 0x73], 8))) {
    return { type: "image/avif", ext: "avif" };
  }
  return null;
}

async function base(c: Context<AppEnv>) {
  return {
    env: c.env,
    theme: c.get("theme"),
    session: c.get("session")!,
    path: c.req.path,
    pending: await pendingCount(c.env.DB),
  };
}

admin.get("/", (c) => c.redirect("/admin/posts", 302));

// Posts

admin.get("/posts", async (c) => {
  const notice = c.req.query("deleted") ? "Post deleted." : undefined;
  return c.html(<PostsPage {...await base(c)} posts={await allPosts(c.env.DB)} notice={notice} />);
});

const emptyForm: PostForm = { title: "", slug: "", summary: "", body_md: "", status: "draft" };

admin.get("/posts/new", async (c) => c.html(<EditPostPage {...await base(c)} post={null} form={emptyForm} />));

function readPostForm(form: Record<string, unknown>): PostForm {
  const title = String(form.title ?? "").trim();
  return {
    title,
    slug: String(form.slug ?? "").trim() || slugify(title),
    summary: String(form.summary ?? "").trim(),
    body_md: String(form.body_md ?? "").replace(/\r\n?/g, "\n"),
    status: form.status === "published" ? "published" : "draft",
  };
}

function checkPostForm(f: PostForm): string | null {
  if (!f.title) return "Enter a title.";
  if (f.title.length > 200) return "Use a title of up to 200 characters.";
  if (!SLUG.test(f.slug) || f.slug.length > 80) return "Use only lowercase letters, digits and single hyphens in the address.";
  if (f.summary.length > 300) return "Use a summary of up to 300 characters.";
  return null;
}

async function savePost(c: Context<AppEnv>, existing: Post | null) {
  const f = readPostForm(await c.req.parseBody());
  const page = async (error?: string, notice?: string, post = existing) =>
    c.html(<EditPostPage {...await base(c)} post={post} form={f} error={error} notice={notice} />, error ? 400 : 200);

  const invalid = checkPostForm(f);
  if (invalid) return page(invalid);

  const clash = await c.env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(f.slug).first<{ id: number }>();
  if (clash && clash.id !== existing?.id) return page("Another post already uses this address.");

  // First publish sets the date; it stays when the post is edited later.
  const publishedAt = f.status === "published" ? (existing?.published_at ?? now()) : (existing?.published_at ?? null);
  if (existing) {
    await c.env.DB.prepare(
      "UPDATE posts SET title = ?, slug = ?, summary = ?, body_md = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(f.title, f.slug, f.summary, f.body_md, f.status, publishedAt, now(), existing.id)
      .run();
    return c.redirect(`/admin/posts/${existing.id}?saved=1`, 303);
  }
  const row = await c.env.DB.prepare(
    "INSERT INTO posts (title, slug, summary, body_md, status, published_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(f.title, f.slug, f.summary, f.body_md, f.status, publishedAt)
    .first<{ id: number }>();
  return c.redirect(`/admin/posts/${row!.id}?saved=1`, 303);
}

admin.post("/posts", (c) => savePost(c, null));

async function loadPost(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  return Number.isInteger(id) ? postById(c.env.DB, id) : null;
}

admin.get("/posts/:id{[0-9]+}", async (c) => {
  const post = await loadPost(c);
  if (!post) return c.notFound();
  const notice = c.req.query("saved") ? "Saved." : undefined;
  return c.html(<EditPostPage {...await base(c)} post={post} form={post} notice={notice} />);
});

admin.post("/posts/:id{[0-9]+}", async (c) => {
  const post = await loadPost(c);
  if (!post) return c.notFound();
  return savePost(c, post);
});

admin.get("/posts/:id{[0-9]+}/preview", async (c) => {
  const post = await loadPost(c);
  if (!post) return c.notFound();
  return c.html(<PostPage env={c.env} theme={c.get("theme")} post={post} comments={[]} preview />);
});

admin.post("/posts/:id{[0-9]+}/delete", async (c) => {
  const post = await loadPost(c);
  if (!post) return c.notFound();
  const form = await c.req.parseBody();
  if (String(form.confirm ?? "") !== post.slug) {
    return c.html(
      <EditPostPage {...await base(c)} post={post} form={post} error="Type the post's address exactly to delete it." />,
      400,
    );
  }
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(post.id),
    c.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(post.id),
  ]);
  return c.redirect("/admin/posts?deleted=1", 303);
});

// Live preview for the editor. Same renderer as the public page.
admin.post("/preview", async (c) => {
  const { body } = await c.req.json<{ body: string }>();
  return c.html(renderMarkdown(String(body ?? "")));
});

// Comments

admin.get("/comments", async (c) => {
  const filter = c.req.query("filter") === "approved" ? "approved" : "pending";
  const [list, approved] = await Promise.all([
    commentsByStatus(c.env.DB, filter),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'approved'").first<{ n: number }>(),
  ]);
  return c.html(<CommentsPage {...await base(c)} filter={filter} comments={list} approvedCount={approved?.n ?? 0} />);
});

admin.post("/comments/:id{[0-9]+}/approve", async (c) => {
  await c.env.DB.prepare("UPDATE comments SET status = 'approved' WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect("/admin/comments?filter=pending", 303);
});

admin.post("/comments/:id{[0-9]+}/unapprove", async (c) => {
  await c.env.DB.prepare("UPDATE comments SET status = 'pending' WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect("/admin/comments?filter=approved", 303);
});

admin.post("/comments/:id{[0-9]+}/delete", async (c) => {
  const form = await c.req.parseBody();
  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect(`/admin/comments?filter=${form.filter === "approved" ? "approved" : "pending"}`, 303);
});

// Images

async function mediaList(c: Context<AppEnv>) {
  const { results } = await c.env.DB.prepare("SELECT * FROM media ORDER BY created_at DESC").all<Media>();
  return results;
}

admin.get("/media", async (c) => {
  const notice = c.req.query("uploaded") ? "Image uploaded." : c.req.query("deleted") ? "Image deleted." : undefined;
  return c.html(<MediaPage {...await base(c)} media={await mediaList(c)} notice={notice} />);
});

admin.post("/media", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  const fail = async (error: string) => c.html(<MediaPage {...await base(c)} media={await mediaList(c)} error={error} />, 400);
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image to upload.");
  if (file.size > MAX_IMAGE) return fail("The image is larger than 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail("Upload a PNG, JPEG, GIF, WebP or AVIF image. SVG isn't accepted.");
  const key = `${randomToken(12)}.${kind.ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: kind.type } });
  await c.env.DB.prepare("INSERT INTO media (key, content_type, size) VALUES (?, ?, ?)").bind(key, kind.type, bytes.length).run();
  return c.redirect("/admin/media?uploaded=1", 303);
});

admin.post("/media/:key/delete", async (c) => {
  const key = c.req.param("key");
  await c.env.MEDIA.delete(key);
  await c.env.DB.prepare("DELETE FROM media WHERE key = ?").bind(key).run();
  return c.redirect("/admin/media?deleted=1", 303);
});

// For the VPS notifier: only a number, behind a bearer token.
export const notify = new Hono<AppEnv>();
notify.get("/pending-count", async (c) => {
  c.header("Cache-Control", "no-store");
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!c.env.NOTIFY_TOKEN || !(await safeEqual(token, c.env.NOTIFY_TOKEN))) return c.json({ error: "unauthorized" }, 401);
  return c.json({ pending: await pendingCount(c.env.DB) });
});

