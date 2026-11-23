import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const mark = "# parrot: tells parrot how each command ended";
const layout = {
  id: "root", type: "column",
  children: [
    { id: "tabs-row", type: "row", size: { px: 42 }, children: [{ id: "tabs", type: "block", size: { weight: 1 }, content: { mod: "tabs" } }, { id: "chartroom-button", type: "block" }] },
    { id: "work", type: "block", content: { mod: "terminals-pane" } },
  ],
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));

// An installed parrot in a folder of its own: the app's home with a layout that has the button,
// keys, a linked mod and shared state, a ~/.zshrc that loads the hook, and ~/.parrot. Nothing
// outside it is touched: HOME points into it, and herdr-app is a stand-in that writes down what it
// was asked, the app open or closed as `appOpen` says, and parrot there answering or not.
function installed({ appOpen = false, answers = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "parrot-uninstall-"));
  const home = join(root, "home");
  const app = join(home, ".config", "herdr-app");
  const zdot = join(root, "zdot");
  for (const dir of [join(app, "layouts"), join(app, "mods"), zdot, join(home, ".parrot", "events"), join(root, "bin")]) mkdirSync(dir, { recursive: true });
  const added = Bun.spawnSync(["jq", "-c", "-f", join(repo, "layout.jq")], { stdin: Buffer.from(JSON.stringify(layout)) });
  write(join(app, "layouts", "main-safe.json"), added.stdout.toString());
  write(join(app, "layouts", "plain.json"), layout);
  write(join(app, "keys.json"), { global: { "cmd-alt-p": "parrot.toggle", "cmd-alt-shift-p": "parrot.chat", "cmd-k": "palette.open" } });
  write(join(app, "shared.json"), { layout: "main-safe", "parrot.on": true, "parrot.chats": { "/code/shop": { messages: [] } } });
  symlinkSync(join(repo, "mods", "parrot"), join(app, "mods", "parrot"));
  write(join(zdot, ".zshrc"), `export EDITOR=vim\n\n[ -f "${repo}/hook.zsh" ] && source "${repo}/hook.zsh"  ${mark}\n`);
  write(join(home, ".parrot", "off"), "");
  write(join(home, ".parrot", "events", "123.json"), "{}");
  const calls = join(root, "calls");
  const herdr = join(root, "bin", "herdr-app");
  const answer = answers ? '{"ok": true}' : '{"error": "unknown command"}';
  write(herdr, `#!/bin/sh\necho "$*" >> "${calls}"\n[ "$1" = status ] && exit ${appOpen ? 0 : 1}\necho '${answer}'\nexit 0\n`);
  chmodSync(herdr, 0o755);
  return { root, home, app, zdot, calls, herdr };
}

function uninstall(place) {
  const run = Bun.spawnSync(["sh", join(repo, "uninstall.sh")], {
    env: { PATH: process.env.PATH, HOME: place.home, ZDOTDIR: place.zdot, HERDR_APP_BIN: place.herdr },
  });
  return { code: run.exitCode, out: run.stdout.toString() + run.stderr.toString() };
}

describe("uninstall.sh", () => {
  test("undoes everything install.sh did, keeping each changed file beside it", () => {
    const place = installed();
    const { code, out } = uninstall(place);
    expect(code).toBe(0);
    expect(json(join(place.app, "layouts", "main-safe.json"))).toEqual(layout);
    expect(json(join(place.app, "keys.json"))).toEqual({ global: { "cmd-k": "palette.open" } });
    expect(existsSync(join(place.app, "mods", "parrot"))).toBe(false);
    expect(readFileSync(join(place.zdot, ".zshrc"), "utf8")).toBe("export EDITOR=vim\n");
    expect(existsSync(join(place.home, ".parrot"))).toBe(false);
    expect(json(join(place.app, "shared.json"))).toEqual({ layout: "main-safe" });
    const kept = [...readdirSync(join(place.app, "layouts")), ...readdirSync(place.app), ...readdirSync(place.zdot)];
    for (const name of ["main-safe.json.old-", "keys.json.backup-", "shared.json.backup-", ".zshrc.backup-"]) {
      expect(kept.some((file) => file.startsWith(name))).toBe(true);
    }
    expect(out).toContain("Parrot is out.");
  });

  test("leaves layouts without the button, other keys and other mods alone", () => {
    const place = installed();
    write(join(place.app, "keys.json"), { global: { "cmd-alt-p": "chartroom.open" } });
    const mod = join(place.app, "mods", "parrot");
    Bun.spawnSync(["rm", mod]);
    mkdirSync(mod);
    const { code } = uninstall(place);
    expect(code).toBe(0);
    expect(json(join(place.app, "layouts", "plain.json"))).toEqual(layout);
    expect(readdirSync(join(place.app, "layouts")).some((file) => file.startsWith("plain.json.old-"))).toBe(false);
    expect(json(join(place.app, "keys.json"))).toEqual({ global: { "cmd-alt-p": "chartroom.open" } });
    expect(lstatSync(mod).isDirectory()).toBe(true);
  });

  test("asks the open app to clear parrot's state, and leaves shared.json to it", () => {
    const place = installed({ appOpen: true });
    const { out } = uninstall(place);
    expect(readFileSync(place.calls, "utf8")).toContain("do parrot.forget");
    expect(out).toContain("parrot's chats and state are cleared");
    expect(json(join(place.app, "shared.json"))["parrot.on"]).toBe(true);
  });

  test("says so when the open app has no parrot to clear its state", () => {
    const place = installed({ appOpen: true, answers: false });
    const { code, out } = uninstall(place);
    expect(code).toBe(0);
    expect(out).toContain("parrot did not answer");
  });

  test("keeps a parrot folder that holds files of someone else's", () => {
    const place = installed();
    write(join(place.home, ".parrot", "notes.txt"), "mine");
    uninstall(place);
    expect(existsSync(join(place.home, ".parrot", "notes.txt"))).toBe(true);
  });

  test("can run again with nothing left to do", () => {
    const place = installed();
    uninstall(place);
    const again = uninstall(place);
    expect(again.code).toBe(0);
    expect(again.out).toContain("none has the button");
  });
});
