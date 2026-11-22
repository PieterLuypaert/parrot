import { describe, expect, test } from "bun:test";
import { alertFor, headline, isOwn, parseEvent, questionFor, reaction } from "../mods/parrot/events.js";

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

  test("ignores its own parrot-put and empty lines", () => {
    expect(isOwn(event(0, " parrot-put 'git status'"))).toBe(true);
    expect(reaction(event(1, " parrot-put 'x'"), null)).toBeNull();
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

  test("keeps the terminal, the suggestions and what kind of error it is", () => {
    const alert = alertFor(event(127, "gti"), { terminal: "t1", id: "a", suggestions: [{ command: "git", why: "x" }] });
    expect(alert).toMatchObject({ terminal: "t1", kind: "not-found", suggestions: [{ command: "git" }] });
  });
});
