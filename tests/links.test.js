import { describe, expect, test } from "bun:test";
import { fileTarget, filePlaces, isFileRef, linkTarget, linkify, terminalsBlock } from "../mods/parrot/links.js";

describe("isFileRef", () => {
  test("knows a file name, with or without a line and a column", () => {
    for (const ref of ["src/orders.ts:42", "package.json", ".env", ".env.example", "docker-compose.yml", "main.go:12:5", "./scripts/run.sh",
      "~/.zshrc", "/etc/hosts.conf", "apps/web/src/@types/index.d.ts"]) {
      expect([ref, isFileRef(ref)]).toEqual([ref, true]);
    }
  });

  test("takes no command, version, branch, remote, flag or web address for one", () => {
    for (const ref of ["git push", "origin/main", "v1.2.3", "1.5", "e.g.", "-u", "node_modules", "git@github.com:you/shop.git",
      "https://example.dev/a.js", "foo.bar()", "pnpm-lock"]) {
      expect([ref, isFileRef(ref)]).toEqual([ref, false]);
    }
  });
});

describe("fileTarget and filePlaces", () => {
  test("splits the line and column off", () => {
    expect(fileTarget("src/orders.ts:42:7")).toEqual({ path: "src/orders.ts", line: 42, column: 7 });
    expect(fileTarget("package.json")).toEqual({ path: "package.json", line: null, column: null });
  });

  test("looks from the terminal's folder first, then the project's root", () => {
    const where = { cwd: "/code/shop/apps/api", root: "/code/shop", home: "/home/me" };
    expect(filePlaces("src/a.ts", where)).toEqual(["/code/shop/apps/api/src/a.ts", "/code/shop/src/a.ts"]);
    expect(filePlaces("./a.ts", { ...where, cwd: "/code/shop" })).toEqual(["/code/shop/a.ts"]);
    expect(filePlaces("~/.zshrc", where)).toEqual(["/home/me/.zshrc"]);
    expect(filePlaces("/etc/hosts", where)).toEqual(["/etc/hosts"]);
  });
});

describe("linkify", () => {
  test("links a file name in code, a terminal it knows and a bare web address", () => {
    const text = "The order total is set in `src/orders.ts:42`. The api runs in terminal:t89, see https://docs.example.dev/x.";
    expect(linkify(text, { terminals: { t89: "pnpm dev in api" } })).toBe(
      "The order total is set in [`src/orders.ts:42`](parrot-file:src%2Forders.ts%3A42). The api runs in "
      + "[→ pnpm dev in api](parrot-terminal:t89), see <https://docs.example.dev/x>.",
    );
  });

  test("leaves commands in code, unknown terminals and existing links alone", () => {
    const text = "Run `git push` in terminal:t1. See [the docs](https://x.dev/a) or [`a.ts`](https://x.dev/a.ts).";
    expect(linkify(text, { terminals: {} })).toBe(text);
  });
});

describe("linkTarget", () => {
  test("reads a file, a terminal or a web page, and nothing else", () => {
    expect(linkTarget("parrot-file:src%2Forders.ts%3A42")).toEqual({ kind: "file", value: "src/orders.ts:42" });
    expect(linkTarget("parrot-terminal:t89")).toEqual({ kind: "terminal", value: "t89" });
    expect(linkTarget("https://x.dev/a")).toEqual({ kind: "web", value: "https://x.dev/a" });
    expect(linkTarget("file:///etc/passwd")).toBeNull();
    expect(linkTarget("javascript:alert(1)")).toBeNull();
  });
});

describe("terminalsBlock", () => {
  test("lists the terminals for your Claude, the watched one marked", () => {
    expect(terminalsBlock([
      { address: "t7", running: "zsh", folder: "shop-api", watched: true },
      { address: "t9", running: "pnpm dev", folder: "web" },
    ])).toBe("<terminals>\nt7: zsh in shop-api (the one the question comes from)\nt9: pnpm dev in web\n</terminals>");
    expect(terminalsBlock([])).toBe("");
  });
});
