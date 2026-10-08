import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import type { Comment, Post } from "../db";
import type { Env, Theme } from "../env";
import { renderMarkdown } from "../markdown";
import { Callout, formatDate, PublicLayout } from "./layout";

export const IndexPage: FC<{ env: Env; theme: Theme; posts: Post[] }> = ({ env, theme, posts }) => (
  <PublicLayout env={env} theme={theme} title={env.SITE_NAME} path="/">
    <h1 class="page-title">{env.SITE_NAME}</h1>
    {posts.length === 0 ? (
      <div class="card empty">
        <p class="strong">No posts yet</p>
      </div>
    ) : (
      <ul class="card post-list">
        {posts.map((p) => (
          <li>
            <a href={`/posts/${p.slug}`}>
              <span class="post-list-title">{p.title}</span>
              {p.summary && <span class="post-list-summary">{p.summary}</span>}
              <time datetime={p.published_at ?? ""}>{formatDate(p.published_at)}</time>
            </a>
          </li>
        ))}
      </ul>
    )}
  </PublicLayout>
);

export interface CommentFormState {
  name?: string;
  body?: string;
  error?: string;
  sent?: boolean;
}

export const PostPage: FC<{
  env: Env;
  theme: Theme;
  post: Post;
  comments: Comment[];
  form?: CommentFormState;
  preview?: boolean;
}> = ({ env, theme, post, comments, form = {}, preview }) => (
  <PublicLayout env={env} theme={theme} title={post.title} description={post.summary} path={`/posts/${post.slug}`}>
    {preview && (
      <Callout tone="info">This is a preview of a draft. Only you can see it.</Callout>
    )}
    <article class="card post">
      <header>
        <h1>{post.title}</h1>
        <p class="muted">
          {post.published_at ? <time datetime={post.published_at}>{formatDate(post.published_at)}</time> : "Draft"}
          {" · "}
          {env.SITE_AUTHOR}
        </p>
      </header>
      <div class="prose">{raw(renderMarkdown(post.body_md))}</div>
    </article>

    {!preview && (
      <section class="comments" id="comments" aria-labelledby="comments-title">
        <h2 id="comments-title">
          Comments {comments.length > 0 && <span class="muted">{comments.length}</span>}
        </h2>
        {comments.length > 0 && (
          <ul class="card comment-list">
            {comments.map((cm) => (
              <li id={`c${cm.id}`}>
                <p class="comment-meta">
                  <span class="strong">{cm.name}</span>
                  <time datetime={cm.created_at} class="muted">
                    {formatDate(cm.created_at)}
                  </time>
                </p>
                <p class="comment-body">{cm.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form method="post" action="/api/comments" class="card comment-form" id="comment-form">
          <h3>Leave a comment</h3>
          {form.sent && <Callout tone="success">Thanks, your comment will appear once it's approved.</Callout>}
          {form.error && <Callout tone="danger">{form.error}</Callout>}
          <input type="hidden" name="post" value={post.slug} />
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" required maxlength={60} autocomplete="nickname" value={form.name ?? ""} />
          </div>
          <div class="field">
            <label for="body">Comment</label>
            <textarea id="body" name="body" required maxlength={4000} rows={5}>
              {form.body ?? ""}
            </textarea>
            <p class="hint">Plain text. Links aren't clickable.</p>
          </div>
          <div class="field hp" aria-hidden="true">
            <label for="website">Website</label>
            <input id="website" name="website" tabindex={-1} autocomplete="off" />
          </div>
          <div class="cf-turnstile" data-sitekey={env.TURNSTILE_SITE_KEY} data-theme={theme === "system" ? "auto" : theme}></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Post comment</button>
          </div>
        </form>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      </section>
    )}
  </PublicLayout>
);

export const TextPage: FC<{ env: Env; theme: Theme; title: string; path: string; markdown: string }> = ({
  env,
  theme,
  title,
  path,
  markdown,
}) => (
  <PublicLayout env={env} theme={theme} title={title} path={path}>
    <article class="card post">
      <div class="prose">{raw(renderMarkdown(markdown))}</div>
    </article>
  </PublicLayout>
);

export const NotFoundPage: FC<{ env: Env; theme: Theme; path: string }> = ({ env, theme, path }) => (
  <PublicLayout env={env} theme={theme} title="Not found" path={path}>
    <div class="card empty">
      <p class="strong">This page doesn't exist</p>
      <p class="muted">
        <a href="/">Go to all posts</a>
      </p>
    </div>
  </PublicLayout>
);
