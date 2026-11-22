import { describe, expect, test } from "bun:test";
import {
  KEEP_MESSAGES, KEEP_PROJECTS, SUGGEST_MODEL, TOOLS, claudeArgs, mask, parseAnswer, parseSuggestions, projectName, promptFor,
  suggestArgs, suggestPrompt, tail, withMessage, withSession, withoutChat,
} from "../mods/parrot/ask.js";

describe("asking Claude what you meant", () => {
  test("asks a fast model with no tools, no session and a JSON shape", () => {
    const args = suggestArgs("<typed>gitce</typed>");
    expect(args[args.indexOf("--model") + 1]).toBe(SUGGEST_MODEL);
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--no-session-persistence");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]).properties.suggestions.maxItems).toBe(3);
    expect(args.at(-1)).toBe("<typed>gitce</typed>");
  });

  test("gives Claude the line, the masked output, the scripts and your habits, never your aliases", () => {
    const prompt = suggestPrompt({
      line: "pnpm tset", code: 1, cwd: "/code/shop", output: "Did you mean \"pnpm test\"?",
      scripts: [{ command: "pnpm test" }], history: ["git status", "git status", "export TOKEN=abc123secret", "pnpm dev"],
    });
    expect(prompt.startsWith("<typed")).toBe(true);
    expect(prompt).toContain('exit_code="1"');
    expect(prompt).toContain("pnpm test");
    expect(prompt).toContain("git (2)");
    expect(prompt).not.toContain("abc123secret");
    expect(prompt).not.toContain("alias");
  });

  test("masks a secret in the line you typed and keeps the folder one attribute", () => {
    const prompt = suggestPrompt({ line: "exprot OPENAI_API_KEY=sk-live-abcdefghijklmnop", code: 127, cwd: '/code/my "odd" dir', output: "" });
    expect(prompt).not.toContain("abcdefghijklmnop");
    expect(prompt).toContain("folder=\"/code/my 'odd' dir\"");
  });

  test("reads Claude's suggestions, or says why there are none", () => {
    const stdout = JSON.stringify({ is_error: false, structured_output: { suggestions: [{ command: " git commit ", why: "commit typo" }, { command: "", why: "x" }] } });
    expect(parseSuggestions({ code: 0, stdout, stderr: "" })).toEqual({ suggestions: [{ command: "git commit", why: "commit typo" }] });
    expect(parseSuggestions({ code: 1, stdout: "", stderr: "Not logged in" }).error).toBe("Claude could not suggest: Not logged in.");
  });
});

describe("claudeArgs", () => {
  test("asks for JSON with read-only tools and no MCP servers, the prompt last", () => {
    const args = claudeArgs({ prompt: "<terminal>…" });
    expect(args.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
    expect(args[args.indexOf("--tools") + 1]).toBe(TOOLS);
    expect(args[args.indexOf("--allowedTools") + 1]).toBe(TOOLS);
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).not.toContain("--bare");
    expect(args).not.toContain("--resume");
    expect(args.at(-1)).toBe("<terminal>…");
  });

  test("continues a conversation with --resume", () => {
    const args = claudeArgs({ prompt: "x", session: "abc" });
    expect(args[args.indexOf("--resume") + 1]).toBe("abc");
  });
});

describe("promptFor", () => {
  test("puts the folder, the branch and the terminal's output before the question", () => {
    const prompt = promptFor({ question: "Where is the export?", cwd: "/code/shop", branch: "main", output: "$ ls" });
    expect(prompt).toBe('<terminal folder="/code/shop" branch="main">\n$ ls\n</terminal>\n\nWhere is the export?');
    expect(prompt.startsWith("-")).toBe(false);
  });

  test("says so when there is no output", () => {
    expect(promptFor({ question: "q", cwd: "/x" })).toContain("(no output)");
  });
});

describe("tail", () => {
  test("keeps the last lines and drops the empty ones under the prompt", () => {
    expect(tail("a\nb\nc\nd\n\n\n", 2)).toBe("c\nd");
    expect(tail(undefined)).toBe("");
  });
});

describe("mask", () => {
  test("masks keys and tokens", () => {
    expect(mask("key sk-ant-api03-abcdefghijklmnop")).toBe("key sk-ant-ap***");
    expect(mask("ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe("ghp_***");
    expect(mask("AKIAABCDEFGHIJKLMNOP")).toBe("AKIA***");
    expect(mask("Bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4")).toBe("Bearer eyJ***");
  });

  test("masks passwords in URLs and KEY=value lines, keeping the names", () => {
    expect(mask("postgres://app:hunter22@localhost:5432/shop")).toBe("postgres://app:***@localhost:5432/shop");
    expect(mask('STRIPE_SECRET_KEY="whsec_123456"')).toBe('STRIPE_SECRET_KEY="***"');
    expect(mask("password: hunter22")).toBe("password: ***");
  });

  test("masks a private key, also when the output cut off its first or last line", () => {
    const body = "MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gunVTLw";
    expect(mask(`-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`)).not.toContain(body);
    expect(mask(`-----BEGIN RSA PRIVATE KEY-----\n${body}`)).not.toContain(body);
    expect(mask(`${body}\n${body}\n-----END RSA PRIVATE KEY-----`)).not.toContain(body);
  });

  test("masks a password with a slash or an @ in a URL, and a quoted value with spaces", () => {
    expect(mask("postgres://app:pa/ss@db/x")).toBe("postgres://app:***@db/x");
    expect(mask("redis://user:p@ss@cache:6379")).toBe("redis://user:***@cache:6379");
    expect(mask('PASSWORD="correct horse battery" next')).toBe('PASSWORD="***" next');
  });

  test("leaves ordinary output alone", () => {
    const output = "Error: P1001: Can't reach database server at localhost:5432";
    expect(mask(output)).toBe(output);
  });
});

describe("parseAnswer", () => {
  test("reads the answer and the session", () => {
    const stdout = JSON.stringify({ result: " The export lives in src/orders. ", session_id: "s1", is_error: false });
    expect(parseAnswer({ code: 0, stdout, stderr: "" })).toEqual({ text: "The export lives in src/orders.", session: "s1" });
  });

  test("says why when Claude reports an error", () => {
    const stdout = JSON.stringify({ result: "Prompt is too long", is_error: true, session_id: "s1" });
    expect(parseAnswer({ code: 1, stdout, stderr: "" }).error).toBe("Claude could not answer: Prompt is too long");
  });

  test("says why when the output is no JSON at all", () => {
    expect(parseAnswer({ code: 1, stdout: "", stderr: "Not logged in\nRun claude login" }).error).toBe("Claude could not answer: Not logged in");
    expect(parseAnswer({ code: 2, stdout: "", stderr: "" }).error).toBe("Claude could not answer: claude stopped with exit code 2");
  });
});

describe("conversations", () => {
  test("keeps one per project, with its session", () => {
    let chats = withMessage({}, "/a", { role: "you", text: "hi" }, 1);
    chats = withSession(chats, "/a", "s1");
    chats = withMessage(chats, "/b", { role: "you", text: "yo" }, 2);
    expect(chats["/a"]).toEqual({ session: "s1", messages: [{ role: "you", text: "hi" }], at: 1 });
    expect(Object.keys(chats).sort()).toEqual(["/a", "/b"]);
    expect(withSession(chats, "/a", undefined)["/a"].session).toBeNull();
  });

  test("keeps the last messages of a project and the projects talked about last", () => {
    let chats = {};
    for (let i = 0; i < KEEP_MESSAGES + 5; i++) chats = withMessage(chats, "/a", { role: "you", text: String(i) }, i);
    expect(chats["/a"].messages).toHaveLength(KEEP_MESSAGES);
    expect(chats["/a"].messages[0].text).toBe("5");
    for (let i = 0; i < KEEP_PROJECTS + 3; i++) chats = withMessage(chats, `/p${i}`, { role: "you", text: "x" }, 100 + i);
    expect(Object.keys(chats)).toHaveLength(KEEP_PROJECTS);
    expect(chats["/a"]).toBeUndefined();
  });

  test("starts a project over", () => {
    const chats = withMessage({}, "/a", { role: "you", text: "hi" });
    expect(withoutChat(chats, "/a")).toEqual({});
  });

  test("names a project after its folder", () => {
    expect(projectName("/Users/me/code/shop-api")).toBe("shop-api");
    expect(projectName(null)).toBe("this project");
  });
});
