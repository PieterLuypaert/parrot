// The command you probably meant after a typo, found without Claude. Best first: what the tool
// itself suggested in its output, a whole line you ran before, the commands you use most, the
// project's scripts, your aliases and functions, and last a command on your PATH that is only a
// letter off. No Herdr imports, so it is tested with bun test.

export const MAX_SUGGESTIONS = 3;

// The number of single-letter edits (add, drop, change, swap two neighbours) from a to b.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const words = (line) => String(line ?? "").trim().split(/\s+/).filter(Boolean);
const squeeze = (line) => words(line).join(" ");

// How far off a typo may be: one letter for a short word, two for a longer one.
function reach(word) {
  return word.length <= 3 ? 1 : 2;
}

// How far off a whole line may be: a letter per five or so, at least one.
function lineReach(line) {
  return Math.max(1, Math.floor(line.length / 5));
}

// The project's scripts and how to run them: package.json with the package manager its lockfile
// names, and a Makefile's targets.
export function scriptsFrom({ packageJson, lockfiles = [], makefile }) {
  const scripts = [];
  try {
    const names = Object.keys(JSON.parse(packageJson ?? "{}").scripts ?? {});
    const runner = lockfiles.includes("pnpm-lock.yaml") ? "pnpm" : lockfiles.includes("yarn.lock") ? "yarn"
      : lockfiles.some((f) => f.startsWith("bun.lock")) ? "bun run" : "npm run";
    for (const name of names) scripts.push({ name, command: `${runner} ${name}`, why: "a script in package.json" });
  } catch (error) {
    scripts.push({ name: "", command: "", why: `package.json could not be read: ${error.message}` });
  }
  for (const [, target] of String(makefile ?? "").matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)) {
    scripts.push({ name: target, command: `make ${target}`, why: "a target in the Makefile" });
  }
  return scripts.filter((s) => s.name);
}

// The names the zsh hook wrote after a command it could not find: a:alias, f:function, c:command.
export function namesFrom(text) {
  const names = { aliases: [], functions: [], commands: [] };
  for (const line of String(text ?? "").split("\n")) {
    const [kind, name] = [line.slice(0, 2), line.slice(2).trim()];
    if (!name) continue;
    if (kind === "a:") names.aliases.push(name);
    else if (kind === "f:") names.functions.push(name);
    else if (kind === "c:") names.commands.push(name);
  }
  return names;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What the tool itself suggested in its output, for the line that failed: git's "The most similar
// command is", pnpm's and npm's "Did you mean", cargo's "a command with a similar name exists".
// Only the output after the line counts, so an older command's hint is never taken for this one.
export function hintsFrom(output, line) {
  const typed = squeeze(line);
  const text = String(output ?? "");
  const at = text.lastIndexOf(typed);
  const after = at >= 0 ? text.slice(at + typed.length) : text;
  const [tool] = words(typed);
  const hints = [];
  const git = after.match(/'([^']+)' is not a git command[\s\S]*?The most similar commands? (?:is|are)\s*\n((?:[ \t]+\S+[ \t]*(?:\n|$))+)/);
  if (git && tool === "git") {
    for (const fix of words(git[2])) hints.push({ command: typed.replace(new RegExp(`(^git\\s+)${escapeRegExp(git[1])}(?=\\s|$)`), `$1${fix}`), why: "git's own suggestion" });
  }
  for (const [, command] of after.matchAll(/Did you mean "([^"]+)"\?/g)) hints.push({ command, why: `${tool}'s own suggestion` });
  const npm = after.match(/Did you mean (?:this|one of these)\?\s*\n(?:npm (?:ERR!|error)\s*)?\s*([^\n#]+?)\s*(?:#|\n|$)/);
  if (npm) hints.push({ command: squeeze(npm[1]), why: "npm's own suggestion" });
  const cargo = after.match(/a command with a similar name exists: `([^`]+)`/);
  if (cargo && tool === "cargo") hints.push({ command: typed.replace(/^cargo\s+\S+/, `cargo ${cargo[1]}`), why: "cargo's own suggestion" });
  return hints.filter((hint) => hint.command && hint.command !== typed);
}

// Up to three commands you probably meant by `line`, best first, each with why parrot thinks so.
export function suggest({ line, hints = [], history = [], aliases = [], functions = [], commands = [], scripts = [] }) {
  const typed = squeeze(line);
  const [word, ...rest] = words(typed);
  if (!word) return [];
  const args = rest.join(" ");
  const withArgs = (first) => (args ? `${first} ${args}` : first);
  const found = new Map();
  const lines = new Map();
  // A line you ran exactly like this before says so, however it was found.
  const add = (command, why, score) => {
    if (!command || command === typed) return;
    const because = lines.has(command) && !why.endsWith("own suggestion") ? "you ran it before" : why;
    const known = found.get(command);
    if (!known || known.score > score) found.set(command, { command, why: because, score });
  };

  // What you ran: each line, each command, and the second words you used with each command.
  const used = new Map();
  const seconds = new Map();
  for (const entry of history) {
    const ran = squeeze(entry);
    if (!ran) continue;
    lines.set(ran, (lines.get(ran) ?? 0) + 1);
    const [first, second] = words(ran);
    used.set(first, (used.get(first) ?? 0) + 1);
    if (second && !second.startsWith("-")) {
      if (!seconds.has(first)) seconds.set(first, new Map());
      seconds.get(first).set(second, (seconds.get(first).get(second) ?? 0) + 1);
    }
  }
  const habit = (count) => Math.min(count, 50) / 100;

  // What the tool said comes first: it knows its own commands best.
  hints.forEach((hint, i) => add(hint.command, hint.why, -10 + i));

  // A whole line you ran before, a letter or two off.
  for (const [ran, count] of lines) {
    const d = distance(typed, ran);
    if (d <= lineReach(typed)) add(ran, "you ran it before", d - habit(count));
  }

  // The second word, checked against the ones you used with that command: fixed when it is a
  // letter or two off one of them, and counted as suspect when you never used it there.
  const fixSecond = (first) => {
    const known = seconds.get(first);
    const [second, ...more] = rest;
    if (!known || !second || second.startsWith("-") || known.has(second)) return { tail: rest, edits: 0, doubt: 0 };
    let best = null;
    for (const [candidate, count] of known) {
      const d = distance(second, candidate);
      if (d <= reach(second) && (!best || d - habit(count) < best.d - habit(best.count))) best = { candidate, d, count };
    }
    if (best) return { tail: [best.candidate, ...more], edits: best.d, doubt: 0 };
    return { tail: rest, edits: 0, doubt: known.size >= 2 ? 2.5 : 0 };
  };

  // A command you use, typed a letter or two off (or right), with its second word checked too.
  for (const [first, count] of used) {
    const d = first === word ? 0 : distance(word, first);
    if (d > reach(word)) continue;
    const { tail, edits, doubt } = fixSecond(first);
    if (d + edits === 0) continue;
    add([first, ...tail].join(" "), "you use it", d + edits + doubt - habit(count));
  }

  // Two words typed as one, such as gitst for git status: a command you use and a second word you
  // used with it.
  for (const [first] of used) {
    const glued = word.slice(first.length);
    if (first.length < 2 || !word.startsWith(first) || glued.length < 2) continue;
    for (const [ran, count] of lines) {
      const [ranFirst, second] = words(ran);
      if (ranFirst === first && second && (second.startsWith(glued) || distance(glued, second) <= 1)) {
        add(withArgs(`${first} ${second}`), "you ran it before", 0.5 - habit(count));
      }
    }
  }

  for (const script of scripts) {
    const d = distance(word, script.name);
    if (d <= reach(word)) add(args ? `${script.command} ${args}` : script.command, script.why, d + 0.25);
  }
  for (const [list, why] of [[aliases, "an alias of yours"], [functions, "a function of yours"]]) {
    for (const name of list) {
      if (name === word || name.startsWith("_")) continue;
      const d = distance(word, name);
      if (d <= reach(word)) add(withArgs(name), why, d + 0.4);
    }
  }
  // Anything on your PATH, only a letter off: two letters finds too many you never use.
  for (const name of commands) {
    if (name === word || used.has(name)) continue;
    if (distance(word, name) <= 1) add(withArgs(name), "a command on your PATH", 1.75);
  }

  return [...found.values()]
    .sort((a, b) => a.score - b.score || a.command.length - b.command.length)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ command, why }) => ({ command, why }));
}

// A command as one single-quoted shell word, for parrot-put.
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}
