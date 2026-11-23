import { describe, expect, test } from "bun:test";
import { KEEP_RUNS, afterLine, alertFor, headline, isOwn, isPredicate, notFound, parseEvent, questionFor, reaction, runOutcome, wantsClaude, withRun } from "../mods/parrot/events.js";

describe("afterLine", () => {
  test("is the output after the last time the line was typed, however it was spaced", () => {
    expect(afterLine("$ git  stauts\nold\n$ git stauts\nnew", "git  stauts")).toBe("\nnew");
    expect(afterLine("no line here", "ls")).toBe("no line here");
  });
});

describe("notFound", () => {
  test("is a command zsh itself could not find", () => {
    expect(notFound({ code: 127, cmd: "gitce" }, "$ gitce\nzsh: command not found: gitce\n")).toBe(true);
  });

  test("is not a script that ended with 127 because a program it calls is missing", () => {
    expect(notFound({ code: 127, cmd: "npm run lint" }, "$ npm run lint\nsh: eslint: command not found\n")).toBe(false);
    expect(alertFor({ pid: 1, code: 127, cmd: "npm run lint", cwd: "/x" }, { terminal: "t1", id: "a", output: "$ npm run lint\nsh: eslint: command not found" }).kind).toBe("failed");
  });
});

describe("isPredicate", () => {
  test("knows commands whose exit code 1 is an answer", () => {
    for (const cmd of ["grep TODO src/a.js", "cat a | grep x", "test -f x", "[[ -d x ]]", "diff a b", "git diff --quiet", "make && rg foo"]) {
      expect(isPredicate(cmd)).toBe(true);
    }
    for (const cmd of ["pnpm test", "grep x a | wc -l", "git push"]) expect(isPredicate(cmd)).toBe(false);
  });

  test("keeps the parrot calm when one says no", () => {
    expect(reaction({ pid: 1, code: 1, cmd: "grep TODO src/a.js" }, null)).toBeNull();
    expect(reaction({ pid: 1, code: 2, cmd: "grep -Q x" }, null)).toBe("alarm");
  });
});

describe("wantsClaude", () => {
  test("asks after a command zsh could not find, and after a command used wrong", () => {
    expect(wantsClaude({ code: 127, cmd: "gitce" }, "")).toBe(true);
    expect(wantsClaude({ code: 1, cmd: "git statsu" }, "$ git statsu\ngit: 'statsu' is not a git command. See 'git --help'.")).toBe(true);
    expect(wantsClaude({ code: 1, cmd: "pnpm tset" }, '$ pnpm tset\n ERR_PNPM_NO_SCRIPT  Command "tset" not found.')).toBe(true);
    expect(wantsClaude({ code: 2, cmd: "ls --colr" }, "$ ls --colr\nls: unrecognized option '--colr'\nusage: ls [-@ABC]")).toBe(true);
  });

  test("leaves a failing test run or build to Ask Parrot why", () => {
    expect(wantsClaude({ code: 1, cmd: "pnpm test" }, "$ pnpm test\n FAIL  src/orders.test.ts\n 1 failed, 41 passed")).toBe(false);
    expect(wantsClaude({ code: 1, cmd: "git status" }, "$ git sttaus\nusage: git\n$ git status\nfatal: not a git repository")).toBe(false);
  });
});

const event = (code, cmd = "pnpm db:migrate", pid = 10) => ({ pid, code, cmd, cwd: "/code/shop", ms: 5, at: 1 });

describe("parseEvent", () => {
  test("reads the hook's line", () => {
    const line = '{"pid":10,"code":1,"cmd":"echo \\"a\\" | grep -q x","cwd":"/x","ms":3,"at":1795382067.04}';
    expect(parseEvent(`${line}\n`)).toMatchObject({ pid: 10, code: 1, cmd: 'echo "a" | grep -q x' });
  });

  test("is null for a half-written or foreign file", () => {
    expect(parseEvent('{"pid":10,"code":')).toBeNull();
    expect(parseEvent('{"hello":1}')).toBeNull();
    expect(parseEvent("")).toBeNull();
  });
});

describe("reaction", () => {
  test("startles at a command that failed or that zsh could not find", () => {
    expect(reaction(event(1), null)).toBe("alarm");
    expect(reaction(event(127, "gitce"), null)).toBe("alarm");
  });

  test("dances when the next command in that terminal works", () => {
    const alert = alertFor(event(1), { terminal: "t1", id: "a" });
    expect(reaction(event(0), alert)).toBe("dance");
    expect(reaction(event(0, "ls", 99), alert)).toBeNull();
  });

  test("lets Ctrl-C, a closed pipe and Ctrl-Z pass, and clears the alarm there", () => {
    const alert = alertFor(event(1), { terminal: "t1", id: "a" });
    for (const code of [130, 141, 148]) {
      expect(reaction(event(code), null)).toBeNull();
      expect(reaction(event(code), alert)).toBe("clear");
    }
  });

  test("ignores its own print -z and empty lines", () => {
    expect(isOwn(event(0, " print -z -- 'git status'"))).toBe(true);
    expect(isOwn(event(0, "printf '%s' -z"))).toBe(false);
    expect(reaction(event(1, " print -z -- 'x'"), null)).toBeNull();
    expect(reaction(event(1, "   "), null)).toBeNull();
    expect(reaction(null, null)).toBeNull();
  });
});

describe("the alert", () => {
  test("says what went wrong in a line", () => {
    expect(headline(alertFor(event(127, "gitce status"), { terminal: "t1", id: "a" }))).toBe("zsh: command not found: gitce");
    expect(headline(alertFor(event(1), { terminal: "t1", id: "a" }))).toBe("pnpm db:migrate failed with exit code 1");
  });

  test("asks Claude about it with the command and its exit code", () => {
    expect(questionFor(alertFor(event(127, "ddev up"), { terminal: "t1", id: "a" }))).toContain("`ddev up`");
    expect(questionFor(alertFor(event(2), { terminal: "t1", id: "a" }))).toContain("exit code 2");
  });

  test("asks in the language you chat in, and in English for one it does not know", () => {
    const failed = alertFor(event(2, "pnpm test"), { terminal: "t1", id: "a" });
    expect(questionFor(failed, "nl")).toBe("`pnpm test` faalde met exitcode 2. Waarom, en hoe los ik het op? De output staat in de terminal.");
    expect(questionFor(alertFor(event(127, "gti"), { terminal: "t1", id: "a" }), "de")).toContain("findet diesen Befehl nicht");
    expect(questionFor(failed, "ja")).toBe(questionFor(failed, "en"));
  });

  test("keeps the terminal, the suggestions and what kind of error it is", () => {
    const alert = alertFor(event(127, "gti"), { terminal: "t1", id: "a", suggestions: [{ command: "git", why: "x" }] });
    expect(alert).toMatchObject({ terminal: "t1", kind: "not-found", suggestions: [{ command: "git" }] });
  });
});

describe("runOutcome", () => {
  const run = { pid: 42, line: "pnpm install && pnpm test", sentAt: 1000_000, state: "sent" };
  const report = (code, cmd = run.line, at = 1001, pid = 42) => ({ pid, code, cmd, at, cwd: "/code" });

  test("reads how the line parrot ran ended", () => {
    expect(runOutcome(run, report(0))).toEqual({ state: "done", code: 0 });
    expect(runOutcome(run, report(1))).toEqual({ state: "failed", code: 1 });
    expect(runOutcome(run, report(130))).toEqual({ state: "stopped", code: 130 });
  });

  test("ignores another line, another terminal, an older report, or a run that ended", () => {
    expect(runOutcome(run, report(0, "ls"))).toBeNull();
    expect(runOutcome(run, report(0, run.line, 1001, 7))).toBeNull();
    expect(runOutcome(run, report(0, run.line, 900))).toBeNull();
    expect(runOutcome({ ...run, state: "done" }, report(1))).toBeNull();
  });
});

describe("withRun", () => {
  test("keeps a run by the block it came from, replacing an earlier run of that block", () => {
    const first = withRun({}, { key: "a", sentAt: 1, state: "done" });
    const again = withRun(first, { key: "a", sentAt: 2, state: "sent" });
    expect(Object.keys(again)).toEqual(["a"]);
    expect(again.a.state).toBe("sent");
  });

  test("keeps only the last runs", () => {
    let runs = {};
    for (let i = 0; i < KEEP_RUNS + 5; i++) runs = withRun(runs, { key: `k${i}`, sentAt: i, state: "done" });
    expect(Object.keys(runs)).toHaveLength(KEEP_RUNS);
    expect(runs.k0).toBeUndefined();
  });
});
