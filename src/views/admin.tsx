import type { FC } from "hono/jsx";
import type { CommentWithPost, Media, Post } from "../db";
import type { Env, Session, Theme } from "../env";
import { AdminLayout, Callout, formatDate, PageHeader } from "./layout";
import { Icon } from "./icons";

interface Base {
  env: Env;
  theme: Theme;
  session: Session;
  path: string;
  pending: number;
}

const Csrf: FC<{ session: Session }> = ({ session }) => <input type="hidden" name="_csrf" value={session.csrf} />;

const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const tone = status === "published" || status === "approved" ? "success" : status === "pending" ? "warning" : "neutral";
  const label = { published: "Published", draft: "Draft", approved: "Approved", pending: "Pending" }[status] ?? status;
  return (
    <span class={`badge badge-${tone}`}>
      <span class="dot"></span>
      {label}
    </span>
  );
};

export const PostsPage: FC<Base & { posts: Post[]; notice?: string }> = ({ posts, notice, ...base }) => (
  <AdminLayout {...base} title="Posts">
    <PageHeader title="Posts">
      <a href="/admin/posts/new" class="btn btn-primary">
        <Icon name="plus" />
        New post
      </a>
    </PageHeader>
    {notice && <Callout tone="success">{notice}</Callout>}
    <section class="card">
      {posts.length === 0 ? (
        <div class="empty">
          <Icon name="fileText" class="icon-lg" />
          <p class="strong">No posts yet</p>
          <p class="muted">Your first post starts as a draft.</p>
        </div>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th class="right">Published</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr>
                  <td>
                    <a href={`/admin/posts/${p.id}`} class="row-link">
                      <span class="link strong">{p.title}</span>
                      <span class="sub">/posts/{p.slug}</span>
                    </a>
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td class="right muted">{formatDate(p.published_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </AdminLayout>
);

export interface PostForm {
  title: string;
  slug: string;
  summary: string;
  body_md: string;
  status: "draft" | "published";
}

export const EditPostPage: FC<Base & { post: Post | null; form: PostForm; error?: string; notice?: string }> = ({
  post,
  form,
  error,
  notice,
  ...base
}) => (
  <AdminLayout {...base} title={post ? `Edit ${post.title}` : "New post"}>
    <nav aria-label="Breadcrumb" class="breadcrumbs">
      <a href="/admin/posts">Posts</a>
      <span>/</span>
      <span class="muted">{post ? post.title : "New post"}</span>
    </nav>
    <PageHeader title={post ? post.title : "New post"}>
      {post && (
        <a href={post.status === "published" ? `/posts/${post.slug}` : `/admin/posts/${post.id}/preview`} class="btn">
          <Icon name="external" />
          {post.status === "published" ? "View post" : "Preview"}
        </a>
      )}
    </PageHeader>
    <form method="post" action={post ? `/admin/posts/${post.id}` : "/admin/posts"} class="stack-lg">
      <Csrf session={base.session} />
      {error && <Callout tone="danger">{error}</Callout>}
      {notice && <Callout tone="success">{notice}</Callout>}
      <section class="card">
        <div class="card-body form-grid">
          <div class="field">
            <label for="title">Title</label>
            <input id="title" name="title" required maxlength={200} value={form.title} />
          </div>
          <div class="field">
            <label for="slug">
              Address <span class="optional">(optional)</span>
            </label>
            <div class="prefixed">
              <span>/posts/</span>
              <input id="slug" name="slug" maxlength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} />
            </div>
            <p class="hint">Lowercase letters, digits and hyphens. Made from the title when empty.</p>
          </div>
          <div class="field span-2">
            <label for="summary">
              Summary <span class="optional">(optional)</span>
            </label>
            <input id="summary" name="summary" maxlength={300} value={form.summary} />
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Text</h2>
          <p class="muted">Markdown. Images from the Images page.</p>
        </div>
        <div class="editor">
          <textarea id="body_md" name="body_md" rows={24} class="mono" data-preview="preview" data-csrf={base.session.csrf}>
            {form.body_md}
          </textarea>
          <div id="preview" class="prose editor-preview" aria-live="polite"></div>
        </div>
        <div class="card-foot">
          <label class="inline-field">
            <span>Status</span>
            <select name="status">
              <option value="draft" selected={form.status === "draft"}>
                Draft
              </option>
              <option value="published" selected={form.status === "published"}>
                Published
              </option>
            </select>
          </label>
          <button type="submit" class="btn btn-primary">
            {post ? "Save post" : "Create post"}
          </button>
        </div>
      </section>
    </form>
    {post && (
      <section class="card card-danger">
        <div class="card-head">
          <h2>Delete post</h2>
          <p class="muted">Removes the post and all its comments.</p>
        </div>
        <form method="post" action={`/admin/posts/${post.id}/delete`} class="card-body inline-form">
          <Csrf session={base.session} />
          <label for="confirm">
            Type <code>{post.slug}</code> to confirm
          </label>
          <input id="confirm" name="confirm" required pattern={escapeRegex(post.slug)} autocomplete="off" />
          <button type="submit" class="btn btn-danger">
            Delete post
          </button>
        </form>
      </section>
    )}
  </AdminLayout>
);

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const CommentsPage: FC<Base & { filter: "pending" | "approved"; comments: CommentWithPost[]; approvedCount: number }> = ({
  filter,
  comments,
  approvedCount,
  ...base
}) => (
  <AdminLayout {...base} title="Comments">
    <PageHeader title="Comments" description="New comments wait here until you approve them." />
    <nav aria-label="Filter" class="tabs">
      <a href="?filter=pending" class={filter === "pending" ? "tab active" : "tab"} aria-current={filter === "pending" ? "page" : undefined}>
        Pending <span class="pill">{base.pending}</span>
      </a>
      <a href="?filter=approved" class={filter === "approved" ? "tab active" : "tab"} aria-current={filter === "approved" ? "page" : undefined}>
        Approved <span class="pill">{approvedCount}</span>
      </a>
    </nav>
    <section class="card">
      {comments.length === 0 ? (
        <div class="empty">
          <Icon name={filter === "pending" ? "circleCheck" : "message"} class="icon-lg" />
          <p class="strong">{filter === "pending" ? "Nothing to review" : "No approved comments yet"}</p>
        </div>
      ) : (
        <ul class="moderation">
          {comments.map((cm) => (
            <li>
              <div class="moderation-meta">
                <span class="strong">{cm.name}</span>
                <span class="muted">
                  on <a href={`/posts/${cm.post_slug}`}>{cm.post_title}</a> · {formatDate(cm.created_at)}
                </span>
                {cm.spam_score !== null && cm.spam_score > 0.5 && <span class="badge badge-warning">Likely spam</span>}
              </div>
              <p class="comment-body">{cm.body}</p>
              <div class="row-actions">
                {filter === "pending" ? (
                  <form method="post" action={`/admin/comments/${cm.id}/approve`}>
                    <Csrf session={base.session} />
                    <button type="submit" class="btn btn-primary btn-sm">
                      <Icon name="check" />
                      Approve
                    </button>
                  </form>
                ) : (
                  <form method="post" action={`/admin/comments/${cm.id}/unapprove`}>
                    <Csrf session={base.session} />
                    <button type="submit" class="btn btn-sm">
                      Unpublish
                    </button>
                  </form>
                )}
                <form method="post" action={`/admin/comments/${cm.id}/delete`}>
                  <Csrf session={base.session} />
                  <input type="hidden" name="filter" value={filter} />
                  <button type="submit" class="btn btn-danger-outline btn-sm">
                    {filter === "pending" ? "Reject" : "Delete"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  </AdminLayout>
);

export const MediaPage: FC<Base & { media: Media[]; error?: string; notice?: string }> = ({ media, error, notice, ...base }) => (
  <AdminLayout {...base} title="Images">
    <PageHeader title="Images" description="PNG, JPEG, GIF, WebP or AVIF, up to 10 MB." />
    <form method="post" action="/admin/media" enctype="multipart/form-data" class="card upload">
      <Csrf session={base.session} />
      <div class="card-body stack">
        {error && <Callout tone="danger">{error}</Callout>}
        {notice && <Callout tone="success">{notice}</Callout>}
        <div class="inline-form">
          <input type="file" name="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" required />
          <button type="submit" class="btn btn-primary">
            <Icon name="upload" />
            Upload image
          </button>
        </div>
      </div>
    </form>
    <section class="card">
      {media.length === 0 ? (
        <div class="empty">
          <Icon name="image" class="icon-lg" />
          <p class="strong">No images yet</p>
        </div>
      ) : (
        <ul class="media-grid">
          {media.map((m) => (
            <li>
              <img src={`/media/${m.key}`} alt="" loading="lazy" />
              <code class="snippet">![](/media/{m.key})</code>
              <div class="media-foot">
                <span class="muted">{Math.ceil(m.size / 1024)} KB</span>
                <form method="post" action={`/admin/media/${m.key}/delete`}>
                  <Csrf session={base.session} />
                  <button type="submit" class="btn btn-danger-outline btn-sm">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  </AdminLayout>
);
