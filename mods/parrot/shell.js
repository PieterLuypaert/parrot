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

// A command without its comment: a # outside quotes, at the start or after a space, and all after
// it. zsh without INTERACTIVE_COMMENTS takes such a # as an argument, so it never goes along.
export function withoutComment(command) {
  const text = String(command ?? "");
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"') i += 1;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "\\") i += 1;
    else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  return text.trimEnd();
}

// A line of a code block as the command it holds, or null: without a "$ " in front or a comment
// after it, and never a comment or an empty line. In a console block only the lines that start
// with "$ " are commands; the rest is output. In other languages (js, json, diff, ...) nothing is a
// command.
export function commandOf(line, language) {
  if (!SHELL_BLOCKS.includes(language)) return null;
  const text = String(line ?? "").trim();
  if (language === "console" && !text.startsWith("$ ")) return null;
  const command = withoutComment(text.replace(/^\$\s+/, ""));
  return command || null;
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

// Commands that delete, overwrite, push, stop processes or run a script from the internet: on the
// prompt they get a red label, so Enter is a choice, and Run counts down first.
const RISKY = [
  // Files.
  /\b(rm|rmdir|shred|unlink|mv)\s/, /\bfind\b.*\s(-delete|-exec\s+rm)\b/, /\b(chmod|chown)\s+-R\b/, /\bdd\s+if=/, /\bmkfs\b/, /\btruncate\s/,
  // Writing over a file with >, but not into /dev/null or another stream.
  /(^|[^>])>\s*(?!&|\/dev\/null\b)[^>\s]/,
  // Git.
  /\bgit\s+push\b/, /\bgit\s+reset\b.*--hard\b/, /\bgit\s+clean\s+-\w*f/, /\bgit\s+checkout\s+(\S+\s+)?--\s/, /\bgit\s+checkout\s+\.(\s|$)/,
  /\bgit\s+restore\s+(?!--staged\b)/, /\bgit\s+branch\s+-D\b/, /\bgit\s+stash\s+(drop|clear)\b/, /\bgit\s+config\s+--global\b/,
  // Containers, clusters, infrastructure and databases.
  /\bdocker\s+(compose\s+down\b.*(\s-v\b|--volumes)|rmi?\b|(volume|image|container|network|system)\s+(rm|prune)\b)/,
  /\bkubectl\s+delete\b/, /\bterraform\s+destroy\b/, /\bdrop\s+(database|table|schema)\b/i, /\btruncate\s+table\b/i, /\bdropdb\b/,
  /\bmigrate\s+reset\b/, /\bdb:(drop|reset|wipe)\b/, /--force-reset\b/,
  // Processes, publishing and root.
  /\b(kill|pkill|killall)\b/, /\b(npm|pnpm|yarn)\s+publish\b/, /\bsudo\b/,
  // A script from the internet, run at once.
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|perl|ruby)\b/, /\$\(\s*(curl|wget)\b/, /<\(\s*(curl|wget)\b/,
];

export function isRisky(command) {
  return RISKY.some((pattern) => pattern.test(String(command ?? "")));
}

// A command with a part still to fill in, such as <url>, YOUR_TOKEN, "Your Name" or
// you@example.com: it goes on the prompt for you to finish, and never runs as it is.
const PLACEHOLDERS = [
  /<[A-Za-z][\w .:/-]*>/, /\bYOUR_[A-Z][A-Z_]*\b/, /\byour[ _-]?(name|email|user(name)?|token|key|password|org|repo|project|domain|branch|url|id)\b/i,
  /\b(you|user|name)@example\.(com|org)\b/, /\bexample\.com\b/,
];
export function hasPlaceholder(command) {
  return PLACEHOLDERS.some((pattern) => pattern.test(String(command ?? "")));
}

// A command Run may send as it is: complete on one line, nothing to fill in, and nothing zsh reads
// differently from how it looks: no ! (history expansion), no heredoc, and no line that goes on.
export function canRun(command) {
  const text = String(command ?? "").trim();
  if (!text || hasPlaceholder(text) || text.includes("!") || text.includes("<<")) return false;
  return !/(\\|\||&|\b(do|then|else)|[{(])$/.test(text);
}

// What ▶ Run sends for a code block, or null when it may not run: a block whose every line is a
// command it can run. Several become one line joined by &&, so the shell stops at the first that
// fails; for that promise none of them may hold its own ; or ||.
export function runLineOf(piece) {
  const lines = (piece?.lines ?? []).filter((line) => line.text.trim());
  if (!lines.length || lines.some((line) => !line.command || !canRun(line.command))) return null;
  const commands = lines.map((line) => line.command.trim());
  if (commands.length > 1 && commands.some((command) => /;|\|\|/.test(command))) return null;
  return commands.join(" && ");
}

// A command as one single-quoted shell word, for print -z.
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}
