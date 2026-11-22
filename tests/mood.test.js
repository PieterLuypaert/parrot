import { describe, expect, test } from "bun:test";
import { SLEEP_AFTER, activity, blinkGap, frame, mood, runsCommand, watched } from "../mods/parrot/mood.js";

const zsh = { key: "shell", name: "zsh", shell: true, agent: false };
const node = { key: "program", name: "node", shell: false, agent: false };
const claude = { key: "claude", name: "Claude Code", shell: false, agent: true };

describe("watched", () => {
  const list = [
    { address: "t1", program: zsh },
    { address: "t2", program: claude },
  ];

  test("is the focused shell", () => {
    expect(watched({ terminal: "t1", agent: null }, list)?.address).toBe("t1");
  });

  test("leaves agent panes alone", () => {
    expect(watched({ terminal: "t2", agent: "t2" }, list)).toBeNull();
    expect(watched({ terminal: "t2", agent: null }, list)).toBeNull();
  });

  test("is nothing when nothing has the focus or the terminal is gone", () => {
    expect(watched(null, list)).toBeNull();
    expect(watched({ terminal: null }, list)).toBeNull();
    expect(watched({ terminal: "t9" }, list)).toBeNull();
  });
});

describe("runsCommand", () => {
  test("is true while another program than the shell runs in it", () => {
    expect(runsCommand({ program: node })).toBe(true);
    expect(runsCommand({ program: zsh })).toBe(false);
  });

  test("falls back on the foreground process when there is no program", () => {
    expect(runsCommand({ pid: 10, foreground: { pid: 11 } })).toBe(true);
    expect(runsCommand({ pid: 10, foreground: { pid: 10 } })).toBe(false);
    expect(runsCommand(null)).toBe(false);
  });
});

describe("mood", () => {
  test("watches while a command runs, even after a long quiet spell", () => {
    expect(mood({ terminal: { program: node }, idleFor: SLEEP_AFTER * 2 })).toBe("watch");
  });

  test("falls asleep after ten quiet minutes, and is calm before that", () => {
    expect(mood({ terminal: { program: zsh }, idleFor: SLEEP_AFTER - 1 })).toBe("calm");
    expect(mood({ terminal: { program: zsh }, idleFor: SLEEP_AFTER })).toBe("sleep");
    expect(mood({ terminal: null, idleFor: 0 })).toBe("calm");
  });

  test("shows a previewed mood above everything", () => {
    expect(mood({ terminal: { program: node }, idleFor: 0, preview: "sleep" })).toBe("sleep");
  });
});

describe("activity", () => {
  test("changes when the focus moves or another program starts", () => {
    const a = activity({ terminal: "t1" }, { program: zsh });
    expect(activity({ terminal: "t2" }, { program: zsh })).not.toBe(a);
    expect(activity({ terminal: "t1" }, { program: node })).not.toBe(a);
    expect(activity({ terminal: "t1" }, { program: zsh })).toBe(a);
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
