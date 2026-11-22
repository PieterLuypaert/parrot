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
import { checking, closeOverlay, exec, focused, hc, home, layout, nextCommand, notify, openOverlay, panes, props, setShared, shared, terminals, theme } from "herdr";
import { MOODS, PREVIEW_FOR, activity, blinkGap, corner, find, frame, mood, samePlace, shows, watched } from "./mood.js";
import {
  OUTPUT_LINES, TIMEOUT, claudeArgs, claudeCandidates, mask, messageId, parseAnswer, projectName, promptFor, tail,
  withMessage, withSession, without, withoutChat,
} from "./ask.js";

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

// The chat opens left of the parrot at `at`, its tail at the parrot's head.
function openChat(at) {
  openOverlay({ mod: "parrot", props: { chat: true }, kind: "window", frame: "none", width: CHAT_W, height: CHAT_H, at: { x: Math.max(0, at.x + 10 - CHAT_W), y: at.y } });
}

export default class Parrot extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.measure) return;
    if (p.button) return this.initButton(cx);
    if (p.chat) return this.initChat(cx);
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
    if (checking()) return;
    for (const id of [shared(CHAT), shared(OVERLAY)]) if (id) closeOverlay(id);
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
    if (want === open && !moved) { this.pending = 0; return; }
    if (Date.now() - this.pending < SETTLE) return;
    let chatWasOpen = false;
    if (open) {
      this.pending = Date.now();
      const chat = shared(CHAT);
      chatWasOpen = Boolean(chat);
      for (const id of [chat, shared(OVERLAY)]) if (id) closeOverlay(id);
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
    return mood({ terminal, idleFor: Date.now() - this.lastActive, preview: this.preview, thinking: Object.keys(busy()).length > 0 });
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

  perch(t) {
    if (props()?.token !== shared(PERCH)) {
      if (!this.closing && !checking()) {
        this.closing = true;
        closeOverlay(props()?.overlay);
      }
      return div();
    }
    this.shown = this.currentMood();
    const picture = FRAMES + frame(this.shown, this.blinking) + ".png";
    const above = { sleep: ["z", "z z", "z z Z", ""], think: [".", "..", "...", ""] }[this.shown];
    return div().id("parrot").relative().w(BOX).h(BOX).cursor_pointer()
      .tooltip(this.shown === "sleep" ? "Parrot is asleep: click to wake it and ask something" : "Ask Parrot about this project (⌥⇧⌘P)")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => {
        this.lastActive = Date.now();
        this.preview = null;
        this.toggleChat();
        cx.notify();
      })
      .child(div().relative().top(0).loop("top", SWAY[this.shown]).child(image(picture).w(SIZE).h(SIZE)))
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
    if (p.button) {
      this.sync(cx);
      return this.button(t);
    }
    return this.perch(t);
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
    const count = messages.length + (thinking ? 1 : 0);
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
          .child(this.chatList(t, messages, thinking, root))
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

  chatList(t, messages, thinking, root) {
    return v_flex().id("parrot-chat-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).px(12).py(12).gap(12)
      .when(messages.length === 0 && !thinking, (el) => el.child(this.emptyChat(t, root)))
      .children(messages.map((message, i) => this.message(t, message, i)))
      .when(thinking, (el) => el.child(h_flex().gap(8).items_center().text_size(12.5).text_color(t.muted)
        .child(image(FRAMES + "think.png").w(32).h(32))
        .child(div().child("Parrot is thinking"))
        .child(div().w(18).frames(["", ".", "..", "..."], 380))));
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
