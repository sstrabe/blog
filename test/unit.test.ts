import { describe, expect, it } from "vitest";
import { renderMarkdown, safeHref } from "../src/markdown";
import { cleanText, validateComment } from "../src/comments";
import { slugify, sniffImage } from "../src/admin";
import { authorIsAllowed } from "../src/auth";
import { safeEqual } from "../src/security";
import type { Env } from "../src/env";

describe("markdown", () => {
  it("shows raw HTML as text", () => {
    const html = renderMarkdown('Hi <script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: links but keeps their text", () => {
    const html = renderMarkdown("[click](javascript:alert(1)) and [ok](https://example.com)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">ok</a>');
  });

  it("only loads images from /media/", () => {
    expect(renderMarkdown("![a](https://evil.example/x.png)")).not.toContain("<img");
    expect(renderMarkdown("![a](/media/abc.png)")).toContain('<img src="/media/abc.png" alt="a"');
  });

  it("escapes code", () => {
    expect(renderMarkdown("```\n<b>x</b>\n```")).toContain("&lt;b&gt;");
  });

  it("allows only safe link targets", () => {
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/posts/a")).toBe("/posts/a");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
});

describe("comments", () => {
  it("strips control and direction characters", () => {
    expect(cleanText(" a‮b\u0000c\r\nd ")).toBe("abc\nd");
  });

  it("validates name, length and links", () => {
    expect(validateComment("", "x")).toMatch(/name/);
    expect(validateComment("a".repeat(61), "x")).toMatch(/name/);
    expect(validateComment("Ada", "x".repeat(4001))).toMatch(/comment/);
    expect(validateComment("Ada", "https://a https://b https://c https://d")).toMatch(/links/);
    expect(validateComment("Ada", "Nice post")).toBeNull();
  });
});

describe("admin helpers", () => {
  it("makes slugs", () => {
    expect(slugify("Hello, Wörld! Straße")).toBe("hello-world-strasse");
    expect(slugify("  --  ")).toBe("");
  });

  it("recognises images by content", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.type).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });
});

describe("auth", () => {
  const env = { AUTHOR_SUBS: "abc, def", AUTHOR_ROLE: "author", OIDC_CLIENT_ID: "blog" } as Env;

  it("needs a listed sub and the role", () => {
    const role = { resource_access: { blog: { roles: ["author"] } } };
    expect(authorIsAllowed(env, { sub: "abc", ...role })).toBe(true);
    expect(authorIsAllowed(env, { sub: "def", ...role })).toBe(true);
    expect(authorIsAllowed(env, { sub: "xyz", ...role })).toBe(false);
    expect(authorIsAllowed(env, { sub: "abc" })).toBe(false);
    expect(authorIsAllowed({ ...env, AUTHOR_SUBS: "" }, { sub: "abc", ...role })).toBe(false);
  });

  it("compares secrets", async () => {
    expect(await safeEqual("token", "token")).toBe(true);
    expect(await safeEqual("token", "tokem")).toBe(false);
    expect(await safeEqual("", "")).toBe(false);
  });
});
