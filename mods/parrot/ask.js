// What parrot asks your own Claude, how it reads the answer, and the conversations it keeps, one
// per project. No Herdr imports, so it is tested with bun test.

export const MODEL = "sonnet";
export const OUTPUT_LINES = 60;
export const KEEP_MESSAGES = 40;
export const KEEP_PROJECTS = 12;
export const TIMEOUT = 10 * 60 * 1000;
export const TOOLS = "Read,Grep,Glob";

export const SYSTEM = [
  "You are Parrot, a small helper that lives in the Herdr terminal app.",
  "The person asks about the project in the current folder: how it works, where something lives, why a command fails.",
  "Read the project's files with your tools when that helps, and name the files you looked at.",
  "You can only read: never say you changed anything. When something needs doing, give the command in a code block.",
  "Keep answers short and concrete, in the language of the question.",
  "The person's recent terminal output comes with each question; it may have nothing to do with it.",
].join(" ");

// Arguments for `claude -p`: an answer as JSON, read-only tools, no MCP servers, and the
// conversation so far when there is one. The prompt starts with the terminal block, never with a
// dash, so it is never read as an option.
export function claudeArgs({ prompt, session, model = MODEL }) {
  const args = [
    "-p", "--output-format", "json", "--model", model, "--system-prompt", SYSTEM,
    "--tools", TOOLS, "--allowedTools", TOOLS, "--strict-mcp-config",
  ];
  if (session) args.push("--resume", session);
  args.push(prompt);
  return args;
}

export function promptFor({ question, cwd, branch, output }) {
  const where = `folder="${cwd}"${branch ? ` branch="${branch}"` : ""}`;
  return [`<terminal ${where}>`, output || "(no output)", "</terminal>", "", question].join("\n");
}

// The last `n` lines, without the empty ones a terminal leaves under its prompt.
export function tail(text, n = OUTPUT_LINES) {
  const lines = String(text ?? "").replace(/\s+$/, "").split("\n");
  return lines.slice(-n).join("\n");
}

const SECRETS = [
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, "$1 *** $2"],
  [/\b(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]{10,}/g, "$1***"],
  [/\b(gh[pousr]_)[A-Za-z0-9]{20,}/g, "$1***"],
  [/\b(github_pat_)[A-Za-z0-9_]{20,}/g, "$1***"],
  [/\b(xox[abprs]-)[A-Za-z0-9-]{10,}/g, "$1***"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA***"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "eyJ***"],
  [/(\/\/[^:/\s@]+:)[^@\s/]+@/g, "$1***@"],
  [/\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|passwd|password|pwd)[A-Za-z0-9_]*)(\s*[:=]\s*)(["']?)[^\s"']+\3/gi, "$1$2$3***$3"],
];

// Terminal output with the secrets that often show up in it masked: keys, tokens, passwords in
// URLs and in KEY=value lines. It catches the common shapes, not all of them.
export function mask(text) {
  return SECRETS.reduce((out, [pattern, replace]) => out.replace(pattern, replace), String(text ?? ""));
}

function firstLine(text) {
  return String(text ?? "").trim().split("\n")[0] ?? "";
}

// The answer from `claude -p --output-format json`, or why there is none, in words a person reads.
export function parseAnswer({ code, stdout, stderr }) {
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  if (json && !json.is_error && typeof json.result === "string" && json.result.trim()) {
    return { text: json.result.trim(), session: json.session_id ?? null };
  }
  const why = (json && (json.result || json.subtype)) || firstLine(stderr) || firstLine(stdout) || `claude stopped with exit code ${code}`;
  return { error: `Claude could not answer: ${why}` };
}

export function projectName(cwd) {
  return String(cwd ?? "").split("/").filter(Boolean).pop() ?? "this project";
}

function keepRecent(chats) {
  const recent = Object.keys(chats).sort((a, b) => (chats[b].at ?? 0) - (chats[a].at ?? 0)).slice(0, KEEP_PROJECTS);
  return Object.fromEntries(recent.map((cwd) => [cwd, chats[cwd]]));
}

// The conversations, one per project folder, with a message added: the last 40 of each, and the
// 12 projects talked about last.
export function withMessage(chats, cwd, message, now = Date.now()) {
  const chat = chats?.[cwd] ?? { session: null, messages: [] };
  const messages = [...chat.messages, message].slice(-KEEP_MESSAGES);
  return keepRecent({ ...chats, [cwd]: { ...chat, messages, at: now } });
}

// The Claude conversation to continue; null starts a new one, after an error or a fresh start.
export function withSession(chats, cwd, session) {
  const chat = chats?.[cwd] ?? { session: null, messages: [] };
  return { ...chats, [cwd]: { ...chat, session: session ?? null } };
}

export function withoutChat(chats, cwd) {
  const rest = { ...chats };
  delete rest[cwd];
  return rest;
}
