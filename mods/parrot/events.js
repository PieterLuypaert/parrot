// What the zsh hook reports and what the parrot does with it. No Herdr imports, so it is tested
// with bun test.

// Exit codes that are no error: stopped with Ctrl-C, a closed pipe, or suspended with Ctrl-Z.
export const QUIET = [0, 130, 141, 146, 148];
export const NOT_FOUND = 127;

// One line the hook wrote, or null when it is not one (yet).
export function parseEvent(text) {
  try {
    const event = JSON.parse(String(text ?? "").trim().split("\n").at(-1));
    if (typeof event?.pid !== "number" || typeof event?.code !== "number" || typeof event?.cmd !== "string") return null;
    return event;
  } catch {
    return null;
  }
}

// The command parrot-put ran to put a suggestion on the prompt is parrot's own, not yours.
export function isOwn(event) {
  return /^\s*parrot-put\b/.test(event.cmd);
}

// What the parrot does with a command that ended in one of the tab's terminals:
// - "alarm": it failed; `kind` says whether zsh could not find it;
// - "dance": it worked, right after one that failed there;
// - "clear": it worked, or ended quietly, and the alarm for that terminal goes;
// - null: nothing to do.
export function reaction(event, alert) {
  if (!event || isOwn(event) || !event.cmd.trim()) return null;
  const sameTerminal = alert && alert.pid === event.pid;
  if (event.code === 0) return sameTerminal ? "dance" : null;
  if (QUIET.includes(event.code)) return sameTerminal ? "clear" : null;
  return "alarm";
}

export function alertFor(event, { terminal, suggestions = [], id }) {
  return {
    id,
    pid: event.pid,
    terminal,
    code: event.code,
    cmd: event.cmd,
    cwd: event.cwd,
    kind: event.code === NOT_FOUND ? "not-found" : "failed",
    suggestions,
  };
}

// What the alert says, in a line.
export function headline(alert) {
  const word = alert.cmd.trim().split(/\s+/)[0];
  return alert.kind === "not-found" ? `zsh: command not found: ${word}` : `${alert.cmd.trim()} failed with exit code ${alert.code}`;
}

// The question "Ask Parrot" puts to Claude about the alert.
export function questionFor(alert) {
  if (alert.kind === "not-found") {
    return `I typed \`${alert.cmd.trim()}\` and zsh says it cannot find that command. What did I mean, or how do I get it?`;
  }
  return `\`${alert.cmd.trim()}\` failed with exit code ${alert.code}. Why, and how do I fix it? Its output is in the terminal.`;
}
