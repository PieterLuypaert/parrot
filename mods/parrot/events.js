// What the zsh hook reports and what the parrot does with it. No Herdr imports, so it is tested
// with bun test.

// Exit codes that are no error: stopped with Ctrl-C, a closed pipe, or suspended with Ctrl-Z.
export const QUIET = [0, 130, 141, 146, 148];
export const NOT_FOUND = 127;

// One line the hook wrote, or null when it is not one (yet).
export function parseEvent(text) {
  try {
    const event = JSON.parse(String(text ?? "").trim().split("\n").at(-1));
    if (typeof event?.pid !== "number" || typeof event?.code !== "number" || typeof event?.cmd !== "string") return null;
    return event;
  } catch {
    return null;
  }
}

// The print -z parrot sends to put a command on the prompt is its own, not yours.
export function isOwn(event) {
  return /^\s*print -z -- /.test(event.cmd);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = (line) => String(line ?? "").trim().split(/\s+/).filter(Boolean);

// The output after the line you typed, found however many spaces separate its words, so an older
// command's text above it never counts for this one. A match right after ": " or a quote is an
// error message quoting the command ("command not found: gitce"), not the prompt. Without the line,
// all of it.
export function afterLine(output, line) {
  const text = String(output ?? "");
  const parts = words(line);
  if (!parts.length) return text;
  let last = null;
  for (const found of text.matchAll(new RegExp(parts.map(escapeRegExp).join("[ \\t]+"), "g"))) {
    const before = text.slice(text.lastIndexOf("\n", found.index) + 1, found.index);
    if (!/(:\s|['"`])$/.test(before)) last = found;
  }
  return last ? text.slice(last.index + last[0].length) : text;
}

// A command zsh itself could not find. Exit code 127 alone is not enough: a script that calls a
// missing program ends with 127 too, and then the command you typed was right.
export function notFound(event, output) {
  if (event.code !== NOT_FOUND) return false;
  const after = afterLine(output, event.cmd);
  // Without "not found" in the output (it could not be read), zsh is the likely one.
  if (!/not found/i.test(after)) return true;
  const word = words(event.cmd)[0] ?? "";
  return new RegExp(`command not found: ${escapeRegExp(word)}(\\s|$)`).test(after);
}

// Commands whose exit code 1 is an answer, not an error: no match, a difference, a test that said no.
const PREDICATES = ["grep", "egrep", "fgrep", "rg", "ag", "test", "[", "[[", "diff", "cmp", "pgrep", "which", "whence", "type"];
const GIT_PREDICATES = ["--quiet", "--exit-code", "--is-ancestor", "--verify"];

export function isPredicate(cmd) {
  const last = String(cmd ?? "").split(/\|\||&&|;|\|/).pop();
  const [first, ...rest] = words(last);
  if (PREDICATES.includes(first)) return true;
  return first === "git" && rest.some((word) => GIT_PREDICATES.includes(word));
}

// What the parrot does with a command that ended in one of the tab's terminals:
// - "alarm": it failed; `kind` says whether zsh could not find it;
// - "dance": it worked, right after one that failed there;
// - "clear": it worked, or ended quietly, and the alarm for that terminal goes;
// - null: nothing to do.
export function reaction(event, alert) {
  if (!event || isOwn(event) || !event.cmd.trim()) return null;
  const sameTerminal = alert && alert.pid === event.pid;
  if (event.code === 0) return sameTerminal ? "dance" : null;
  if (QUIET.includes(event.code)) return sameTerminal ? "clear" : null;
  if (event.code === 1 && isPredicate(event.cmd)) return null;
  return "alarm";
}

// Output that says the command itself was wrong, rather than what it did: those are worth a
// suggestion. A test run or a build that fails is not.
const USAGE = /not a git command|unknown (?:command|subcommand|option|flag|argument)|unrecognized (?:option|argument|command)|invalid (?:option|choice|argument|command)|missing script|command "[^"]+" not found|did you mean|no such (?:command|subcommand)|usage:/i;

// Your Claude is asked what you meant after a command zsh could not find, and after one whose
// output says it was used wrong.
export function wantsClaude(event, output) {
  if (notFound(event, output)) return true;
  return USAGE.test(afterLine(output, event.cmd));
}

// How a command parrot ran ended, from the hook's report of that same line in that terminal: "done",
// "failed" with its exit code, or "stopped" (Ctrl-C and the like). Null for any other report.
// The line is compared without its extra spaces, which zsh's HIST_REDUCE_BLANKS takes out.
const squeezed = (text) => String(text ?? "").trim().replace(/\s+/g, " ");
export function runOutcome(run, event) {
  if (!run || run.state !== "sent" || !event || event.pid !== run.pid) return null;
  if (event.at * 1000 < run.sentAt - 1000 || squeezed(event.cmd) !== squeezed(run.line)) return null;
  if (event.code === 0) return { state: "done", code: 0 };
  return { state: QUIET.includes(event.code) ? "stopped" : "failed", code: event.code };
}

// The commands parrot ran, by the code block they came from: the last 20.
export const KEEP_RUNS = 20;
export function withRun(runs, run) {
  const all = { ...(runs ?? {}), [run.key]: run };
  const recent = Object.values(all).sort((a, b) => b.sentAt - a.sentAt).slice(0, KEEP_RUNS);
  return Object.fromEntries(recent.map((one) => [one.key, one]));
}

export function alertFor(event, { terminal, suggestions = [], id, output }) {
  return {
    id,
    pid: event.pid,
    terminal,
    code: event.code,
    cmd: event.cmd,
    cwd: event.cwd,
    kind: notFound(event, output) ? "not-found" : "failed",
    suggestions,
  };
}

// What the alert says, in a line.
export function headline(alert) {
  const word = alert.cmd.trim().split(/\s+/)[0];
  return alert.kind === "not-found" ? `zsh: command not found: ${word}` : `${alert.cmd.trim()} failed with exit code ${alert.code}`;
}

// The questions an alert's buttons put to Claude, in the language you chat in, so the answer comes
// in it too: Explain asks why, briefly; Fix it asks only for the commands that fix it.
const QUESTIONS = {
  en: {
    notFound: {
      explain: (cmd) => `I typed ${cmd} and zsh says it cannot find that command. Why, briefly?`,
      fix: (cmd) => `I typed ${cmd} and zsh says it cannot find that command. Give me only the fix: the command I meant, or the commands to get it, in a code block, and one line on why.`,
    },
    failed: {
      explain: (cmd, code) => `${cmd} failed with exit code ${code}. Explain briefly why. Its output is in the terminal.`,
      fix: (cmd, code) => `${cmd} failed with exit code ${code}. Give me only the fix: the commands to run, in a code block, and one line on why. Its output is in the terminal.`,
    },
  },
  nl: {
    notFound: {
      explain: (cmd) => `Ik typte ${cmd} en zsh vindt dat commando niet. Waarom, kort?`,
      fix: (cmd) => `Ik typte ${cmd} en zsh vindt dat commando niet. Geef me alleen de oplossing: het commando dat ik bedoelde, of de commando's om het te krijgen, in een codeblok, en één regel waarom.`,
    },
    failed: {
      explain: (cmd, code) => `${cmd} faalde met exitcode ${code}. Leg kort uit waarom. De output staat in de terminal.`,
      fix: (cmd, code) => `${cmd} faalde met exitcode ${code}. Geef me alleen de oplossing: de commando's om te draaien, in een codeblok, en één regel waarom. De output staat in de terminal.`,
    },
  },
  fr: {
    notFound: {
      explain: (cmd) => `J'ai tapé ${cmd} et zsh ne trouve pas cette commande. Pourquoi, en bref ?`,
      fix: (cmd) => `J'ai tapé ${cmd} et zsh ne trouve pas cette commande. Donne-moi seulement la solution : la commande que je voulais, ou les commandes pour l'obtenir, dans un bloc de code, et une ligne sur pourquoi.`,
    },
    failed: {
      explain: (cmd, code) => `${cmd} a échoué avec le code de sortie ${code}. Explique brièvement pourquoi. Sa sortie est dans le terminal.`,
      fix: (cmd, code) => `${cmd} a échoué avec le code de sortie ${code}. Donne-moi seulement la solution : les commandes à lancer, dans un bloc de code, et une ligne sur pourquoi. Sa sortie est dans le terminal.`,
    },
  },
  de: {
    notFound: {
      explain: (cmd) => `Ich habe ${cmd} eingegeben und zsh findet diesen Befehl nicht. Warum, kurz?`,
      fix: (cmd) => `Ich habe ${cmd} eingegeben und zsh findet diesen Befehl nicht. Gib mir nur die Lösung: den Befehl, den ich meinte, oder die Befehle, um ihn zu bekommen, in einem Codeblock, und eine Zeile zum Warum.`,
    },
    failed: {
      explain: (cmd, code) => `${cmd} ist mit Exit-Code ${code} fehlgeschlagen. Erkläre kurz, warum. Die Ausgabe steht im Terminal.`,
      fix: (cmd, code) => `${cmd} ist mit Exit-Code ${code} fehlgeschlagen. Gib mir nur die Lösung: die Befehle, in einem Codeblock, und eine Zeile zum Warum. Die Ausgabe steht im Terminal.`,
    },
  },
  es: {
    notFound: {
      explain: (cmd) => `Escribí ${cmd} y zsh no encuentra ese comando. ¿Por qué, en breve?`,
      fix: (cmd) => `Escribí ${cmd} y zsh no encuentra ese comando. Dame solo la solución: el comando que quería, o los comandos para conseguirlo, en un bloque de código, y una línea sobre el porqué.`,
    },
    failed: {
      explain: (cmd, code) => `${cmd} falló con el código de salida ${code}. Explica brevemente por qué. Su salida está en la terminal.`,
      fix: (cmd, code) => `${cmd} falló con el código de salida ${code}. Dame solo la solución: los comandos a ejecutar, en un bloque de código, y una línea sobre el porqué. Su salida está en la terminal.`,
    },
  },
};

export function questionFor(alert, language = "en", intent = "explain") {
  const ask = QUESTIONS[language] ?? QUESTIONS.en;
  const cmd = `\`${alert.cmd.trim()}\``;
  const kind = alert.kind === "not-found" ? ask.notFound : ask.failed;
  return (kind[intent] ?? kind.explain)(cmd, alert.code);
}
