import { describe, expect, test } from "bun:test";
import { scriptsFrom, shellQuote } from "../mods/parrot/shell.js";

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

describe("shellQuote", () => {
  test("keeps a command one shell word, quotes and all", () => {
    expect(shellQuote("git commit -m 'it works'")).toBe(`'git commit -m '\\''it works'\\'''`);
    expect(shellQuote("a && b | c")).toBe("'a && b | c'");
  });
});
