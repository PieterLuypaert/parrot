// What parrot reads about your project for your Claude, and how a command goes on your prompt. No
// Herdr imports, so it is tested with bun test.

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

export const MAX_COMMANDS = 6;
const SHELL_BLOCKS = ["", "bash", "sh", "zsh", "shell", "console", "terminal"];

// A line of a code block as the command it holds, or null: without a "$ " in front, and never a
// comment or an empty line. In a console block only the lines that start with "$ " are commands;
// the rest is output. In other languages (js, json, diff, ...) nothing is a command.
export function commandOf(line, language) {
  if (!SHELL_BLOCKS.includes(language)) return null;
  const text = String(line ?? "").trim();
  if (language === "console" && !text.startsWith("$ ")) return null;
  const command = text.replace(/^\$\s+/, "");
  return command && !command.startsWith("#") ? command : null;
}

// An answer in pieces, in order: text, and code blocks with their language, their lines and how many
// commands they hold. At most six commands in the whole answer get a button.
export function segments(markdown) {
  const text = String(markdown ?? "");
  const pieces = [];
  let at = 0;
  let commands = 0;
  for (const found of text.matchAll(/```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)```/g)) {
    if (found.index > at) pieces.push({ type: "text", text: text.slice(at, found.index) });
    const language = found[1].toLowerCase();
    const lines = found[2].replace(/\n$/, "").split("\n").map((line) => {
      const command = commands < MAX_COMMANDS ? commandOf(line, language) : null;
      if (command) commands += 1;
      return { text: line, command };
    });
    pieces.push({ type: "code", language, lines });
    at = found.index + found[0].length;
  }
  if (at < text.length) pieces.push({ type: "text", text: text.slice(at) });
  return pieces.filter((piece) => piece.type === "code" || piece.text.trim());
}

// Commands that delete, overwrite or push: on the prompt they get a red label, so Enter is a choice.
const RISKY = [
  /\brm\s+(-\w*[rf]\w*\s+)+/, /\bgit\s+push\b.*(--force|-f\b)/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-\w*f/,
  /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, /\bgit\s+branch\s+-D\b/, /\bdrop\s+(database|table|schema)\b/i,
  /\btruncate\s+table\b/i, /\bdocker\s+(system|volume|image)\s+prune\b/, /\bdocker\s+(volume\s+)?rm\b/,
  /\bkubectl\s+delete\b/, /\bmkfs\b/, /\bdd\s+if=/, /\bchmod\s+-R\s+777\b/, /\bmigrate\s+reset\b/, /\bdb:(drop|reset|wipe)\b/,
  /\b(npm|pnpm|yarn)\s+publish\b/, /\bsudo\b/, /(^|[^>])>\s*[^>&\s]/,
];

export function isRisky(command) {
  return RISKY.some((pattern) => pattern.test(String(command ?? "")));
}

// A command as one single-quoted shell word, for parrot-put.
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}
