// What parrot asks your own Claude, how it reads the answer, and the conversations it keeps, one
// per project. No Herdr imports, so it is tested with bun test.

import { DEFAULTS } from "./settings.js";

export const MODEL = DEFAULTS.model;
export const OUTPUT_LINES = 60;
export const KEEP_MESSAGES = 40;
export const KEEP_PROJECTS = 12;
export const TIMEOUT = 10 * 60 * 1000;
export const TOOLS = "Read,Grep,Glob";

// The checks your Claude may run itself, exactly as written: each only reads. Claude Code refuses
// anything else, also when it is chained to one of these or adds an option that writes.
export const CHECKS = [
  "git status", "git status --short", "git log --oneline -10", "git diff --stat", "git branch --show-current", "git remote -v",
  "git stash list", "node -v", "npm -v", "pnpm -v", "bun --version", "docker ps", "docker compose ps", "gh pr checks", "gh pr view",
];
// And two that take an argument after this start: a log's line count and service, and a port.
export const CHECK_PREFIXES = ["docker compose logs --tail", "lsof -i"];
const ALLOWED = [TOOLS, ...CHECKS.map((check) => `Bash(${check})`), ...CHECK_PREFIXES.map((check) => `Bash(${check}:*)`)].join(",");

export const SYSTEM = [
  "You are Parrot, a small helper that lives in the Herdr terminal app.",
  "The person asks about the project in the current folder: how it works, where something lives, why a command fails.",
  "Read the project's files with your tools when that helps, and name the files you looked at.",
  `To check something you may run these commands with Bash, exactly as written: ${CHECKS.join(", ")}; and docker compose logs --tail <lines> [service], or lsof -i :<port>. Never with -f or --follow. Anything else is refused.`,
  "You can only read: never say you changed anything. When something needs doing, give the command in a code block.",
  "Start every answer with one line on its own: 'Checked: ' and only the commands you ran or the files you read this time that settle it, comma separated; or just 'Hunch' when you ran and read nothing, also when you answer from what you know. Write those two words in English.",
  "Name files in code with their path from the folder, and a line when it matters, such as `src/orders.ts:42`: the person can click them.",
  "The terminals open beside this one come with the question; when you point the person to one, write terminal: and its address, such as terminal:t7.",
  "Keep answers short and concrete, in the language of the question.",
  "The person's recent terminal output comes with each question; it may have nothing to do with it.",
].join(" ");

// Arguments for `claude -p`, the person's own Claude Code on their own login and subscription, as
// Chartroom asks it: an answer as JSON, read-only tools and the checks above, no MCP servers, none
// of their hooks or plugins (--setting-sources ""), and the conversation so far when there is one.
// Bash is there for the checks only: without anyone to approve it, every other command is refused.
// The prompt starts with the terminal block, never with a dash, so it is never read as an option.
export function claudeArgs({ prompt, session, model = MODEL }) {
  const args = [
    "-p", "--output-format", "json", "--model", model, "--system-prompt", SYSTEM,
    "--tools", `${TOOLS},Bash`, "--allowedTools", ALLOWED, "--strict-mcp-config", "--setting-sources", "",
  ];
  if (session) args.push("--resume", session);
  args.push(prompt);
  return args;
}

// The terminal's folder, branch and output, the other terminals in the space when there are any,
// then the question.
export function promptFor({ question, cwd, branch, output, terminals = "" }) {
  const where = `folder="${attribute(cwd)}"${branch ? ` branch="${attribute(branch)}"` : ""}`;
  return [`<terminal ${where}>`, output || "(no output)", "</terminal>", ...(terminals ? [terminals] : []), "", question].join("\n");
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
  return { error: explainFailure(why) ?? `Claude could not answer: ${why}` };
}

export const MISSING_CLAUDE = "Parrot cannot find Claude Code. Install it from claude.com/claude-code, run claude once in a terminal to log in, and try again.";

// Why Claude gave nothing back, as what to do about it, for the failures people run into: not
// logged in, out of usage, too slow, overloaded or offline. Null for anything else.
export function explainFailure(why, waited = TIMEOUT) {
  const text = String(why ?? "");
  if (/not logged in|please run \/login|invalid api key|oauth token (?:has )?expired/i.test(text)) {
    return "Your Claude Code is not logged in. Run claude in a terminal, log in with /login, and try again.";
  }
  if (/limit/i.test(text) && /reset|reached|hit|exceeded/i.test(text)) {
    const reset = text.match(/resets?\s+(?:at\s+)?([^·|\n]+)/i)?.[1]?.trim();
    return `You have used up your Claude usage for now${reset ? `; it resets ${reset}` : ""}. Try again after that.`;
  }
  if (/timed?[ -]?out|timeout/i.test(text)) {
    const minutes = Math.round(waited / 60000);
    const long = waited < 60000 ? `${Math.round(waited / 1000)} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `Claude took longer than ${long}, so parrot stopped waiting. Try again, or ask something narrower.`;
  }
  if (/overloaded|\b529\b/i.test(text)) return "Claude is overloaded right now. Try again in a minute.";
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|fetch failed|network/i.test(text)) {
    return "Parrot could not reach Claude. Check your internet connection and try again.";
  }
  return null;
}

// The line your Claude starts an answer with: what it checked, or that it is a hunch, and the
// answer without that line. An older answer, or one without it, has no label.
export function labelOf(text) {
  const all = String(text ?? "");
  const [first, ...rest] = all.split("\n");
  const found = first.replace(/[*_`]/g, "").trim().match(/^(checked|hunch)\b\s*[:·-]?\s*(.*)$/i);
  if (!found) return { label: null, what: "", text: all };
  const what = found[2].trim().replace(/\.$/, "");
  // "Checked" with nothing checked, as in "Checked: Hunch", is a hunch.
  const label = found[1].toLowerCase() === "checked" && what && !/^hunch\b/i.test(what) ? "checked" : "hunch";
  return { label, what: label === "checked" ? what : "", text: rest.join("\n").replace(/^\s*\n/, "") };
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

// ---- The language you chat in ----

// Words that each mark one language and none of the others, so a short question is enough.
const MARKERS = {
  en: ["the", "what", "why", "how", "where", "this", "that", "does", "should", "with", "my", "and", "it", "you", "can", "of"],
  nl: ["het", "een", "wat", "waarom", "hoe", "waar", "dit", "dat", "niet", "ik", "je", "mijn", "wordt", "deze", "kan", "moet", "zijn", "ook", "van", "voor", "met", "werkt", "faalt"],
  fr: ["le", "les", "une", "est", "pourquoi", "comment", "où", "cette", "je", "pas", "pour", "avec", "et", "du", "des", "mon", "ne"],
  de: ["der", "das", "ein", "eine", "ist", "warum", "wie", "wo", "ich", "nicht", "und", "mit", "für", "auf", "mein", "funktioniert"],
  es: ["el", "los", "las", "una", "por", "qué", "cómo", "dónde", "esto", "yo", "para", "con", "mi", "funciona", "está"],
};
export const LANGUAGES = { en: "English", nl: "Dutch", fr: "French", de: "German", es: "Spanish" };

// The language of a question, by the words only it uses: null when it is too short to tell, or a
// language parrot does not know.
export function languageOf(text) {
  const words = String(text ?? "").toLowerCase().replace(/`[^`]*`/g, " ").match(/[\p{L}']+/gu) ?? [];
  const scores = Object.entries(MARKERS)
    .map(([lang, markers]) => [lang, words.filter((word) => markers.includes(word)).length])
    .sort((a, b) => b[1] - a[1]);
  const [[best, top], [, next]] = scores;
  return top >= 2 && top > next ? best : null;
}

// The language you chat in: that of the last question you typed yourself, in any project. Questions
// parrot asked for you do not count.
export function chatLanguage(chats) {
  const asked = Object.values(chats ?? {})
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .flatMap((chat) => [...(chat.messages ?? [])].reverse().filter((message) => message.role === "you" && !message.auto));
  for (const message of asked) {
    const lang = languageOf(message.text);
    if (lang) return lang;
  }
  return "en";
}

// ---- What you meant, from your Claude ----

export const SUGGEST_MODEL = "haiku";
export const SUGGEST_TIMEOUT = 60 * 1000;
export const SUGGEST_LINES = 30;

export const SUGGEST_SYSTEM = [
  "You fix mistyped and misused shell commands.",
  "From what the person typed, its exit code, its output, the project's scripts and the commands they use, give up to three commands they most likely meant, best first.",
  "Fix the typo first and keep what they meant to do: correct each misspelled word to the closest real word.",
  "Typos are swapped, missing, doubled or neighbouring letters, so 'pnmp lnit' is 'pnpm lint' and 'dokcer compsoe' is 'docker compose'.",
  "When a word is close to one of the project's scripts, that script is the best guess. Only suggest something they did not type when no typo fix makes sense.",
  "Every suggestion is a version of the line they just typed. The recent lines only show how they work: never suggest a fix for one of those.",
  "Only real commands for their tools and this project, always written out in full: never a shell alias or a shortcut. Keep the arguments that were right. A tool's own suggestion in the output is usually right.",
  "Never suggest a command that deletes data, rewrites history or pushes, unless the person typed one.",
  "Each why is at most six words, in the language the why_in tag names. If nothing fits, give none.",
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

// An attribute value that cannot end the attribute early.
const attribute = (text) => mask(String(text ?? "")).replace(/"/g, "'");

// The prompt: the line and how it ended, the project's scripts and the commands the person uses
// most, all masked. It starts with a tag, never with a dash.
export function suggestPrompt({ line, code, cwd, output, scripts = [], history = [], language = "en" }) {
  const used = new Map();
  for (const entry of history) {
    const first = String(entry).trim().split(/\s+/)[0];
    if (first) used.set(first, (used.get(first) ?? 0) + 1);
  }
  const top = [...used].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => `${name} (${count})`).join(", ");
  const recent = history.slice(-20).map((entry) => mask(entry)).join("\n");
  return [
    `<typed exit_code="${code}" folder="${attribute(cwd)}">${mask(line.trim())}</typed>`,
    `<output>\n${tail(output, SUGGEST_LINES) || "(none)"}\n</output>`,
    `<scripts>${scripts.map((s) => s.command).join(", ") || "(none)"}</scripts>`,
    `<commands_they_use>${top || "(unknown)"}</commands_they_use>`,
    `<recent_lines>\n${recent || "(none)"}\n</recent_lines>`,
    `<why_in>${LANGUAGES[language] ?? "English"}</why_in>`,
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
  return { error: explainFailure(why, SUGGEST_TIMEOUT) ?? `Claude could not suggest: ${why}.` };
}

// Where claude may live when the app was opened from the Dock, with the short PATH macOS gives it.
export function claudeCandidates(home) {
  return ["claude", `${home}/.local/bin/claude`, "/opt/homebrew/bin/claude", "/usr/local/bin/claude", `${home}/.claude/local/claude`];
}
