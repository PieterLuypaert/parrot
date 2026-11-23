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

// The print -z parrot sends to put a command on the prompt is its own, not yours.
export function isOwn(event) {
  return /^\s*print -z -- /.test(event.cmd);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = (line) => String(line ?? "").trim().split(/\s+/).filter(Boolean);

// The output after the line you typed, found however many spaces separate its words, so an older
// command's text above it never counts for this one. A match right after ": " or a quote is an
// error message quoting the command ("command not found: gitce"), not the prompt. Without the line,
// all of it.
export function afterLine(output, line) {
  const text = String(output ?? "");
  const parts = words(line);
  if (!parts.length) return text;
  let last = null;
  for (const found of text.matchAll(new RegExp(parts.map(escapeRegExp).join("[ \\t]+"), "g"))) {
    const before = text.slice(text.lastIndexOf("\n", found.index) + 1, found.index);
    if (!/(:\s|['"`])$/.test(before)) last = found;
  }
  return last ? text.slice(last.index + last[0].length) : text;
}

// A command zsh itself could not find. Exit code 127 alone is not enough: a script that calls a
// missing program ends with 127 too, and then the command you typed was right.
export function notFound(event, output) {
  if (event.code !== NOT_FOUND) return false;
  const after = afterLine(output, event.cmd);
  // Without "not found" in the output (it could not be read), zsh is the likely one.
  if (!/not found/i.test(after)) return true;
  const word = words(event.cmd)[0] ?? "";
  return new RegExp(`command not found: ${escapeRegExp(word)}(\\s|$)`).test(after);
}

// Commands whose exit code 1 is an answer, not an error: no match, a difference, a test that said no.
const PREDICATES = ["grep", "egrep", "fgrep", "rg", "ag", "test", "[", "[[", "diff", "cmp", "pgrep", "which", "whence", "type"];
const GIT_PREDICATES = ["--quiet", "--exit-code", "--is-ancestor", "--verify"];

export function isPredicate(cmd) {
  const last = String(cmd ?? "").split(/\|\||&&|;|\|/).pop();
  const [first, ...rest] = words(last);
  if (PREDICATES.includes(first)) return true;
  return first === "git" && rest.some((word) => GIT_PREDICATES.includes(word));
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
  if (event.code === 1 && isPredicate(event.cmd)) return null;
  return "alarm";
}

// Output that says the command itself was wrong, rather than what it did: those are worth a
// suggestion. A test run or a build that fails is not.
const USAGE = /not a git command|unknown (?:command|subcommand|option|flag|argument)|unrecognized (?:option|argument|command)|invalid (?:option|choice|argument|command)|missing script|command "[^"]+" not found|did you mean|no such (?:command|subcommand)|usage:/i;

// Your Claude is asked what you meant after a command zsh could not find, and after one whose
// output says it was used wrong.
export function wantsClaude(event, output) {
  if (notFound(event, output)) return true;
  return USAGE.test(afterLine(output, event.cmd));
}

export function alertFor(event, { terminal, suggestions = [], id, output }) {
  return {
    id,
    pid: event.pid,
    terminal,
    code: event.code,
    cmd: event.cmd,
    cwd: event.cwd,
    kind: notFound(event, output) ? "not-found" : "failed",
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
