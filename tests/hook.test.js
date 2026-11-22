import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../mods/parrot/events.js";

const hook = join(import.meta.dir, "..", "hook.zsh");

// Runs commands in an interactive zsh with the hook, calling its hooks by hand as zsh would around
// each command.
function run(home, steps) {
  const script = [`source ${JSON.stringify(hook)}`, ...steps.map((cmd) => `_parrot_preexec ${JSON.stringify(cmd)}; ${cmd} 2>/dev/null; _parrot_precmd`)].join("\n");
  const shell = Bun.spawnSync(["zsh", "-f", "-i", "-c", script], { env: { ...process.env, PARROT_HOME: home } });
  return shell.stdout.toString() + shell.stderr.toString();
}

function eventOf(home) {
  const dir = join(home, "events");
  const file = require("node:fs").readdirSync(dir).find((name) => name.endsWith(".json"));
  return { dir, file, event: parseEvent(readFileSync(join(dir, file), "utf8")) };
}

describe("hook.zsh", () => {
  test("writes how the last command ended, as JSON, also with quotes and backslashes", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    run(home, ['echo "a\\\\b" | grep -q nothing']);
    const { event } = eventOf(home);
    expect(event).toMatchObject({ code: 1, cmd: 'echo "a\\\\b" | grep -q nothing' });
    expect(event.cwd.length).toBeGreaterThan(0);
  });

  test("after a command zsh cannot find, also writes what you might have meant", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    run(home, ["gitce status"]);
    const { dir, file, event } = eventOf(home);
    expect(event.code).toBe(127);
    const names = readFileSync(join(dir, file.replace(".json", ".names")), "utf8").split("\n");
    expect(names).toContain("git");
    expect(names).toContain("parrot-put");
  });

  test("writes nothing while parrot is off", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    writeFileSync(join(home, "off"), "");
    run(home, ["false"]);
    expect(existsSync(join(home, "events"))).toBe(false);
  });

  test("puts a command on the prompt with parrot-put, without running it", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    const out = run(home, []).trim();
    expect(out).toBe("");
    const shell = Bun.spawnSync(["zsh", "-f", "-i", "-c", `source ${JSON.stringify(hook)}; whence -w parrot-put`]);
    expect(shell.stdout.toString().trim()).toBe("parrot-put: function");
  });
});
