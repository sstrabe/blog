import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import type { Env, Session, Theme } from "../env";
import { Icon, Logo, type IconName } from "./icons";

const THEME_COLOR = { light: "#f2f3f5", dark: "#141518" };

export const Document: FC<{ title: string; theme: Theme; description?: string; children: Child; env: Env }> = ({
  title,
  theme,
  description,
  children,
  env,
}) => (
  <>
    {raw("<!doctype html>")}
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title === env.SITE_NAME ? title : `${title} · ${env.SITE_NAME}`}</title>
        {description && <meta name="description" content={description} />}
        {theme === "system" ? (
          <>
            <meta name="theme-color" media="(prefers-color-scheme: light)" content={THEME_COLOR.light} />
            <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLOR.dark} />
          </>
        ) : (
          <meta name="theme-color" content={THEME_COLOR[theme]} />
        )}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate" type="application/rss+xml" title={env.SITE_NAME} href="/feed.xml" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      {children}
    </html>
  </>
);

export const ThemeSwitch: FC<{ theme: Theme; back: string }> = ({ theme, back }) => {
  const opts: [Theme, string, IconName][] = [
    ["light", "Light", "sun"],
    ["dark", "Dark", "moon"],
    ["system", "System", "monitor"],
  ];
  return (
    <form method="post" action="/theme" class="theme-switch" aria-label="Theme">
      <input type="hidden" name="back" value={back} />
      {opts.map(([value, label, icon]) => (
        <button type="submit" name="theme" value={value} aria-pressed={theme === value ? "true" : "false"}>
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </form>
  );
};

export const PublicLayout: FC<{
  env: Env;
  theme: Theme;
  title: string;
  description?: string;
  path: string;
  children: Child;
}> = ({ env, theme, title, description, path, children }) => (
  <Document env={env} theme={theme} title={title} description={description}>
    <body class="public">
      <header class="topbar">
        <div class="topbar-inner">
          <a href="/" class="brand">
            <Logo size={28} />
            <span>{env.SITE_NAME}</span>
          </a>
          <a href="/feed.xml" class="btn btn-ghost btn-sm" aria-label="RSS feed">
            <Icon name="rss" />
          </a>
        </div>
      </header>
      <main class="reading">{children}</main>
      <footer class="site-footer">
        <nav>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
        </nav>
        <ThemeSwitch theme={theme} back={path} />
      </footer>
    </body>
  </Document>
);

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/posts", label: "Posts", icon: "fileText" },
  { href: "/admin/comments", label: "Comments", icon: "message" },
  { href: "/admin/media", label: "Images", icon: "image" },
];

export const AdminLayout: FC<{
  env: Env;
  theme: Theme;
  session: Session;
  title: string;
  path: string;
  pending: number;
  children: Child;
}> = ({ env, theme, session, title, path, pending, children }) => (
  <Document env={env} theme={theme} title={title}>
    <body class="admin">
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true" />
      <label for="nav-toggle" class="nav-scrim" aria-hidden="true"></label>
      <aside class="sidebar">
        <div class="sidebar-head">
          <Logo size={28} />
          <div class="sidebar-title">
            <div class="app-name">{env.SITE_NAME}</div>
            <div class="app-context">blog.sstrabe.dev · admin</div>
          </div>
          <label for="nav-toggle" class="icon-btn sidebar-close" aria-label="Close navigation">
            <Icon name="x" />
          </label>
        </div>
        <nav aria-label="Main" class="sidebar-nav">
          <ul>
            {NAV.map((item) => {
              const active = path.startsWith(item.href);
              return (
                <li>
                  <a href={item.href} class={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}>
                    <Icon name={item.icon} />
                    {item.label}
                    {item.href === "/admin/comments" && pending > 0 && <span class="count">{pending}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
          <ul>
            <li>
              <a href="/" class="nav-item">
                <Icon name="external" />
                View blog
              </a>
            </li>
          </ul>
        </nav>
        <div class="sidebar-foot">
          <ThemeSwitch theme={theme} back={path} />
          <form method="post" action="/auth/logout" class="signout">
            <input type="hidden" name="_csrf" value={session.csrf} />
            <span class="who">{session.name || "Signed in"}</span>
            <button type="submit" class="btn btn-ghost btn-sm">
              <Icon name="logOut" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div class="admin-main">
        <header class="admin-topbar">
          <label for="nav-toggle" class="icon-btn nav-open" aria-label="Open navigation">
            <Icon name="menu" />
          </label>
        </header>
        <main class="admin-content">{children}</main>
      </div>
      <script src="/admin.js" defer></script>
    </body>
  </Document>
);

export const PageHeader: FC<{ title: string; description?: string; children?: Child }> = ({
  title,
  description,
  children,
}) => (
  <div class="page-header">
    <div>
      <h1>{title}</h1>
      {description && <p class="muted">{description}</p>}
    </div>
    {children && <div class="actions">{children}</div>}
  </div>
);

export const Callout: FC<{ tone: "success" | "warning" | "danger" | "info"; title?: string; children: Child }> = ({
  tone,
  title,
  children,
}) => {
  const icon: Record<string, IconName> = { success: "circleCheck", warning: "alert", danger: "circleX", info: "info" };
  return (
    <div class={`callout callout-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon[tone]} />
      <div>
        {title && <p class="callout-title">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
};

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}
