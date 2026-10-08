import type { FC } from "hono/jsx";
import type { Env, Theme } from "../env";
import { Callout, Document } from "./layout";
import { Icon, Logo } from "./icons";

export const SignInPage: FC<{ env: Env; theme: Theme; error?: string }> = ({ env, theme, error }) => (
  <Document env={env} theme={theme} title="Sign in">
    <body class="signin">
      <main>
        <div class="signin-brand">
          <Logo size={36} />
          <span>{env.SITE_NAME}</span>
        </div>
        <div class="card signin-card">
          <h1>Sign in to {env.SITE_NAME}</h1>
          <p class="muted">Write and moderate posts.</p>
          <div class="stack">
            {error && <Callout tone="danger">{error}</Callout>}
            <a href="/auth/login" class="btn btn-primary btn-lg">
              <Icon name="logIn" />
              Continue with Heimdall
            </a>
          </div>
        </div>
      </main>
    </body>
  </Document>
);
