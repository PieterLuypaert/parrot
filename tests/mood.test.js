import { describe, expect, test } from "bun:test";
import { MARGIN, SLEEP_AFTER, activity, blinkGap, corner, frame, isShell, mood, runsCommand, shows, watched } from "../mods/parrot/mood.js";

const zsh = { key: "shell", name: "zsh", shell: true, agent: false };
const node = { key: "program", name: "node", shell: false, agent: false };
const claude = { key: "claude", name: "Claude Code", shell: false, agent: true };

// Terminals as terminals() reports them: agents run in your shell, so a Claude session's argv is
// the shell too, with the agent as its program and a status.
const shell = { address: "t1", argv: ["/bin/zsh", "-l"], program: zsh, status: null };
const busy = { address: "t2", argv: ["/bin/zsh", "-l"], program: node, status: null };
const session = { address: "t3", argv: ["/bin/zsh", "-l"], program: claude, status: "idle" };
const editor = { address: "t4", argv: ["nvim"], program: { key: "nvim", name: "Neovim", shell: false, agent: false }, status: null };
const list = [shell, busy, session, editor];

describe("isShell", () => {
  test("knows a terminal started as a shell, also while a command runs in it", () => {
    expect(isShell(shell)).toBe(true);
    expect(isShell(busy)).toBe(true);
    expect(isShell({ argv: ["-zsh"] })).toBe(true);
    expect(isShell({ argv: ["/opt/homebrew/bin/fish"] })).toBe(true);
  });

  test("is false for a program started on its own", () => {
    expect(isShell(editor)).toBe(false);
  });
});

// Panes as panes() reports them: tab "a" holds a Claude session beside a shell, tab "b" only a
// Claude session, tab "c" a shell running a command and Neovim.
const panes = [
  { pane: "p3", tab: "a", terminal: "t3", status: "idle", program: claude },
  { pane: "p1", tab: "a", terminal: "t1", status: null, program: zsh },
  { pane: "p5", tab: "b", terminal: "t3", status: "idle", program: claude },
  { pane: "p2", tab: "c", terminal: "t2", status: null, program: node },
  { pane: "p4", tab: "c", terminal: "t4", status: null, program: editor.program },
  { pane: "p6", tab: "d", terminal: null, mod: "chartroom" },
];

describe("watched", () => {
  test("is the focused shell session, also while a command runs", () => {
    expect(watched({ tab: "a", terminal: "t1", agent: null }, panes, list)?.address).toBe("t1");
    expect(watched({ tab: "c", terminal: "t2", agent: null }, panes, list)?.address).toBe("t2");
  });

  test("is the tab's shell while you type to the Claude session beside it", () => {
    expect(watched({ tab: "a", terminal: "t3", agent: "t3" }, panes, list)?.address).toBe("t1");
  });

  test("is nothing in a tab with only an agent, however Herdr reports it", () => {
    expect(watched({ tab: "b", terminal: "t3", agent: "t3" }, panes, list)).toBeNull();
    expect(watched({ tab: "b", terminal: "t3", agent: null }, panes, list)).toBeNull();
    expect(watched({ tab: "a", terminal: "t1", agent: null }, panes, [{ ...shell, status: "working" }])).toBeNull();
  });

  test("is nothing for a program that is no shell, a mod pane or no focus at all", () => {
    expect(watched({ tab: "c", terminal: "t4" }, panes.filter((p) => p.terminal !== "t2"), list)).toBeNull();
    expect(watched({ tab: "d", terminal: null }, panes, list)).toBeNull();
    expect(watched(null, panes, list)).toBeNull();
    expect(watched({ tab: "a", terminal: "t9" }, [], list)).toBeNull();
  });
});

describe("shows", () => {
  test("shows the parrot while it is on and the tab has a terminal to watch", () => {
    expect(shows({ on: true, terminal: shell })).toBe(true);
  });

  test("hides it without a terminal, and while it is off", () => {
    expect(shows({ on: true, terminal: null })).toBe(false);
    expect(shows({ on: false, terminal: shell })).toBe(false);
  });
});

describe("runsCommand", () => {
  test("is true while another program than the shell runs in it", () => {
    expect(runsCommand(busy)).toBe(true);
    expect(runsCommand(shell)).toBe(false);
  });

  test("falls back on the foreground process when there is no program", () => {
    expect(runsCommand({ pid: 10, foreground: { pid: 11 } })).toBe(true);
    expect(runsCommand({ pid: 10, foreground: { pid: 10 } })).toBe(false);
    expect(runsCommand(null)).toBe(false);
  });
});

describe("mood", () => {
  test("watches while a command runs, even after a long quiet spell", () => {
    expect(mood({ terminal: busy, idleFor: SLEEP_AFTER * 2 })).toBe("watch");
  });

  test("falls asleep after ten quiet minutes, and is calm before that", () => {
    expect(mood({ terminal: shell, idleFor: SLEEP_AFTER - 1 })).toBe("calm");
    expect(mood({ terminal: shell, idleFor: SLEEP_AFTER })).toBe("sleep");
    expect(mood({ terminal: null, idleFor: 0 })).toBe("calm");
  });

  test("shows a previewed mood above everything", () => {
    expect(mood({ terminal: busy, idleFor: 0, preview: "sleep" })).toBe("sleep");
  });
});

describe("activity", () => {
  test("changes when the focus moves or another program starts", () => {
    const a = activity({ terminal: "t1" }, shell);
    expect(activity({ terminal: "t2" }, shell)).not.toBe(a);
    expect(activity({ terminal: "t1" }, busy)).not.toBe(a);
    expect(activity({ terminal: "t1" }, shell)).toBe(a);
  });
});

describe("frame", () => {
  test("shuts the eyes while blinking, in the pose of the mood", () => {
    expect(frame("calm", false)).toBe("calm");
    expect(frame("calm", true)).toBe("blink");
    expect(frame("watch", true)).toBe("watch-blink");
    expect(frame("sleep", true)).toBe("sleep");
  });

  test("waits four to seven seconds between blinks", () => {
    expect(blinkGap(() => 0)).toBe(4000);
    expect(blinkGap(() => 0.999)).toBeLessThan(7000);
  });
});

describe("corner", () => {
  const layout = {
    id: "root", type: "row",
    header: { content: { mod: "pane" }, height: 30, position: "top" },
    children: [{ id: "work", type: "column", children: [{ id: "tabs-row", type: "row", size: { px: 42 }, children: [] }] }],
  };

  test("lands in the top right corner, under the tab bar and the panes' title bars", () => {
    expect(corner(1512, layout, 104)).toEqual({ x: 1512 - 104 - MARGIN, y: 42 + 30 + 8 });
  });

  test("uses the tabs block's height without a row, and no title bar when the panes have none", () => {
    const plain = { id: "root", type: "column", children: [{ id: "tabs", type: "block", size: { px: 36 } }] };
    expect(corner(800, plain, 104).y).toBe(36 + 8);
  });

  test("ignores a title bar at the bottom and never lands left of the window", () => {
    const bottom = { ...layout, header: { ...layout.header, position: "bottom" } };
    expect(corner(1512, bottom, 104).y).toBe(42 + 8);
    expect(corner(50, layout, 104).x).toBe(0);
  });
});
