// Which mood the parrot is in, from what the focused pane does. No Herdr imports, so it is tested
// with bun test.

export const SLEEP_AFTER = 10 * 60 * 1000;
export const PREVIEW_FOR = 10 * 1000;
export const MOODS = ["calm", "watch", "sleep"];

// The terminal the parrot watches: the focused one, unless an agent runs there (it has a Claude of
// its own) or nothing has the focus.
export function watched(focus, list) {
  if (!focus?.terminal || focus.agent) return null;
  const terminal = list.find((one) => one.address === focus.terminal);
  if (!terminal || terminal.program?.agent) return null;
  return terminal;
}

// A shell runs a command when what runs in it now is not the shell itself.
export function runsCommand(terminal) {
  if (!terminal) return false;
  if (terminal.program) return !terminal.program.shell && !terminal.program.agent;
  const now = terminal.foreground?.pid;
  return Boolean(now && terminal.pid && now !== terminal.pid);
}

// What counts as something happening: another pane taking the focus, or another program in it.
export function activity(focus, terminal) {
  return [focus?.terminal ?? "", terminal?.program?.key ?? "", terminal?.program?.name ?? "", terminal?.foreground?.pid ?? ""].join("|");
}

export function mood({ terminal, idleFor, preview }) {
  if (preview) return preview;
  if (runsCommand(terminal)) return "watch";
  if (idleFor >= SLEEP_AFTER) return "sleep";
  return "calm";
}

// The picture for a mood, with its eyes shut while it blinks. Asleep, they are shut anyway.
export function frame(current, blinking) {
  if (!blinking || current === "sleep") return current;
  return current === "watch" ? "watch-blink" : "blink";
}

// Four to seven seconds between blinks, as a real bird does it: never on a beat.
export function blinkGap(random = Math.random) {
  return 4000 + Math.floor(random() * 3000);
}
