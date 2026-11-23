// What the parrot tells you that is no error: hello the first time, and why it cannot hear a
// terminal. No Herdr imports, so it is tested with bun test.

// The line install.sh adds to ~/.zshrc ends with this.
export const HOOK_MARK = "# parrot: tells parrot how each command ended";

// How long after a command ends the hook has to report it before parrot takes the shell as deaf.
export const HOOK_GRACE = 2500;

// The hook ~/.zshrc loads, from the line install.sh wrote there; null when it loads none.
export function hookPath(rc) {
  const line = String(rc ?? "").split("\n").find((one) => one.includes(HOOK_MARK) && !/^\s*#/.test(one));
  return line?.match(/source "([^"]+)"/)?.[1] ?? null;
}

// Whether the hook reported a command that ended after `since` (ms): when a command ends in a zsh
// and nothing comes, that shell never loaded the hook.
export function heardSince(event, since) {
  return Boolean(event && event.at * 1000 >= since - 1000);
}

// A note's title, lines and button.
export function noteFor(note) {
  if (note.kind === "welcome") {
    return {
      title: "Hi, I'm Parrot",
      lines: [
        "I watch the terminal in this tab.",
        "When a command fails, I startle. After a typo, your Claude guesses what you meant: click the guess to put it on your prompt.",
        "Click me to ask anything about this project. I only read, and change nothing.",
      ],
      hint: "⌥⌘P turns me off, ⌥⇧⌘P opens the chat.",
      action: { kind: "dismiss", label: "Got it" },
    };
  }
  if (note.kind === "no-hook" && note.hook) {
    return {
      title: "I can't hear this terminal",
      lines: ["It hasn't loaded parrot's zsh hook, often because it was open before the install, so I don't see its commands end: no startle and no guesses here yet. New terminals have it."],
      action: { kind: "load-hook", label: "Load it here" },
    };
  }
  if (note.kind === "no-hook") {
    return {
      title: "I can't hear your terminals",
      lines: ["Your ~/.zshrc doesn't load parrot's zsh hook, so I don't see commands end. Run ./install.sh in the parrot folder, then open a new terminal."],
      action: { kind: "dismiss", label: "Got it" },
    };
  }
  return {
    title: `I can't hear ${note.shell ?? "this shell"}`,
    lines: [`I hear commands end only in zsh, so in this terminal I won't startle or guess. You can still ask me anything.`],
    action: { kind: "dismiss", label: "Got it" },
  };
}
