import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

  test("after a command that failed, writes your history only for you to read, and none after Ctrl-C", () => {
    const failed = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    run(failed, ["gitce status"]);
    const { dir, file, event } = eventOf(failed);
    expect(event.code).toBe(127);
    expect(existsSync(join(dir, file.replace(".json", ".history")))).toBe(true);
    expect(existsSync(join(dir, file.replace(".json", ".names")))).toBe(false);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const stopped = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    run(stopped, ["(exit 130)"]);
    expect(existsSync(join(eventOf(stopped).dir, eventOf(stopped).file.replace(".json", ".history")))).toBe(false);
  });

  test("writes nothing while parrot is off", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    writeFileSync(join(home, "off"), "");
    run(home, ["false"]);
    expect(existsSync(join(home, "events"))).toBe(false);
  });

  test("prints nothing of its own", () => {
    const home = mkdtempSync(join(tmpdir(), "parrot-hook-"));
    expect(run(home, ["true"]).trim()).toBe("");
  });
});
