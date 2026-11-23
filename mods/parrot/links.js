// Links in your Claude's answers: a file at its line, a terminal's pane, a web page. No Herdr
// imports, so it is tested with bun test.

// A file name as your Claude writes one in code: a path with an extension, maybe with :line and
// :column, such as src/orders.ts:42 or .env. Not a command, a version or a git remote.
export function isFileRef(text) {
  const ref = String(text ?? "").trim();
  if (!ref || /\s/.test(ref) || ref.startsWith("-") || /^[a-z][\w+.-]*:\/\//i.test(ref)) return false;
  return /^(~\/|\.{1,2}\/|\/)?([\w@.+-]+\/)*[\w@.+-]*\.[A-Za-z][A-Za-z0-9]{0,7}(:\d+){0,2}$/.test(ref);
}

// A file reference as the path and the line and column it names.
export function fileTarget(ref) {
  const [, path, line, column] = String(ref).match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
  return { path, line: line ? Number(line) : null, column: column ? Number(column) : null };
}

// Where a file reference may be on disk, most likely first: as written when it is absolute or
// starts at your home, else from the terminal's folder and then from the project's root.
export function filePlaces(path, { cwd, root, home }) {
  if (path.startsWith("/")) return [path];
  if (path.startsWith("~/")) return [`${home}${path.slice(1)}`];
  const clean = path.replace(/^\.\//, "");
  return [...new Set([cwd, root].filter(Boolean).map((dir) => `${dir}/${clean}`))];
}

// An answer's text with links: a file name in code opens the file, terminal:t7 goes to that
// terminal's pane, and a bare web address becomes a link. Code blocks are not text and never get
// here; links already in the text stay as they are.
export function linkify(markdown, { terminals = {} } = {}) {
  return String(markdown ?? "")
    .replace(/`?\bterminal:((?:[\w-]+\/)?t\w+)\b`?/g, (all, address) => (terminals[address]
      ? `[→ ${terminals[address]}](parrot-terminal:${encodeURIComponent(address)})`
      : all))
    .replace(/(?<![\[(<])`([^`\n]+)`(?![\]])/g, (all, ref) => (isFileRef(ref) ? `[\`${ref}\`](parrot-file:${encodeURIComponent(ref)})` : all))
    .replace(/(^|[\s])(https?:\/\/[^\s<>()\]`]+[^\s<>()\]`.,;:!?'"])/g, "$1<$2>");
}

// What a clicked link is: a file, a terminal or a web page; null for anything else.
export function linkTarget(url) {
  const text = String(url ?? "");
  const found = text.match(/^parrot-(file|terminal):(.+)$/);
  if (found) return { kind: found[1], value: decodeURIComponent(found[2]) };
  return /^https?:\/\/[^\s]+$/.test(text) ? { kind: "web", value: text } : null;
}

// The editors parrot opens a file in, the first that is there: Cursor, then VS Code, each at the
// line with -g. Without them the file opens in its own app, at its top.
export function editorCandidates(home) {
  return [
    { bin: "cursor", goto: true }, { bin: "/usr/local/bin/cursor", goto: true },
    { bin: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor", goto: true },
    { bin: "code", goto: true }, { bin: "/usr/local/bin/code", goto: true },
    { bin: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", goto: true },
    { bin: `${home}/.local/bin/cursor`, goto: true },
  ];
}

// The terminals open beside the one parrot watches, as your Claude gets them with a question, so
// it can point you to one: their address, folder and what runs in them.
export function terminalsBlock(list) {
  if (!list.length) return "";
  const rows = list.map((one) => `${one.address}: ${one.running} in ${one.folder}${one.watched ? " (the one the question comes from)" : ""}`);
  return ["<terminals>", ...rows, "</terminals>"].join("\n");
}
