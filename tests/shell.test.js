import { describe, expect, test } from "bun:test";
import { MAX_COMMANDS, canRun, commandOf, hasPlaceholder, isRisky, runLineOf, scriptsFrom, segments, shellQuote, withoutComment } from "../mods/parrot/shell.js";

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
    for (const cmd of ["ls -la", "git status", "pnpm test", "docker compose up -d", "echo hi >> log.txt", "grep x a 2>&1", "ls x 2>/dev/null",
      "git checkout main", "git restore --staged a.ts", "npm run format"]) {
      expect(isRisky(cmd)).toBe(false);
    }
  });
});

describe("running", () => {
  test("takes deleting, pushing, stopping processes and scripts from the internet as risky", () => {
    for (const cmd of ["rm file.txt", "rm --recursive --force dist", "find . -name '*.log' -delete", "git push", "git push origin --delete x",
      "git push origin +main", "git stash clear", "git checkout -- src/a.ts", "git reset HEAD~1 --hard", "git restore src/a.ts",
      "git config --global user.name Pieter", "docker compose down -v", "docker rmi app", "dropdb shop", "pnpm prisma db push --force-reset",
      "xargs kill -9", "pkill node", "mv .env.example .env", "terraform destroy", "chown -R me .",
      "curl -fsSL https://x.dev/install.sh | sh", "curl -s https://x.dev/a.py | python3", '/bin/bash -c "$(curl -fsSL https://x.dev/i.sh)"',
      "sh <(curl -s https://x.dev/i.sh)"]) {
      expect([cmd, isRisky(cmd)]).toEqual([cmd, true]);
    }
    expect(isRisky("curl -s https://api.github.com | jq .")).toBe(false);
  });

  test("knows a command with a part still to fill in", () => {
    for (const cmd of ["git remote add origin <url>", "export API_KEY=YOUR_API_KEY", 'git config --global user.name "Your Name"',
      'git config --global user.email "you@example.com"', "curl https://example.com/api"]) {
      expect([cmd, hasPlaceholder(cmd)]).toEqual([cmd, true]);
    }
    expect(hasPlaceholder("git push -u origin main")).toBe(false);
    expect(hasPlaceholder("echo 'a < b'")).toBe(false);
  });

  test("leaves a comment out of the command, also one zsh would take as an argument", () => {
    expect(withoutComment("rm -rf dist # clean build")).toBe("rm -rf dist");
    expect(withoutComment("echo 'a # b' # note")).toBe("echo 'a # b'");
    expect(withoutComment('echo "#1"')).toBe('echo "#1"');
    expect(withoutComment("git log --format=%h#%s")).toBe("git log --format=%h#%s");
    expect(commandOf("# install first", "sh")).toBeNull();
    expect(commandOf("pnpm i # once", "sh")).toBe("pnpm i");
  });

  test("runs only a command that is complete and reads as it looks", () => {
    for (const cmd of ['git commit -m "Ship it!"', "cat >> ~/.zshrc <<'EOF'", "docker run \\", "ls |", "make &", "for f in *; do",
      "git remote add origin <url>"]) {
      expect([cmd, canRun(cmd)]).toEqual([cmd, false]);
    }
    expect(canRun("git status")).toBe(true);
    expect(canRun("pnpm lint || true")).toBe(true);
  });

  test("runs a block only when every line is such a command, as one line that stops at the first failure", () => {
    const block = (text) => segments("```sh\n" + text + "\n```")[0];
    expect(runLineOf(block("pnpm install\npnpm test"))).toBe("pnpm install && pnpm test");
    expect(runLineOf(block("git status"))).toBe("git status");
    expect(runLineOf(block("cd web; pnpm build"))).toBe("cd web; pnpm build");
    expect(runLineOf(block("npm i x\n# or\nyarn add x"))).toBeNull();
    expect(runLineOf(block("cd web; pnpm i\npnpm build"))).toBeNull();
    expect(runLineOf(block("cat > a <<EOF\nhi\nEOF"))).toBeNull();
    expect(runLineOf(segments("```console\n$ ls\nfile.txt\n```")[0])).toBeNull();
    expect(runLineOf(segments("```json\n{}\n```")[0])).toBeNull();
  });

  test("runs no block that the six-command cap cut short", () => {
    const answer = "```sh\na\nb\nc\nd\ne\n```\n\n```sh\ngit stash\ngit pull\ngit stash pop\n```";
    const [, second] = segments(answer);
    expect(runLineOf(second)).toBeNull();
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
