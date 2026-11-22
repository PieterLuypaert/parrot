// The command you probably meant after zsh could not find the one you typed, found without
// Claude: in your history, your aliases and functions, the project's scripts and your PATH. No
// Herdr imports, so it is tested with bun test.

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

// How far off a typo may be: one letter for a short word, two for a longer one.
function reach(word) {
  return word.length <= 3 ? 1 : 2;
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

// Up to three commands you probably meant by `line`, best first, each with why parrot thinks so.
// `names` are your aliases, functions and the commands on your PATH; `history` your recent lines.
export function suggest({ line, names = [], history = [], scripts = [] }) {
  const [word, ...rest] = String(line ?? "").trim().split(/\s+/);
  if (!word) return [];
  const args = rest.join(" ");
  const limit = reach(word);
  const found = new Map();
  const add = (command, why, score) => {
    const known = found.get(command);
    if (!known || known.score > score) found.set(command, { command, why, score });
  };
  const withArgs = (first) => (args ? `${first} ${args}` : first);
  const used = new Map();
  for (const entry of history) {
    const first = entry.trim().split(/\s+/)[0];
    if (first) used.set(first, (used.get(first) ?? 0) + 1);
  }
  for (const [first, count] of used) {
    if (first === word) continue;
    const d = distance(word, first);
    if (d <= limit) add(withArgs(first), "you ran it before", d - Math.min(count, 20) / 100);
  }
  for (const script of scripts) {
    const d = distance(word, script.name);
    if (d <= limit) add(args ? `${script.command} ${args}` : script.command, script.why, d + 0.25);
  }
  for (const name of new Set(names)) {
    if (!name || name === word || name.startsWith("_")) continue;
    const d = distance(word, name);
    if (d <= limit) add(withArgs(name), "a command you have", d + 0.5);
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
