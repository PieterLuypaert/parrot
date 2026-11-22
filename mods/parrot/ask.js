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

// Arguments for `claude -p`, the person's own Claude Code on their own login and subscription, as
// Chartroom asks it: an answer as JSON, read-only tools, no MCP servers, none of their hooks or
// plugins (--setting-sources ""), and the conversation so far when there is one. The prompt starts
// with the terminal block, never with a dash, so it is never read as an option.
export function claudeArgs({ prompt, session, model = MODEL }) {
  const args = [
    "-p", "--output-format", "json", "--model", model, "--system-prompt", SYSTEM,
    "--tools", TOOLS, "--allowedTools", TOOLS, "--strict-mcp-config", "--setting-sources", "",
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

const quoted = (value) => (value.startsWith('"') ? '"***"' : value.startsWith("'") ? "'***'" : "***");

const SECRETS = [
  // A private key, also when only its start or its end is in the output.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----"],
  // Long lines of nothing but base64, such as the body of a key whose BEGIN line was cut off.
  [/^[A-Za-z0-9+/]{60,}={0,2}$/gm, "***"],
  [/\b(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]{10,}/g, "$1***"],
  [/\b(gh[pousr]_)[A-Za-z0-9]{20,}/g, "$1***"],
  [/\b(github_pat_)[A-Za-z0-9_]{20,}/g, "$1***"],
  [/\b(xox[abprs]-)[A-Za-z0-9-]{10,}/g, "$1***"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA***"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "eyJ***"],
  // A password in a URL runs up to the last @ before the host, so a / or @ in it is masked too.
  [/(\/\/[^:/\s@]+:)\S+@(?=[^\s@]+)/g, "$1***@"],
  [/\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|passwd|password|pwd)[A-Za-z0-9_]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"']+)/gi,
    (_m, key, sep, value) => key + sep + quoted(value)],
];

// Terminal output with the secrets that often show up in it masked: keys, tokens, passwords in
// URLs and in KEY=value lines. It catches the common shapes, not all of them. Mask before cutting
// the output, so a secret is never cut in half and half left in.
export function mask(text) {
  return SECRETS.reduce((out, [pattern, replace]) => out.replace(pattern, replace), String(text ?? ""));
}

// A message's own id, so the chat never shows one message's text for another.
export function messageId(now = Date.now(), random = Math.random) {
  return `${now.toString(36)}-${Math.floor(random() * 1e8).toString(36)}`;
}

// The chats' busy projects without one.
export function without(map, key) {
  const rest = { ...(map ?? {}) };
  delete rest[key];
  return rest;
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

// The Claude conversation to continue; null starts a new one, after an error or a fresh start, so
// a conversation Claude can no longer continue never blocks the next question.
export function withSession(chats, cwd, session) {
  const chat = chats?.[cwd] ?? { session: null, messages: [] };
  return { ...chats, [cwd]: { ...chat, session: session ?? null } };
}

export function withoutChat(chats, cwd) {
  return without(chats, cwd);
}

// ---- What you meant, from your Claude ----

export const SUGGEST_MODEL = "haiku";
export const SUGGEST_TIMEOUT = 60 * 1000;
export const SUGGEST_LINES = 30;

export const SUGGEST_SYSTEM = [
  "You fix mistyped and misused shell commands.",
  "From what the person typed, its exit code, its output, the project's scripts, their aliases and functions, and the commands they use, give up to three commands they most likely meant, best first.",
  "Only real commands for their tools and this project. Keep the arguments that were right. A tool's own suggestion in the output is usually right.",
  "Never suggest a command that deletes data, rewrites history or pushes, unless the person typed one.",
  "Each why is at most six words. If nothing fits, give none.",
].join(" ");

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { command: { type: "string" }, why: { type: "string" } },
        required: ["command", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

// One quick question on a fast model: no tools, no MCP servers, none of the person's hooks or
// plugins, no session kept, and the answer in the shape asked for.
export function suggestArgs(prompt, model = SUGGEST_MODEL) {
  return [
    "-p", "--output-format", "json", "--model", model, "--system-prompt", SUGGEST_SYSTEM, "--tools", "",
    "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--json-schema", JSON.stringify(SUGGEST_SCHEMA),
    prompt,
  ];
}

// The prompt: the line and how it ended, the masked output, the project's scripts, the person's
// aliases and functions, and the commands they use most. It starts with a tag, never with a dash.
export function suggestPrompt({ line, code, cwd, output, scripts = [], history = [], aliases = [], functions = [] }) {
  const used = new Map();
  for (const entry of history) {
    const first = String(entry).trim().split(/\s+/)[0];
    if (first) used.set(first, (used.get(first) ?? 0) + 1);
  }
  const top = [...used].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => `${name} (${count})`).join(", ");
  const recent = history.slice(-20).map((entry) => mask(entry)).join("\n");
  return [
    `<typed exit_code="${code}" folder="${cwd}">${line.trim()}</typed>`,
    `<output>\n${tail(output, SUGGEST_LINES) || "(none)"}\n</output>`,
    `<scripts>${scripts.map((s) => s.command).join(", ") || "(none)"}</scripts>`,
    `<their_aliases>${aliases.slice(0, 80).join(", ") || "(none)"}</their_aliases>`,
    `<their_functions>${functions.slice(0, 80).join(", ") || "(none)"}</their_functions>`,
    `<commands_they_use>${top || "(unknown)"}</commands_they_use>`,
    `<recent_lines>\n${recent || "(none)"}\n</recent_lines>`,
  ].join("\n");
}

// Claude's suggestions, or why there are none.
export function parseSuggestions({ code, stdout, stderr }) {
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  const list = json && !json.is_error ? json.structured_output?.suggestions : null;
  if (Array.isArray(list)) {
    return {
      suggestions: list
        .filter((s) => typeof s?.command === "string" && s.command.trim())
        .slice(0, 3)
        .map((s) => ({ command: s.command.trim(), why: String(s.why ?? "").trim() })),
    };
  }
  const why = (json && (json.result || json.subtype)) || firstLine(stderr) || firstLine(stdout) || `claude stopped with exit code ${code}`;
  return { error: `Claude could not suggest: ${why}.` };
}

// Where claude may live when the app was opened from the Dock, with the short PATH macOS gives it.
export function claudeCandidates(home) {
  return ["claude", `${home}/.local/bin/claude`, "/opt/homebrew/bin/claude", "/usr/local/bin/claude", `${home}/.claude/local/claude`];
}
