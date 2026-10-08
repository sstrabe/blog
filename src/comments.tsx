import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { approvedComments, postBySlug } from "./db";
import { PostPage, type CommentFormState } from "./views/public";

export const MAX_NAME = 60;
export const MAX_BODY = 4000;
export const MAX_LINKS = 3;

export function cleanText(s: string): string {
  // Normalise line endings, drop control characters except newline and tab.
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .trim();
}

export function validateComment(name: string, body: string): string | null {
  if (!name || name.length > MAX_NAME) return `Enter a name of up to ${MAX_NAME} characters.`;
  if (!body || body.length > MAX_BODY) return `Enter a comment of up to ${MAX_BODY.toLocaleString("en")} characters.`;
  const links = body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > MAX_LINKS) return `Use at most ${MAX_LINKS} links in a comment.`;
  return null;
}

export async function verifyTurnstile(env: Env, token: string, ip: string | undefined): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  // Passed on to Turnstile for its check only; never stored.
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean; hostname?: string };
  return data.success === true;
}

export const comments = new Hono<AppEnv>();

comments.post("/", async (c) => {
  const form = await c.req.parseBody();
  const slug = String(form.post ?? "");
  const post = await postBySlug(c.env.DB, slug);
  if (!post || post.status !== "published") return c.notFound();

  const name = cleanText(String(form.name ?? ""));
  const body = cleanText(String(form.body ?? ""));
  const render = async (state: CommentFormState, status: 400 | 429) => {
    c.status(status);
    c.header("Cache-Control", "no-store");
    const list = await approvedComments(c.env.DB, post.id);
    return c.html(<PostPage env={c.env} theme={c.get("theme")} post={post} comments={list} form={state} />);
  };

  const sent = () => c.redirect(`/posts/${post.slug}?comment=sent#comment-form`, 303);

  // Honeypot: bots fill every field. Pretend it worked.
  if (String(form.website ?? "") !== "") return sent();

  const invalid = validateComment(name, body);
  if (invalid) return render({ name, body, error: invalid }, 400);

  const { success: underLimit } = await c.env.COMMENT_LIMIT.limit({ key: `post:${post.id}` });
  if (!underLimit) {
    return render({ name, body, error: "This post is getting a lot of comments right now. Please try again in a minute." }, 429);
  }

  const ok = await verifyTurnstile(c.env, String(form["cf-turnstile-response"] ?? ""), c.req.header("CF-Connecting-IP"));
  if (!ok) return render({ name, body, error: "The spam check didn't pass. Please try again." }, 400);

  await c.env.DB.prepare("INSERT INTO comments (post_id, name, body) VALUES (?, ?, ?)").bind(post.id, name, body).run();
  return sent();
});
