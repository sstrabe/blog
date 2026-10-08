export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  COMMENT_LIMIT: RateLimit;

  SITE_URL: string;
  SITE_NAME: string;
  SITE_AUTHOR: string;
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  AUTHOR_SUBS: string;
  AUTHOR_ROLE: string;
  TURNSTILE_SITE_KEY: string;

  OIDC_CLIENT_SECRET: string;
  TURNSTILE_SECRET: string;
  NOTIFY_TOKEN: string;
}

export interface Session {
  sub: string;
  name: string;
  csrf: string;
}

export type Theme = "light" | "dark" | "system";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    session: Session | null;
    theme: Theme;
  };
};
