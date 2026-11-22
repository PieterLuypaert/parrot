// Parrot: a pixel parrot in the top right corner of the window that watches the tab's terminal. It
// sways while calm, tilts its head while a command runs and falls asleep when nothing happens for a
// while. Click it to chat with your own Claude about the terminal's project. It needs a terminal
// pane in the tab: a tab with only an agent session cannot turn it on.
//
// One mod, four roles, by props:
// - {button: true}: the tab bar's on/off button, which install.sh adds. It is the copy that is
//   always there, so it also opens and closes the parrot as the tab changes, and takes ⌥⌘P
//   (parrot.toggle).
// - {measure: true}: a strip two points high across the window, open for a moment, that tells the
//   button how wide the window is. Herdr gives mods no window size.
// - {perch: true}: the parrot itself, in a frameless window the button opens.
// - {chat: true}: the chat beside it, which a click on the parrot opens.
// ⌥⇧⌘P (parrot.chat) opens or closes the chat as a click on the parrot does.
// `herdr-app do parrot.calm | parrot.watch | parrot.sleep | parrot.think` shows a mood for ten seconds.

import { View, div, image } from "gpui-kit";
import { Input, InputState, ScrollHandle, TextView, h_flex, v_flex } from "gpui-base";
import { checking, closeOverlay, exec, focused, hc, layout, nextCommand, notify, openOverlay, panes, props, setShared, shared, terminals, theme } from "herdr";
import { MOODS, PREVIEW_FOR, activity, blinkGap, corner, find, frame, mood, shows, watched } from "./mood.js";
import { OUTPUT_LINES, TIMEOUT, claudeArgs, mask, parseAnswer, projectName, promptFor, tail, withMessage, withSession, withoutChat } from "./ask.js";

const FRAMES = "mods/parrot/frames/";
const SIZE = 96;
const BOX = SIZE + 8;
const BUTTON = "parrot-button";
const KEY = "parrot-home";
const CHAT_KEY = "parrot-chat";
const CHAT_W = 420;
const CHAT_H = 520;
const ON = "parrot.on";
const OPEN = "parrot.open";
const OVERLAY = "parrot.overlay";
const WIDTH = "parrot.width";
const CORNER = "parrot.corner";
const CHAT = "parrot.chat";
const CHATS = "parrot.chats";
const THINKING = "parrot.thinking";
const SETTLE = 1500;
const CALM = { from: 0, to: 2, period: 2800 };
const SWAY = { calm: CALM, watch: CALM, think: CALM, sleep: { from: 0, to: 3, period: 4200 } };

const chats = () => shared(CHATS) ?? {};

export default class Parrot extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.measure) return;
    if (p.button) return this.initButton(cx);
    if (p.chat) return this.initChat(cx);
    // Only the button opens the parrot, in its corner. A window Herdr kept from an older version, or
    // one opened another way, closes at once.
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
    if (checking()) return;
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
      setShared(CHAT, null);
      if (this.busy) setShared(THINKING, false);
      return;
    }
    if (!p.perch) return;
    setShared(OPEN, false);
    setShared(OVERLAY, null);
  }

  // A new session starts with nothing open: windows do not outlive the app or a layout switch.
  // Should one still be open, opening it again under the same key replaces it, so it is never there
  // twice.
  initButton(cx) {
    this.since = Date.now();
    this.pending = 0;
    if (checking()) return;
    setShared(OPEN, false);
    setShared(OVERLAY, null);
    setShared(CHAT, null);
    setShared(THINKING, false);
    openOverlay({ mod: "parrot", props: { measure: true }, kind: "window", frame: "none", width: 1, height: 2, at: { x: 0, y: 0 } });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command !== "toggle") continue;
        // cx first: after a reload, the old build's loop ends here instead of toggling twice.
        cx.notify();
        this.toggle();
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

  terminal() {
    return watched(focused(), panes(), terminals());
  }

  // The button keeps the parrot in step with the tab: open while parrot is on and the tab has a
  // terminal to watch, closed otherwise, its chat too. A change it asked for gets a moment to land
  // before it asks again.
  sync() {
    if (checking()) return;
    const want = shows({ on: shared(ON) === true, terminal: this.terminal() });
    const open = shared(OPEN) === true;
    if (want === open) { this.pending = 0; return; }
    if (Date.now() - this.pending < SETTLE) return;
    if (!want) {
      for (const id of [shared(CHAT), shared(OVERLAY)]) if (id) closeOverlay(id);
      this.pending = Date.now();
      return;
    }
    const width = shared(WIDTH);
    if (!width || width.at < this.since) return;
    const at = corner(width.points, layout(), BOX);
    setShared(CORNER, at);
    openOverlay({ mod: "parrot", props: { perch: true }, kind: "window", frame: "none", key: KEY, at });
    this.pending = Date.now();
  }

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
    return mood({ terminal, idleFor: Date.now() - this.lastActive, preview: this.preview, thinking: shared(THINKING) === true });
  }

  // The chat opens beside the parrot, to its left; after you drag it, Herdr keeps its spot.
  toggleChat() {
    const id = shared(CHAT);
    if (id) {
      closeOverlay(id);
      setShared(CHAT, null);
      return;
    }
    const at = shared(CORNER) ?? { x: CHAT_W + 8, y: 80 };
    openOverlay({ mod: "parrot", props: { chat: true }, kind: "window", key: CHAT_KEY, width: CHAT_W, height: CHAT_H, at: { x: Math.max(0, at.x - CHAT_W - 8), y: at.y } });
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    if (p.measure) return this.measure();
    if (p.chat) return this.chat(t);
    if (p.button) {
      this.sync();
      return this.button(t);
    }
    return this.perch(t);
  }

  perch(t) {
    this.shown = this.currentMood();
    const picture = FRAMES + frame(this.shown, this.blinking) + ".png";
    const above = { sleep: ["z", "z z", "z z Z", ""], think: [".", "..", "...", ""] }[this.shown];
    return div().id("parrot").relative().w(BOX).h(BOX).cursor_pointer()
      .tooltip(this.shown === "sleep" ? "Parrot is asleep: click to wake it and ask something" : "Ask Parrot about this project")
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
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { this.toggle(); cx.notify(); })
        .child(image(FRAMES + (lit ? "icon.png" : "icon-off.png")).w(16).h(16))
        .child("Parrot"));
  }

  // ---- The chat ----

  initChat(cx) {
    this.input = InputState.new({ placeholder: "Ask about this project" });
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.busy = false;
    this.seen = -1;
    this.problem = null;
    if (checking()) return;
    setShared(CHAT, props()?.overlay ?? null);
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
  }

  // The project is the folder of the terminal the parrot watches, so the chat follows the tab.
  place() {
    const terminal = watched(focused(), panes(), terminals());
    const cwd = terminal?.cwd ?? this.cwd ?? null;
    const branch = panes().find((pane) => pane.terminal === terminal?.address)?.branch ?? null;
    return { terminal, cwd, branch };
  }

  send(cx) {
    const question = this.input.value().trim();
    if (!question || this.busy) return;
    const { terminal, cwd, branch } = this.place();
    if (!cwd) {
      this.problem = "Parrot needs a terminal in this tab to know which project you mean.";
      cx.notify();
      return;
    }
    this.cwd = cwd;
    this.problem = null;
    this.input.set_value("");
    this.busy = true;
    setShared(CHATS, withMessage(chats(), cwd, { role: "you", text: question }));
    setShared(THINKING, true);
    cx.notify();
    cx.spawn(async (cx) => {
      const reply = await this.ask({ question, terminal, cwd, branch });
      let all = withMessage(chats(), cwd, reply.error ? { role: "error", text: reply.error } : { role: "parrot", text: reply.text });
      if (!reply.error) all = withSession(all, cwd, reply.session);
      setShared(CHATS, all);
      setShared(THINKING, false);
      this.busy = false;
      cx.notify();
    });
  }

  // Your own Claude, in the project's folder, with the terminal's last output and the conversation
  // so far.
  async ask({ question, terminal, cwd, branch }) {
    const output = terminal ? await this.readOutput(terminal.address) : "";
    const prompt = promptFor({ question, cwd, branch, output });
    try {
      return parseAnswer(await exec("claude", claudeArgs({ prompt, session: chats()[cwd]?.session }), { cwd, timeout: TIMEOUT }));
    } catch (error) {
      return { error: `Parrot could not reach Claude: ${error?.message ?? error}` };
    }
  }

  async readOutput(address) {
    try {
      const read = await hc(["read", address, "--lines", String(OUTPUT_LINES)]);
      if (read.code !== 0) return `(parrot could not read the terminal: ${tail(read.stderr, 1)})`;
      return mask(tail(read.stdout, OUTPUT_LINES));
    } catch (error) {
      return `(parrot could not read the terminal: ${error?.message ?? error})`;
    }
  }

  chat(t) {
    const { cwd, branch } = this.place();
    const messages = (cwd && chats()[cwd]?.messages) || [];
    const thinking = this.busy;
    const count = messages.length + (thinking ? 1 : 0);
    if (count !== this.seen) {
      this.seen = count;
      if (count > 0) this.scroll.scroll_to_item(count - 1);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const where = cwd ? `${projectName(cwd)}${branch ? ` · ${branch}` : ""}` : "no terminal in this tab";
    const header = h_flex().h(40).px(12).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
      .child(image(FRAMES + "icon.png").w(16).h(16))
      .child(div().text_size(13).font_semibold().child("Parrot"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(where))
      .when(messages.length > 0 && !thinking, (el) => el.child(this.chatButton(t, "parrot-chat-new", "New chat", "Start over: forget this project's conversation", () => {
        setShared(CHATS, withoutChat(chats(), cwd));
      })))
      .child(this.chatButton(t, "parrot-chat-close", "×", "Close (Esc)", () => closeOverlay(props()?.overlay)));
    const list = v_flex().id("parrot-chat-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).px(14).py(12).gap(12)
      .on_mouse_down("left", stop)
      .when(messages.length === 0 && !thinking, (el) => el.child(this.emptyChat(t, cwd)))
      .children(messages.map((message, i) => this.message(t, message, i)))
      .when(thinking, (el) => el.child(h_flex().gap(2).text_size(12.5).text_color(t.muted)
        .child("Parrot is thinking").child(div().w(18).frames(["", ".", "..", "..."], 380))));
    const composer = v_flex().flex_none().p(10).gap(6).border_t(1).border_color(t.border).on_mouse_down("left", stop)
      .when(Boolean(this.problem), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.problem)))
      .child(h_flex().gap(8).items_center()
        .child(Input.new(this.input).flex_1().h(34).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(13).text_color(t.foreground))
        .child(h_flex().id("parrot-chat-ask").h(34).px(12).items_center().rounded(8).text_size(12.5).font_medium()
          .bg(thinking ? t.raised : t.solid).text_color(thinking ? t.muted : t.solid_foreground).cursor_pointer()
          .hover((s) => s.opacity(0.88)).on_click((_e, cx) => this.send(cx)).child("Ask")));
    return v_flex().id("parrot-chat").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        closeOverlay(props()?.overlay);
        cx.stop_propagation();
      })
      .size_full().bg(t.popover).text_color(t.foreground)
      .child(header).child(list).child(composer);
  }

  message(t, message, i) {
    if (message.role === "you") {
      return h_flex().w_full().justify_end().child(div().max_w(320).px(10).py(6).rounded(10).bg(t.selected).text_size(13)
        .child(TextView.markdown(`parrot-message-${i}`, message.text).selectable(true)));
    }
    if (message.role === "error") return div().w_full().text_size(12.5).text_color(t.blocked).child(message.text);
    return div().w_full().text_size(13).child(TextView.markdown(`parrot-message-${i}`, message.text).selectable(true));
  }

  emptyChat(t, cwd) {
    return v_flex().gap(6).py(8).text_size(12.5).text_color(t.muted)
      .child(div().text_size(13).font_medium().text_color(t.foreground).child(cwd ? `Ask anything about ${projectName(cwd)}` : "Open a terminal in this tab first"))
      .child(div().child("How something works, where something lives, why a command failed. Parrot reads the project's files and the terminal's last output, and never changes anything."))
      .child(div().text_color(t.dim).child("On your own Claude subscription, with Sonnet."));
  }

  chatButton(t, id, label, tip, action) {
    return h_flex().id(id).h(24).px(8).items_center().rounded(6).text_size(12).text_color(t.muted)
      .hover((s) => s.bg(t.hover)).cursor_pointer().tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(label);
  }
}
