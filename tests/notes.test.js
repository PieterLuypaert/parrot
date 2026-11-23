import { describe, expect, test } from "bun:test";
import { HOOK_MARK, hookPath, noteFor } from "../mods/parrot/notes.js";

describe("hookPath", () => {
  test("finds the hook from the line install.sh writes", () => {
    const rc = `export PATH="$HOME/bin:$PATH"\n\n[ -f "/code/parrot/hook.zsh" ] && source "/code/parrot/hook.zsh"  ${HOOK_MARK}\n`;
    expect(hookPath(rc)).toBe("/code/parrot/hook.zsh");
  });

  test("finds none in a ~/.zshrc without it, or with the line commented out", () => {
    expect(hookPath("alias g=git\n")).toBeNull();
    expect(hookPath(`# [ -f "/code/parrot/hook.zsh" ] && source "/code/parrot/hook.zsh"  ${HOOK_MARK}`)).toBeNull();
    expect(hookPath(null)).toBeNull();
  });
});

describe("noteFor", () => {
  test("says hello and how to use it", () => {
    const note = noteFor({ kind: "welcome" });
    expect(note.title).toBe("Hi, I'm Parrot");
    expect(note.action).toEqual({ kind: "dismiss", label: "Got it" });
  });

  test("offers to load the hook in a terminal opened before the install", () => {
    expect(noteFor({ kind: "no-hook", hook: "/code/parrot/hook.zsh" }).action.kind).toBe("load-hook");
  });

  test("points to install.sh when ~/.zshrc loads no hook", () => {
    const note = noteFor({ kind: "no-hook", hook: null });
    expect(note.lines.join(" ")).toContain("./install.sh");
    expect(note.action.kind).toBe("dismiss");
  });

  test("names a shell it cannot hear", () => {
    expect(noteFor({ kind: "not-zsh", shell: "bash" }).title).toBe("I can't hear bash");
  });
});
