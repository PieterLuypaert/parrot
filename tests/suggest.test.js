import { describe, expect, test } from "bun:test";
import { distance, hintsFrom, namesFrom, scriptsFrom, shellQuote, suggest } from "../mods/parrot/suggest.js";

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

describe("namesFrom", () => {
  test("splits the hook's names into aliases, functions and commands", () => {
    expect(namesFrom("a:gst\nf:mkcd\nc:git\nc:grep\n\n")).toEqual({ aliases: ["gst"], functions: ["mkcd"], commands: ["git", "grep"] });
  });
});

describe("hintsFrom", () => {
  test("takes git's own suggestion for a misspelled subcommand, keeping the rest of the line", () => {
    const output = "$ git comit -m 'x'\ngit: 'comit' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tcommit\n$ ";
    expect(hintsFrom(output, "git comit -m 'x'")).toEqual([{ command: "git commit -m 'x'", why: "git's own suggestion" }]);
  });

  test("takes pnpm's and npm's Did you mean", () => {
    expect(hintsFrom('$ pnpm tset\n ERR_PNPM_NO_SCRIPT  Command "tset" not found. Did you mean "pnpm run test"?', "pnpm tset"))
      .toEqual([{ command: "pnpm run test", why: "pnpm's own suggestion" }]);
    const npm = '$ npm run tset\nnpm error Missing script: "tset"\nnpm error\nnpm error Did you mean this?\nnpm error   npm test # run the "test" package script\n';
    expect(hintsFrom(npm, "npm run tset")).toEqual([{ command: "npm test", why: "npm's own suggestion" }]);
  });

  test("never takes an older command's hint above the line that failed", () => {
    const output = "$ git comit\nThe most similar command is\n\tcommit\n$ git sttaus\n";
    expect(hintsFrom(output, "git sttaus")).toEqual([]);
  });
});

describe("suggest", () => {
  const history = ["git status", "git status", "git commit -m x", "git push", "pnpm test", "ls -la"];

  test("puts the tool's own hint first", () => {
    const hints = [{ command: "git commit -m x", why: "git's own suggestion" }];
    expect(suggest({ line: "git comit -m x", hints, history })[0]).toEqual(hints[0]);
  });

  test("finds a whole line you ran before", () => {
    expect(suggest({ line: "gti statsu", history })[0]).toEqual({ command: "git status", why: "you ran it before" });
  });

  test("fixes a command you use and keeps your arguments", () => {
    expect(suggest({ line: "gti log --oneline", history })[0]).toEqual({ command: "git log --oneline", why: "you use it" });
  });

  test("splits two words typed as one", () => {
    expect(suggest({ line: "gitst", history }).map((s) => s.command)).toContain("git status");
  });

  test("suggests a project script for a misspelled one", () => {
    const scripts = [{ name: "tests", command: "pnpm tests", why: "a script in package.json" }];
    expect(suggest({ line: "tetsts", scripts })[0]).toEqual({ command: "pnpm tests", why: "a script in package.json" });
  });

  test("offers a command on your PATH only when it is a letter off", () => {
    const commands = ["nice", "git", "grep", "docker"];
    expect(suggest({ line: "gitce", history, commands }).map((s) => s.command)).not.toContain("nice");
    expect(suggest({ line: "dokcer ps", commands })[0]).toEqual({ command: "docker ps", why: "a command on your PATH" });
  });

  test("gives at most three, and nothing for a word far from everything", () => {
    expect(suggest({ line: "gi", history: ["git", "go", "gh", "gc", "gx"] }).length).toBeLessThanOrEqual(3);
    expect(suggest({ line: "ddev up", history, commands: ["git"] })).toEqual([]);
    expect(suggest({ line: "   ", history })).toEqual([]);
  });

  test("never suggests the line itself or a private function", () => {
    expect(suggest({ line: "git", history: ["git"], functions: ["_git"] })).toEqual([]);
  });
});

describe("shellQuote", () => {
  test("keeps a command one shell word, quotes and all", () => {
    expect(shellQuote("git commit -m 'it works'")).toBe(`'git commit -m '\\''it works'\\'''`);
    expect(shellQuote("a && b | c")).toBe("'a && b | c'");
  });
});
