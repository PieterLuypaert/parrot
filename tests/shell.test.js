import { describe, expect, test } from "bun:test";
import { MAX_COMMANDS, commandOf, isRisky, scriptsFrom, segments, shellQuote } from "../mods/parrot/shell.js";

const commandsOf = (answer) => segments(answer).flatMap((piece) => (piece.lines ?? []).map((line) => line.command).filter(Boolean));

describe("segments", () => {
  test("splits an answer into its text and its code blocks, in order", () => {
    const answer = "Drop the slash:\n\n```bash\nls nope-parrot-test\n```\n\nOr make it:\n\n```\nmkdir -p ~/nope\ncd ~/nope\n```";
    expect(segments(answer).map((piece) => piece.type)).toEqual(["text", "code", "text", "code"]);
    expect(commandsOf(answer)).toEqual(["ls nope-parrot-test", "mkdir -p ~/nope", "cd ~/nope"]);
    expect(segments(answer)[1]).toMatchObject({ language: "bash", lines: [{ text: "ls nope-parrot-test", command: "ls nope-parrot-test" }] });
  });

  test("keeps a block's comments and output as lines, without a button", () => {
    const block = segments("```console\n$ git status\nOn branch main\n```")[0];
    expect(block.lines).toEqual([{ text: "$ git status", command: "git status" }, { text: "On branch main", command: null }]);
  });

  test("gives code in other languages no commands, and an answer without code one text piece", () => {
    expect(commandsOf("```js\nconsole.log(1)\n```\n```json\n{\"a\": 1}\n```")).toEqual([]);
    expect(segments("Just `ls` here.")).toEqual([{ type: "text", text: "Just `ls` here." }]);
  });

  test("gives at most six commands a button", () => {
    const many = "```bash\n" + Array.from({ length: 10 }, (_, i) => `echo ${i}`).join("\n") + "\n```";
    expect(commandsOf(many)).toHaveLength(MAX_COMMANDS);
    expect(segments(many)[0].lines).toHaveLength(10);
  });
});

describe("commandOf", () => {
  test("drops a leading $, comments and empty lines", () => {
    expect(commandOf("$ docker compose up -d db", "sh")).toBe("docker compose up -d db");
    expect(commandOf("# start the db", "bash")).toBeNull();
    expect(commandOf("   ", "")).toBeNull();
    expect(commandOf("ls", "python")).toBeNull();
  });
});

describe("isRisky", () => {
  test("marks commands that delete, overwrite or push", () => {
    for (const cmd of ["rm -rf node_modules", "git push --force", "git push -f origin main", "git reset --hard HEAD~1", "git clean -fd",
      "pnpm prisma migrate reset", "docker system prune -a", "sudo rm /etc/hosts", "echo x > .env", "psql -c 'DROP TABLE users'"]) {
      expect(isRisky(cmd)).toBe(true);
    }
  });

  test("leaves everyday commands unmarked", () => {
    for (const cmd of ["ls -la", "git status", "git push", "pnpm test", "docker compose up -d", "echo hi >> log.txt", "grep x a 2>&1"]) {
      expect(isRisky(cmd)).toBe(false);
    }
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

describe("shellQuote", () => {
  test("keeps a command one shell word, quotes and all", () => {
    expect(shellQuote("git commit -m 'it works'")).toBe(`'git commit -m '\\''it works'\\'''`);
    expect(shellQuote("a && b | c")).toBe("'a && b | c'");
  });
});
