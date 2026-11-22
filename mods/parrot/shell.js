// What parrot reads about your shell and project for your Claude, and how a command goes on your
// prompt. No Herdr imports, so it is tested with bun test.

// The project's scripts and how to run them: package.json with the package manager its lockfile
// names, and a Makefile's targets.
export function scriptsFrom({ packageJson, lockfiles = [], makefile }) {
  const scripts = [];
  try {
    const names = Object.keys(JSON.parse(packageJson ?? "{}").scripts ?? {});
    const runner = lockfiles.includes("pnpm-lock.yaml") ? "pnpm" : lockfiles.includes("yarn.lock") ? "yarn"
      : lockfiles.some((f) => f.startsWith("bun.lock")) ? "bun run" : "npm run";
    for (const name of names) scripts.push({ name, command: `${runner} ${name}` });
  } catch (error) {
    scripts.push({ name: "", command: "", problem: `package.json could not be read: ${error.message}` });
  }
  for (const [, target] of String(makefile ?? "").matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)) {
    scripts.push({ name: target, command: `make ${target}` });
  }
  return scripts.filter((s) => s.name);
}

// The names the zsh hook wrote after a failed command: a:alias and f:function.
export function namesFrom(text) {
  const names = { aliases: [], functions: [] };
  for (const line of String(text ?? "").split("\n")) {
    const [kind, name] = [line.slice(0, 2), line.slice(2).trim()];
    if (!name) continue;
    if (kind === "a:") names.aliases.push(name);
    else if (kind === "f:") names.functions.push(name);
  }
  return names;
}

// A command as one single-quoted shell word, for parrot-put.
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}
