import { describe, expect, test } from "bun:test";
import { distance, scriptsFrom, shellQuote, suggest } from "../mods/parrot/suggest.js";

describe("distance", () => {
  test("counts added, dropped, changed and swapped letters", () => {
    expect(distance("git", "git")).toBe(0);
    expect(distance("gti", "git")).toBe(1);
    expect(distance("gitt", "git")).toBe(1);
    expect(distance("gitce", "git")).toBe(2);
    expect(distance("tetsts", "tests")).toBe(1);
    expect(distance("", "ab")).toBe(2);
  });
});

describe("scriptsFrom", () => {
  test("runs package.json's scripts with the package manager its lockfile names", () => {
    const packageJson = JSON.stringify({ scripts: { test: "vitest", "db:migrate": "prisma migrate deploy" } });
    expect(scriptsFrom({ packageJson, lockfiles: ["pnpm-lock.yaml"] }).map((s) => s.command)).toEqual(["pnpm test", "pnpm db:migrate"]);
    expect(scriptsFrom({ packageJson, lockfiles: [] })[0].command).toBe("npm run test");
    expect(scriptsFrom({ packageJson, lockfiles: ["bun.lock"] })[0].command).toBe("bun run test");
  });

  test("reads a Makefile's targets, not its variables", () => {
    const makefile = "CC := gcc\nbuild: main.o\n\tgcc\ntest:\n\t./run\n.PHONY: build\n";
    expect(scriptsFrom({ makefile }).map((s) => s.command)).toEqual(["make build", "make test"]);
  });

  test("has nothing for a broken or missing package.json", () => {
    expect(scriptsFrom({ packageJson: "{nope" })).toEqual([]);
    expect(scriptsFrom({})).toEqual([]);
  });
});

describe("suggest", () => {
  const names = ["git", "gitk", "grep", "go", "pnpm", "docker", "ls"];

  test("finds the command you meant and keeps your arguments", () => {
    expect(suggest({ line: "gti status", names })[0]).toEqual({ command: "git status", why: "a command you have" });
    expect(suggest({ line: "dokcer ps", names })[0].command).toBe("docker ps");
  });

  test("prefers what you ran before over what is merely on your PATH", () => {
    const history = ["git status", "git commit -m x", "git push"];
    expect(suggest({ line: "gitt", names, history })[0]).toEqual({ command: "git", why: "you ran it before" });
  });

  test("suggests a project script for a misspelled one", () => {
    const scripts = [{ name: "tests", command: "pnpm tests", why: "a script in package.json" }];
    expect(suggest({ line: "tetsts", names, scripts })[0]).toEqual({ command: "pnpm tests", why: "a script in package.json" });
  });

  test("gives at most three, and nothing for a word far from everything", () => {
    expect(suggest({ line: "gi", names: ["git", "go", "gh", "gc", "gx"] }).length).toBeLessThanOrEqual(3);
    expect(suggest({ line: "ddev up", names })).toEqual([]);
    expect(suggest({ line: "   ", names })).toEqual([]);
  });

  test("never suggests the word itself or a private function", () => {
    expect(suggest({ line: "git", names: ["git", "_git"] })).toEqual([]);
  });
});

describe("shellQuote", () => {
  test("keeps a command one shell word, quotes and all", () => {
    expect(shellQuote("git commit -m 'it works'")).toBe(`'git commit -m '\\''it works'\\'''`);
    expect(shellQuote("a && b | c")).toBe("'a && b | c'");
  });
});
