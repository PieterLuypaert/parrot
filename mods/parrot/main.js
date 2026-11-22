// Parrot: a pixel parrot in the top right corner of the panes that watches the tab's terminal. It
// sways while calm, tilts its head while a command runs and falls asleep when nothing happens for a
// while. Click it to chat with your own Claude about the terminal's project. It needs a terminal
// pane in the tab: a tab with only an agent session cannot turn it on.
//
// One mod, four roles, by props:
// - {button: true}: the tab bar's on/off button, which install.sh adds. It is the copy that is
//   always there, so it opens, moves and closes the parrot as the tab and the layout change, takes
//   ⌥⌘P (parrot.toggle) and asks Claude the chat's questions, so an answer is never lost when the
//   chat closes.
// - {measure: true}: a strip two points high across the window, open for a moment, that tells the
//   button how wide the window is. Herdr gives mods no window size.
// - {perch: true, token}: the parrot itself, in a frameless window the button opens. A parrot whose
//   token is not the latest closes itself, so there is never more than one.
// - {chat: true}: the chat beside it, which a click on the parrot or ⌥⇧⌘P (parrot.chat) opens.
// `herdr-app do parrot.calm | parrot.watch | parrot.sleep | parrot.think` shows a mood for ten seconds.

import { View, div, image } from "gpui-kit";
import { Input, InputState, ScrollHandle, TextView, h_flex, v_flex } from "gpui-base";
import {
  checking, closeOverlay, exec, focused, hc, home, layout, nextCommand, notify, openOverlay, panes, props, readTextFile, run, setShared,
  shared, terminals, theme, watchFolder,
} from "herdr";
import { DANCE_BEAT, DANCE_BEATS, MOODS, PREVIEW_FOR, activity, blinkGap, corner, find, frame, mood, runsCommand, samePlace, shows, watched } from "./mood.js";
import {
  OUTPUT_LINES, SUGGEST_TIMEOUT, TIMEOUT, claudeArgs, claudeCandidates, mask, messageId, parseAnswer, parseSuggestions,
  projectName, promptFor, suggestArgs, suggestPrompt, tail, withMessage, withSession, without, withoutChat,
} from "./ask.js";
import { alertFor, headline, parseEvent, questionFor, reaction, wantsClaude } from "./events.js";
import { scriptsFrom, shellQuote } from "./shell.js";

const FRAMES = "mods/parrot/frames/";
const SIZE = 96;
const BOX = SIZE + 8;
const BUTTON = "parrot-button";
const CHAT_W = 440;
const CHAT_H = 520;
const TAIL = 10;
const SHADOW = 5;
const ON = "parrot.on";
const OPEN = "parrot.open";
const OVERLAY = "parrot.overlay";
const PERCH = "parrot.perch";
const WIDTH = "parrot.width";
const CORNER = "parrot.corner";
const CHAT = "parrot.chat";
const CHATS = "parrot.chats";
const ASK = "parrot.ask";
const BUSY = "parrot.busy";
const ALERT = "parrot.alert";
const ALERT_WINDOW = "parrot.alertWindow";
const DANCE_AT = "parrot.dance";
const ALERT_W = 380;
const SHAKE_FOR = 700;
const SETTLE = 1500;
const CALM = { from: 0, to: 2, period: 2800 };
const SWAY = { calm: CALM, watch: CALM, think: CALM, sleep: { from: 0, to: 3, period: 4200 } };
const LOST = "The answer was lost when Herdr closed or parrot reloaded. Ask again.";

// The parrot's own colours (scripts/sprite.js), so the chat looks like it belongs to the bird.
const RED = "#e0303f";
const RED_DARK = "#a81c31";
const YELLOW = "#f7bd1d";
const GREEN = "#38a35f";
const BLUE = "#2d6fe0";
const BLUE_DARK = "#1c438f";
const WHITE = "#ffffff";
const PIXEL_SHADOW = "#00000055";

const chats = () => shared(CHATS) ?? {};
const busy = () => shared(BUSY) ?? {};
const stop = (_e, cx) => cx.stop_propagation();

// The chat opens left of the parrot at `at`, its tail at the parrot's head. The alert beside the
// parrot closes first: the chat shows it itself, and the two would sit on top of each other.
function openChat(at) {
  const alertWindow = shared(ALERT_WINDOW);
  if (alertWindow) closeOverlay(alertWindow);
  openOverlay({ mod: "parrot", props: { chat: true }, kind: "window", frame: "none", width: CHAT_W, height: CHAT_H, at: { x: Math.max(0, at.x + 10 - CHAT_W), y: at.y } });
}

// An alert the person is still to act on; one whose suggestion they took waits, out of sight, for
// the next command in that terminal, to dance when it works.
const openAlertNow = () => {
  const alert = shared(ALERT);
  return alert && !alert.taken ? alert : null;
};

// What the parrot says about an error opens there too, as big as what it says.
function openAlert(at) {
  openOverlay({ mod: "parrot", props: { alert: true }, kind: "window", frame: "none", width: ALERT_W, at: { x: Math.max(0, at.x + 10 - ALERT_W), y: at.y } });
}

const parrotHome = () => `${home()}/.parrot`;
const lines = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

// A suggestion goes on the terminal's prompt without running, and that pane gets the focus, so
// Enter runs it. Only at the prompt: with vim, a REPL or a build running there, the text would go to
// that program. The alert stays, out of sight, so the parrot dances when the command works.
function putCommand(alert, command) {
  const terminal = terminals().find((one) => one.address === alert.terminal);
  if (!terminal) {
    notify({ title: "That terminal is gone", body: "Parrot cannot put the command there any more.", level: "warning" });
    setShared(ALERT, null);
    return;
  }
  if (runsCommand(terminal)) {
    notify({ title: "Something still runs in that terminal", body: "Parrot puts the command on the prompt once you are back at it: click again then.", level: "info" });
    return;
  }
  setShared(ALERT, { ...alert, taken: true });
  hc(["send", alert.terminal, ` parrot-put ${shellQuote(command)}`])
    .then((sent) => { if (sent.code !== 0) throw new Error(tail(sent.stderr, 1) || `hc send ended with ${sent.code}`); })
    .catch((error) => notify({ title: "Parrot could not reach the terminal", body: String(error?.message ?? error), level: "error" }));
  run("pane.focus", { terminal: alert.terminal });
}

// The git project a folder belongs to, so one chat covers it; outside git the folder itself.
async function projectRoot(cwd) {
  try {
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5000 });
    return top.code === 0 && top.stdout.trim() ? top.stdout.trim() : cwd;
  } catch (error) {
    notify({ title: "Parrot could not ask git where the project starts", body: `${error?.message ?? error}: this folder is the project.`, level: "warning" });
    return cwd;
  }
}

// "Ask Parrot" on an alert: the chat opens and the question goes to Claude with the terminal's
// output, as if you had typed it.
async function askAbout(alert) {
  setShared(ALERT, null);
  if (!shared(CHAT)) openChat(shared(CORNER) ?? { x: CHAT_W, y: 80 });
  const root = await projectRoot(alert.cwd);
  if (busy()[root]) {
    notify({ title: "Parrot is still answering", body: "Ask again when the answer is in.", level: "info" });
    return;
  }
  const question = questionFor(alert);
  const branch = panes().find((pane) => pane.terminal === alert.terminal)?.branch ?? null;
  setShared(CHATS, withMessage(chats(), root, { role: "you", text: question, id: messageId() }));
  setShared(BUSY, { ...busy(), [root]: true });
  setShared(ASK, { id: messageId(), root, cwd: alert.cwd, address: alert.terminal, branch, question });
}

export default class Parrot extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.measure) return;
    if (p.button) return this.initButton(cx);
    if (p.chat) return this.initChat(cx);
    if (p.alert) {
      if (!checking()) setShared(ALERT_WINDOW, p.overlay ?? null);
      return;
    }
    // Only the button opens the parrot. A window Herdr kept from an older version, or one opened
    // another way, closes at once.
    if (!p.perch) {
      if (!checking()) closeOverlay(p.overlay);
      return;
    }
    this.lastKey = null;
    this.lastActive = Date.now();
    this.blinking = false;
    this.preview = null;
    this.previews = 0;
    this.shown = "calm";
    if (checking() || p.token !== shared(PERCH)) return;
    setShared(OPEN, true);
    setShared(OVERLAY, p.overlay ?? null);
    this.blinkLater(cx);
    // Falling asleep is the one change nothing in Herdr announces, so look once a minute.
    cx.timer.every(60 * 1000, (cx) => { if (this.currentMood() !== this.shown) cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "chat") {
          // cx first: after a reload, the old build's loop ends here instead of opening it twice.
          cx.notify();
          this.toggleChat();
        } else if (MOODS.includes(command)) {
          this.showFor(command, cx);
        }
      }
    });
  }

  async close() {
    const p = props() ?? {};
    if (p.chat) {
      if (shared(CHAT) === p.overlay) setShared(CHAT, null);
      return;
    }
    if (p.alert) {
      if (shared(ALERT_WINDOW) === p.overlay) setShared(ALERT_WINDOW, null);
      return;
    }
    if (!p.perch || p.token !== shared(PERCH)) return;
    setShared(OPEN, false);
    setShared(OVERLAY, null);
  }

  // ---- The button ----

  // A new session starts with nothing open: windows do not outlive the app or a layout switch, and
  // after a reload the button closes what was left. A question still running then lost its answer,
  // which its chat says.
  initButton(cx) {
    this.since = Date.now();
    this.pending = 0;
    this.lastAsk = shared(ASK)?.id ?? null;
    this.alertShown = null;
    if (checking()) return;
    for (const id of [shared(CHAT), shared(OVERLAY), shared(ALERT_WINDOW)]) if (id) closeOverlay(id);
    setShared(ALERT, null);
    setShared(ALERT_WINDOW, null);
    this.markOff(shared(ON) !== true);
    this.watchEvents(cx);
    let all = chats();
    for (const root of Object.keys(busy())) all = withMessage(all, root, { role: "error", text: LOST, id: messageId() });
    setShared(CHATS, all);
    setShared(BUSY, {});
    setShared(OPEN, false);
    setShared(OVERLAY, null);
    setShared(CHAT, null);
    setShared(PERCH, null);
    openOverlay({ mod: "parrot", props: { measure: true }, kind: "window", frame: "none", width: 1, height: 2, at: { x: 0, y: 0 } });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command !== "toggle" && command !== "chat") continue;
        // cx first: after a reload, the old build's loop ends here instead of acting twice.
        cx.notify();
        if (command === "toggle") this.toggle();
        else if (shared(OPEN) !== true) this.explainChat();
      }
    });
  }

  // On or off, from the button or ⌥⌘P. Turning it on needs a terminal in the tab to watch.
  toggle() {
    const on = shared(ON) === true;
    if (!on && !this.terminal()) {
      notify({ title: "Parrot needs a terminal", body: "Open a terminal pane in this tab: parrot watches shells, not agents.", level: "info" });
      return;
    }
    setShared(ON, !on);
    if (on) setShared(ALERT, null);
    this.markOff(on);
  }

  // While parrot is off, ~/.parrot/off tells the zsh hook to write nothing.
  markOff(off) {
    const dir = parrotHome();
    const change = off ? exec("sh", ["-c", 'mkdir -m 700 -p "$1" && touch "$1/off"', "sh", dir]) : exec("rm", ["-f", `${dir}/off`]);
    change
      .then((done) => { if (done.code !== 0) throw new Error(tail(done.stderr, 1) || `ended with ${done.code}`); })
      .catch((error) => notify({ title: "Parrot could not tell the zsh hook", body: String(error?.message ?? error), level: "error" }));
  }

  // The zsh hook writes how each command ended under ~/.parrot/events; the button follows it. A
  // watch Herdr refuses or takes back is tried again after a moment, so parrot never goes deaf.
  watchEvents(cx) {
    const dir = `${parrotHome()}/events`;
    this.seen = {};
    cx.spawn(async (cx) => {
      let warned = false;
      for (;;) {
        try {
          await this.prepareEvents(dir);
          const changed = await watchFolder(dir);
          // cx first: after a reload, the old build's loop ends here instead of reacting twice.
          cx.notify();
          for (const path of changed) if (path.endsWith(".json")) await this.onEventSafely(path, dir);
          warned = false;
        } catch (error) {
          if (!warned) notify({ title: "Parrot lost sight of your terminals", body: `${error?.message ?? error}. It tries again.`, level: "warning" });
          warned = true;
          await cx.sleep(5000);
        }
      }
    });
  }

  // The folder only you can read, without the files of shells that are gone.
  async prepareEvents(dir) {
    if (this.prepared) return;
    const made = await exec("sh", ["-c", 'mkdir -m 700 -p "$1/events" && chmod 700 "$1" "$1/events"', "sh", parrotHome()]);
    if (made.code !== 0) throw new Error(`could not make ${dir}: ${tail(made.stderr, 1)}`);
    const listing = await exec("ls", [dir]);
    const alive = new Set(terminals().map((one) => String(one.pid)));
    const gone = lines(listing.stdout).filter((name) => /^\d+\./.test(name) && !alive.has(name.split(".")[0]));
    if (gone.length) await exec("rm", ["-f", ...gone.map((name) => `${dir}/${name}`)]);
    this.prepared = true;
  }

  async onEventSafely(path, dir) {
    try {
      await this.onEvent(path, dir);
    } catch (error) {
      notify({ title: "Parrot missed a command", body: String(error?.message ?? error), level: "warning" });
    }
  }

  // A command ended in a terminal: startle, dance or calm down, for the tab you look at only.
  async onEvent(path, dir) {
    if (shared(ON) !== true) return;
    const event = parseEvent(await readTextFile(path));
    if (!event || event.at * 1000 < this.since || event.at <= (this.seen[path] ?? 0)) return;
    this.seen[path] = event.at;
    const terminal = terminals().find((one) => one.pid === event.pid);
    const tab = terminal && panes().find((pane) => pane.terminal === terminal.address)?.tab;
    if (!tab || tab !== focused()?.tab) return;
    const what = reaction(event, shared(ALERT));
    if (what === "dance") setShared(DANCE_AT, Date.now());
    if (what === "dance" || what === "clear") setShared(ALERT, null);
    if (what !== "alarm") return;
    // A mistyped or misused command: your Claude says what you meant, and only your Claude. Any
    // other failure gets no suggestions, only Ask Parrot why.
    const output = await this.readOutput(terminal.address);
    const asking = wantsClaude(event, output);
    setShared(ALERT, { ...alertFor(event, { terminal: terminal.address, id: messageId(), output }), asking });
    if (!asking) return;
    const alert = shared(ALERT);
    const context = await this.contextOf(event, dir);
    this.askWhatYouMeant(alert, { output, ...context })
      .catch((error) => notify({ title: "Parrot could not ask your Claude", body: String(error?.message ?? error), level: "warning" }));
  }

  // Your history as the hook wrote it, and the project's scripts.
  async contextOf(event, dir) {
    const [history, packageJson, makefile, listing] = await Promise.all([
      readTextFile(`${dir}/${event.pid}.history`),
      readTextFile(`${event.cwd}/package.json`), readTextFile(`${event.cwd}/Makefile`),
      exec("ls", ["-a", event.cwd], { timeout: 5000 }),
    ]);
    const lockfiles = listing.code === 0 ? lines(listing.stdout) : [];
    return { history: lines(history), scripts: scriptsFrom({ packageJson, lockfiles, makefile }) };
  }

  // A quick question to your Claude on a fast model. Its guesses become the alert's while it is still
  // the same one; when Claude cannot answer, the alert says why.
  async askWhatYouMeant(alert, { output, scripts, history }) {
    const bin = await this.claudeBin();
    let result;
    if (!bin) {
      result = { error: `Parrot could not find the claude command (${this.claudeMiss}).` };
    } else {
      try {
        const prompt = suggestPrompt({ line: alert.cmd, code: alert.code, cwd: alert.cwd, output, scripts, history });
        result = parseSuggestions(await exec(bin, suggestArgs(prompt), { cwd: alert.cwd, timeout: SUGGEST_TIMEOUT }));
      } catch (error) {
        result = { error: `Claude could not suggest: ${error?.message ?? error}` };
      }
    }
    const now = shared(ALERT);
    if (now?.id !== alert.id) return;
    setShared(ALERT, { ...now, asking: false, answered: true, suggestions: result.suggestions ?? [], claudeError: result.error ?? null });
  }

  // ⌥⇧⌘P while the parrot is not out: say why nothing opens. The parrot itself opens the chat.
  explainChat() {
    const body = this.terminal() ? "Turn Parrot on first (⌥⌘P), then ⌥⇧⌘P opens its chat." : "Open a terminal pane in this tab: parrot chats about a terminal's project.";
    notify({ title: "Parrot is not out", body, level: "info" });
  }

  terminal() {
    return watched(focused(), panes(), terminals());
  }

  // The button keeps the parrot in step with the tab and the layout: out while parrot is on and the
  // tab has a terminal to watch, in the corner of the panes left of any panel that is open, and
  // closed otherwise, its chat too. A change it asked for gets a moment to land.
  sync(cx) {
    if (checking()) return;
    this.takeAsk(cx);
    const want = shows({ on: shared(ON) === true, terminal: this.terminal() });
    const open = shared(OPEN) === true;
    const width = shared(WIDTH);
    const at = width && width.at >= this.since ? corner(width.points, layout(), BOX) : null;
    const moved = Boolean(open && at && !samePlace(at, shared(CORNER)));
    if (want === open && !moved) {
      this.pending = 0;
      if (open) this.syncAlert();
      return;
    }
    if (Date.now() - this.pending < SETTLE) return;
    let chatWasOpen = false;
    if (open) {
      this.pending = Date.now();
      const chat = shared(CHAT);
      chatWasOpen = Boolean(chat);
      for (const id of [chat, shared(OVERLAY), shared(ALERT_WINDOW)]) if (id) closeOverlay(id);
      this.alertShown = null;
      if (!want) return;
    }
    if (!at) return;
    this.pending = Date.now();
    const token = messageId();
    setShared(CORNER, at);
    setShared(PERCH, token);
    openOverlay({ mod: "parrot", props: { perch: true, token }, kind: "window", frame: "none", at });
    // A chat that was open moves along with its parrot; the conversation is kept in shared state.
    if (chatWasOpen) openChat(at);
  }

  // What the parrot says about an error opens beside it while there is an alert and the chat is
  // closed; an open chat shows the alert itself.
  syncAlert() {
    const alert = openAlertNow();
    const win = shared(ALERT_WINDOW);
    const chatOpen = Boolean(shared(CHAT));
    if (win && (!alert || chatOpen)) {
      closeOverlay(win);
      this.alertShown = null;
      return;
    }
    if (!alert || win || chatOpen || this.alertShown === alert.id) return;
    this.alertShown = alert.id;
    openAlert(shared(CORNER) ?? { x: ALERT_W, y: 80 });
  }

  // The chat hands its question over in shared state; the button asks it, so the answer lands in
  // the conversation even when the chat has closed meanwhile.
  takeAsk(cx) {
    const ask = shared(ASK);
    if (!ask || ask.id === this.lastAsk) return;
    this.lastAsk = ask.id;
    cx.spawn(async (cx) => {
      const reply = await this.askClaude(ask);
      const message = reply.error ? { role: "error", text: reply.error } : { role: "parrot", text: reply.text };
      // After an error the next question starts a new conversation, so a broken one never sticks.
      const all = withSession(withMessage(chats(), ask.root, { ...message, id: messageId() }), ask.root, reply.error ? null : reply.session);
      setShared(CHATS, all);
      setShared(BUSY, without(busy(), ask.root));
      cx.notify();
    });
  }

  // Your own Claude, in the terminal's folder, with the terminal's last output (masked first, then
  // cut) and the project's conversation so far.
  async askClaude({ root, cwd, address, branch, question }) {
    const output = address ? await this.readOutput(address) : "";
    const prompt = promptFor({ question, cwd, branch, output });
    const bin = await this.claudeBin();
    if (!bin) return { error: `Parrot could not find the claude command (${this.claudeMiss}). Install Claude Code and log in, or put claude on your PATH.` };
    try {
      return parseAnswer(await exec(bin, claudeArgs({ prompt, session: chats()[root]?.session }), { cwd, timeout: TIMEOUT }));
    } catch (error) {
      return { error: `Parrot could not reach Claude: ${error?.message ?? error}` };
    }
  }

  // claude by name, else where installers put it: an app opened from the Dock gets a short PATH.
  async claudeBin() {
    if (this.claude) return this.claude;
    for (const bin of claudeCandidates(home())) {
      try {
        const run = await exec(bin, ["--version"], { timeout: 15000 });
        if (run.code === 0) return (this.claude = bin);
        this.claudeMiss = `${bin} ended with ${run.code}`;
      } catch (error) {
        this.claudeMiss = `${bin}: ${error?.message ?? error}`;
      }
    }
    return null;
  }

  async readOutput(address) {
    try {
      const read = await hc(["read", address, "--lines", String(OUTPUT_LINES * 2)]);
      if (read.code !== 0) return `(parrot could not read the terminal: ${tail(read.stderr, 1)})`;
      return tail(mask(read.stdout), OUTPUT_LINES);
    } catch (error) {
      return `(parrot could not read the terminal: ${error?.message ?? error})`;
    }
  }

  // The tab bar's button, drawn as Chartroom's is, beside it in the tab bar's row. Lit while the
  // parrot is out; dim in a tab without a terminal to watch, where it cannot be turned on.
  button(t) {
    const on = shared(ON) === true;
    const can = Boolean(this.terminal());
    const lit = on && can;
    const tip = !can ? "Parrot needs a terminal pane in this tab: it watches shells, not agents (⌥⌘P)"
      : on ? "Parrot is on and watches this tab's terminal. Click to turn it off (⌥⌘P)"
        : "Parrot is off: click to turn it on (⌥⌘P)";
    const isLast = find(layout(), (n) => n.id === "tabs-row")?.children?.at(-1)?.id === BUTTON;
    return h_flex().size_full().pr(isLast ? 10 : 3).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id(BUTTON).h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
        .bg(lit ? t.selected : t.chrome).text_color(lit ? t.foreground : can ? t.muted : t.dim)
        .hover((s) => s.bg(t.hover)).cursor_pointer()
        .tooltip(tip)
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.toggle(); cx.notify(); })
        .child(image(FRAMES + (lit ? "icon.png" : "icon-off.png")).w(16).h(16))
        .child("Parrot"));
  }

  // ---- The parrot ----

  blinkLater(cx) {
    cx.timer.after(blinkGap(), (cx) => {
      if (this.shown === "sleep") return this.blinkLater(cx);
      this.blinking = true;
      cx.notify();
      cx.timer.after(120, (cx) => {
        this.blinking = false;
        cx.notify();
        this.blinkLater(cx);
      });
    });
  }

  showFor(preview, cx) {
    const turn = ++this.previews;
    this.preview = preview;
    cx.notify();
    cx.timer.after(PREVIEW_FOR, (cx) => {
      if (turn !== this.previews) return;
      this.preview = null;
      cx.notify();
    });
  }

  currentMood() {
    const focus = focused();
    const terminal = watched(focus, panes(), terminals());
    const key = activity(focus, terminal);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastActive = Date.now();
    }
    return mood({
      terminal,
      idleFor: Date.now() - this.lastActive,
      preview: this.preview,
      thinking: Object.keys(busy()).length > 0,
      alarm: Boolean(openAlertNow()),
      dancing: Date.now() - (shared(DANCE_AT) ?? 0) < DANCE_BEAT * DANCE_BEATS,
    });
  }

  // Startled, it shakes once for each new alert; dancing, it steps by a short timer that stops by
  // itself. The other moods move natively.
  animate(cx) {
    const alert = openAlertNow();
    if (alert && alert.id !== this.alertSeen) {
      this.alertSeen = alert.id;
      this.shaking = true;
      cx.timer.after(SHAKE_FOR, (cx) => { this.shaking = false; cx.notify(); });
    }
    if (!alert) this.alertSeen = null;
    if (this.shown !== "dance" || this.beatTask) return;
    this.beat = 0;
    this.beatTask = cx.timer.every(DANCE_BEAT, (cx) => {
      this.beat += 1;
      if (this.currentMood() !== "dance") {
        this.beatTask.cancel();
        this.beatTask = null;
        this.beat = 0;
      }
      cx.notify();
    });
  }

  // The chat opens left of the parrot and moves along when the parrot does.
  toggleChat() {
    const id = shared(CHAT);
    if (id) {
      closeOverlay(id);
      setShared(CHAT, null);
      return;
    }
    openChat(shared(CORNER) ?? { x: CHAT_W, y: 80 });
  }

  perch(t, cx) {
    if (props()?.token !== shared(PERCH)) {
      if (!this.closing && !checking()) {
        this.closing = true;
        closeOverlay(props()?.overlay);
      }
      return div();
    }
    this.shown = this.currentMood();
    if (!checking()) this.animate(cx);
    const picture = FRAMES + frame(this.shown, this.blinking, this.beat ?? 0) + ".png";
    const above = { sleep: ["z", "z z", "z z Z", ""], think: [".", "..", "...", ""] }[this.shown];
    const alert = openAlertNow();
    const tip = alert ? `${headline(alert)}: click for help` : this.shown === "sleep" ? "Parrot is asleep: click to wake it and ask something" : "Ask Parrot about this project (⌥⇧⌘P)";
    let bird = div().relative().top(0).left(0).child(image(picture).w(SIZE).h(SIZE));
    if (this.shaking) bird = bird.loop("left", { from: -2, to: 2, period: 120 });
    let perch = div().relative().top(0).child(bird);
    if (SWAY[this.shown]) perch = perch.loop("top", SWAY[this.shown]);
    return div().id("parrot").relative().w(BOX).h(BOX).cursor_pointer()
      .tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => {
        this.lastActive = Date.now();
        this.preview = null;
        this.toggleChat();
        cx.notify();
      })
      .child(perch)
      .when(Boolean(above), (el) => el.child(
        div().absolute().top(2).right(4).text_size(13).font_semibold().text_color(t.muted).frames(above, this.shown === "think" ? 380 : 700),
      ));
  }

  measure() {
    return div().id("parrot-measure").size_full().on_size_change((size) => {
      if (this.measured || !size?.width) return;
      this.measured = true;
      setShared(WIDTH, { points: Math.round(size.width), at: Date.now() });
      closeOverlay(props()?.overlay);
    });
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    if (p.measure) return this.measure();
    if (p.chat) return this.chat(t, cx);
    if (p.alert) return this.alertWindow(t);
    if (p.button) {
      this.sync(cx);
      return this.button(t);
    }
    return this.perch(t, cx);
  }

  // ---- What the parrot says about an error ----

  // Beside the parrot, in the chat's pixel look, as big as what it says. It never drags.
  alertWindow(t) {
    const alert = openAlertNow();
    if (!alert) return div();
    return h_flex().id("parrot-alert").w_full().items_start().on_mouse_down("left", stop)
      .child(div().relative().flex_1().min_w(0).pr(SHADOW).pb(SHADOW)
        .child(div().absolute().top(SHADOW).left(SHADOW).right(0).bottom(0).bg(PIXEL_SHADOW))
        .child(v_flex().relative().bg(t.popover).text_color(t.foreground).border_2().border_color(RED_DARK)
          .child(this.stripe())
          .child(div().p(12).child(this.alertCard(t, alert, "window")))))
      .child(this.tail());
  }

  // The error in a line, the commands you probably meant, and Ask Parrot.
  alertCard(t, alert, where) {
    const ask = alert.kind === "failed" ? "Ask Parrot why" : "Ask Parrot";
    return v_flex().gap(8)
      .child(h_flex().gap(8).items_start()
        .child(div().px(6).font_bold().bg(RED).text_color(WHITE).child("!"))
        .child(div().flex_1().min_w(0).text_size(12.5).font_bold().child(headline(alert)))
        .child(this.chatButton(t, `parrot-alert-dismiss-${where}`, "×", "Dismiss", () => setShared(ALERT, null))))
      .when(Boolean(alert.asking), (el) => el.child(h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
        .child(image(FRAMES + "think.png").w(24).h(24))
        .child(div().child("Asking your Claude what you meant"))
        .child(div().w(18).frames(["", ".", "..", "..."], 380))))
      .when(Boolean(alert.claudeError), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(alert.claudeError)))
      .when(alert.suggestions.length > 0, (el) => el.child(div().text_size(12).text_color(t.muted).child("Your Claude thinks you meant")))
      .children(alert.suggestions.map((suggestion, i) => v_flex().id(`parrot-suggestion-${where}-${i}`).gap(2).px(10).py(6)
        .border_2().border_color(t.border).hover((s) => s.border_color(RED)).cursor_pointer()
        .tooltip("Put it on the prompt: Enter runs it")
        .on_click((_e, cx) => { putCommand(alert, suggestion.command); cx.notify(); })
        .child(div().w_full().text_size(13).font_bold().child(suggestion.command))
        .child(div().w_full().text_size(11).text_color(t.dim).child(suggestion.why))))
      .child(h_flex().gap(8).items_center()
        .child(div().id(`parrot-alert-ask-${where}`).h(30).px(12).flex().items_center().text_size(12.5).font_bold()
          .bg(RED).text_color(WHITE).border_b_2().border_color(RED_DARK).cursor_pointer().hover((s) => s.opacity(0.9))
          .tooltip("Ask your own Claude, with the terminal's output")
          .on_click((_e, cx) => { askAbout(alert); cx.notify(); })
          .child(ask))
        .when(alert.suggestions.length === 0 && alert.answered && !alert.claudeError, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Your Claude has no good guess for this one."))));
  }

  // ---- The chat ----

  initChat(cx) {
    this.input = InputState.new({ placeholder: "Ask about this project" });
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.roots = {};
    this.looking = {};
    this.seen = -1;
    this.problem = null;
    if (checking()) return;
    setShared(CHAT, props()?.overlay ?? null);
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
  }

  // The project is the git project of the terminal the parrot watches, so the chat follows the tab
  // and a cd into a subfolder keeps the same conversation. Outside git it is the folder itself.
  place(cx) {
    const terminal = watched(focused(), panes(), terminals());
    const cwd = terminal?.cwd ?? this.cwd ?? null;
    const branch = panes().find((pane) => pane.terminal === terminal?.address)?.branch ?? null;
    if (cwd && !(cwd in this.roots) && !this.looking[cwd] && cx && !checking()) {
      this.looking[cwd] = true;
      cx.spawn(async (cx) => {
        try {
          const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5000 });
          this.roots[cwd] = top.code === 0 && top.stdout.trim() ? top.stdout.trim() : cwd;
        } catch (error) {
          this.roots[cwd] = cwd;
          this.problem = `Parrot could not ask git where the project starts (${error?.message ?? error}), so this folder is the project.`;
        }
        cx.notify();
      });
    }
    return { terminal, cwd, branch, root: cwd ? this.roots[cwd] ?? cwd : null };
  }

  send(cx) {
    const question = this.input.value().trim();
    if (!question) return;
    const { terminal, cwd, branch, root } = this.place(cx);
    if (!cwd) {
      this.problem = "Parrot needs a terminal in this tab to know which project you mean.";
      cx.notify();
      return;
    }
    if (busy()[root]) return;
    this.cwd = cwd;
    this.problem = null;
    this.input.set_value("");
    setShared(CHATS, withMessage(chats(), root, { role: "you", text: question, id: messageId() }));
    setShared(BUSY, { ...busy(), [root]: true });
    setShared(ASK, { id: messageId(), root, cwd, address: terminal?.address ?? null, branch, question });
    cx.notify();
  }

  chat(t, cx) {
    const { cwd, branch, root } = this.place(cx);
    const messages = (root && chats()[root]?.messages) || [];
    const thinking = Boolean(root && busy()[root]);
    const alert = openAlertNow();
    const count = messages.length + (thinking ? 1 : 0) + (alert ? 1 : 0);
    if (count !== this.seen) {
      this.seen = count;
      if (count > 0) this.scroll.scroll_to_item(count - 1);
    }
    const where = root ? `${projectName(root)}${branch ? ` · ${branch}` : ""}` : "no terminal in this tab";
    // Every press stops here, so the chat never drags: it stays beside its parrot.
    return h_flex().id("parrot-chat").size_full().items_start().on_mouse_down("left", stop)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        closeOverlay(props()?.overlay);
        cx.stop_propagation();
      })
      .child(div().relative().flex_1().h_full()
        .child(div().absolute().top(SHADOW).left(SHADOW).right(0).bottom(0).bg(PIXEL_SHADOW))
        .child(v_flex().absolute().top(0).left(0).right(SHADOW).bottom(SHADOW).bg(t.popover).text_color(t.foreground)
          .border_2().border_color(RED_DARK)
          .child(this.stripe())
          .child(this.chatHeader(t, where, root, messages.length > 0 && !thinking))
          .child(this.chatList(t, messages, thinking, root, alert))
          .child(this.composer(t, thinking))))
      .child(this.tail());
  }

  // The parrot's wing colours, as a band across the top.
  stripe() {
    return h_flex().h(4).flex_none().children([RED, YELLOW, GREEN, BLUE].map((c) => div().flex_1().h_full().bg(c)));
  }

  // A speech bubble's tail in pixels, pointing right at the parrot's head.
  tail() {
    return v_flex().w(TAIL).flex_none().pt(34).children([8, 6, 4, 2].map((w) => div().w(w).h(3).bg(RED_DARK)));
  }

  chatHeader(t, where, root, canStartOver) {
    return h_flex().h(40).px(12).gap(8).flex_none().items_center().border_b_2().border_color(t.border)
      .child(image(FRAMES + "icon.png").w(16).h(16))
      .child(div().text_size(13).font_bold().text_color(RED).child("PARROT"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(where))
      .when(canStartOver, (el) => el.child(this.chatButton(t, "parrot-chat-new", "New chat", "Start over: forget this project's conversation", () => {
        setShared(CHATS, withoutChat(chats(), root));
      })))
      .child(this.chatButton(t, "parrot-chat-close", "×", "Close (Esc)", () => closeOverlay(props()?.overlay)));
  }

  // The conversation, with an alert as its latest item: it scrolls with the rest, so nothing is
  // squeezed, and it takes the place of the intro in a chat that is still empty.
  chatList(t, messages, thinking, root, alert) {
    return v_flex().id("parrot-chat-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).px(12).py(12).gap(12)
      .when(messages.length === 0 && !thinking && !alert, (el) => el.child(this.emptyChat(t, root)))
      .children(messages.map((message, i) => this.message(t, message, i)))
      .when(thinking, (el) => el.child(h_flex().gap(8).items_center().text_size(12.5).text_color(t.muted)
        .child(image(FRAMES + "think.png").w(32).h(32))
        .child(div().child("Parrot is thinking"))
        .child(div().w(18).frames(["", ".", "..", "..."], 380))))
      .when(Boolean(alert), (el) => el.child(div().p(10).border_2().border_color(RED_DARK).child(this.alertCard(t, alert, "chat"))));
  }

  composer(t, thinking) {
    return v_flex().flex_none().p(10).gap(6).border_t_2().border_color(t.border)
      .when(Boolean(this.problem), (el) => el.child(div().text_size(12).text_color(RED).child(this.problem)))
      .child(h_flex().gap(8).items_center()
        .child(Input.new(this.input).flex_1().h(34).px(10).border_2().border_color(this.inputFocused ? RED : t.input).bg(t.background).text_size(13).text_color(t.foreground))
        .child(div().id("parrot-chat-ask").h(34).px(14).flex().items_center().text_size(12.5).font_bold()
          .bg(thinking ? t.raised : RED).text_color(thinking ? t.muted : WHITE).border_b_2().border_color(thinking ? t.border : RED_DARK)
          .cursor_pointer().hover((s) => s.opacity(0.9)).on_click((_e, cx) => this.send(cx)).child("ASK")));
  }

  message(t, message, i) {
    const id = `parrot-message-${message.id ?? i}`;
    if (message.role === "you") {
      return h_flex().w_full().justify_end().child(div().max_w(330).px(10).py(6).bg(BLUE).text_color(WHITE).border_b_2().border_color(BLUE_DARK).text_size(13)
        .child(TextView.markdown(id, message.text).selectable(true)));
    }
    if (message.role === "error") {
      return h_flex().w_full().gap(8).items_start().text_size(12.5).text_color(RED)
        .child(div().px(6).font_bold().bg(RED).text_color(WHITE).child("!"))
        .child(div().flex_1().min_w(0).child(message.text));
    }
    return h_flex().w_full().gap(8).items_start()
      .child(image(FRAMES + "icon.png").w(16).h(16).flex_none())
      .child(div().flex_1().min_w(0).px(10).py(6).border_2().border_color(t.border).text_size(13)
        .child(TextView.markdown(id, message.text).selectable(true)));
  }

  emptyChat(t, root) {
    return h_flex().gap(12).items_start().py(6)
      .child(image(FRAMES + "calm.png").w(48).h(48).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(6).text_size(12.5).text_color(t.muted)
        .child(div().text_size(13).font_bold().text_color(t.foreground).child(root ? `Ask anything about ${projectName(root)}` : "Open a terminal in this tab first"))
        .child(div().child("How something works, where something lives, why a command failed. Parrot reads the project's files and the terminal's last output, and never changes anything."))
        .child(div().text_color(t.dim).child("On your own Claude subscription, with Sonnet.")));
  }

  chatButton(t, id, label, tip, action) {
    return h_flex().id(id).h(24).px(8).items_center().text_size(12).text_color(t.muted)
      .hover((s) => s.bg(t.hover)).cursor_pointer().tooltip(tip)
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(label);
  }
}
