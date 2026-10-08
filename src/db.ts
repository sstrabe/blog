export interface Post {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body_md: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  post_id: number;
  name: string;
  body: string;
  status: "pending" | "approved";
  spam_score: number | null;
  created_at: string;
}

export interface CommentWithPost extends Comment {
  post_slug: string;
  post_title: string;
}

export interface Media {
  key: string;
  content_type: string;
  size: number;
  created_at: string;
}

export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export async function publishedPosts(db: D1Database, limit = 100): Promise<Post[]> {
  const { results } = await db
    .prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ?")
    .bind(limit)
    .all<Post>();
  return results;
}

export async function allPosts(db: D1Database): Promise<Post[]> {
  const { results } = await db
    .prepare("SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC")
    .all<Post>();
  return results;
}

export function postBySlug(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<Post>();
}

export function postById(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Post>();
}

export async function approvedComments(db: D1Database, postId: number): Promise<Comment[]> {
  const { results } = await db
    .prepare("SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC")
    .bind(postId)
    .all<Comment>();
  return results;
}

export async function commentsByStatus(
  db: D1Database,
  status: "pending" | "approved",
): Promise<CommentWithPost[]> {
  // Pending: oldest first, likely spam last. Approved: newest first.
  const order =
    status === "pending" ? "COALESCE(c.spam_score, 0) ASC, c.created_at ASC" : "c.created_at DESC";
  const { results } = await db
    .prepare(
      `SELECT c.*, p.slug AS post_slug, p.title AS post_title
       FROM comments c JOIN posts p ON p.id = c.post_id
       WHERE c.status = ? ORDER BY ${order} LIMIT 200`,
    )
    .bind(status)
    .all<CommentWithPost>();
  return results;
}

export async function pendingCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'")
    .first<{ n: number }>();
  return row?.n ?? 0;
}
