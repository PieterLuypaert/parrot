# Parrot: plan

Plan version 10, 23 November 2026. Changes to this plan are in the git history of this folder; the sketch shows the same plan version.

A pixel-art parrot in the Herdr app that watches while you work. When it sees an error, in your terminal or beyond it (your stack's logs, your PR's CI, your local app in the browser), it startles. Click it and your own Claude works out what went wrong and explains it in a speech bubble, with a fix as a command you run with one click. You can also ask it anything yourself, at any time.

It skips agent panes (Claude Code, Codex, ...), because a Claude is already at work there.

Visual sketch: `sketch/moods.html`, published as an artifact: https://claude.ai/artifact/1fH5s1mvty964pwgxpqzQ7

## What you see

| Mood | When | What it does |
|---|---|---|
| Calm | Nothing going on | Sits on its perch, sways gently, blinks now and then |
| Asleep | Nothing has happened for a while | Head down, eyes closed, "z z" |
| Watching | A command is running | Head tilted, looking at the text |
| Startled | It sees an error: a command with an error code, an error in your stack's logs, a red CI check or an error in your local app | Feathers up, eyes wide, beak open, a red exclamation mark, a short squawk |
| Thinking | Claude is working on your question | Looks up, "..." in the bubble |
| Dancing | The command after a fix succeeds | Wings up and down, bobs back and forth |

It stays in its corner until you click. It opens nothing by itself and pushes nothing in front of you.

- **On an error**, the bubble says where it saw it: `zsh · shop-api`, `docker · api-1`, `CI · test (web)` or `browser · localhost:3000`.
- **Without a current error**, a click shows "What it saw" (the last five alerts) and the question bar.

## Asking questions

The question bar is always in the bubble. Click the parrot, or press ⌥⇧⌘P (free in your `keys.json`).

- **What you can ask:**
  - about an error: "why does this fail?";
  - about the code: "where is that mail sent?";
  - about your stack: "is everything from this worktree running?";
  - about anything: "how do I restore a postgres dump?".
- **Context that goes along by itself:** the focused pane (folder, branch, last output), what it saw recently, and `git status` of that repo. Other panes only when you ask for them.
- **Follow-up questions:** every conversation is a Claude session. The first answer gives a session id (`claude -p --output-format json`), and follow-ups continue it with `--resume <id>`. There is one conversation per pane, until you close the bubble.
- **Pasting:** paste an error from somewhere else (Slack, Sentry, an email) into the question bar. It explains it in the context of the pane's repo.
- **As a chatbot:** the bubble is a conversation. Your questions and its answers stay in it until you close it. For a longer conversation, a button opens a bigger window (`openOverlay({ kind: "window" })`) with the whole history.
- **Navigating:** an answer can have buttons that take you somewhere, each with one click:
  - to the pane or tab where something runs (`run("pane.focus", ...)`, `run("tab.select", ...)`). Ask "where does the api of feat/login run?" and it takes you to that pane;
  - to a file at the right line in Cursor (`cursor -g <file>:<line>`);
  - to the PR, the CI run or the page in your browser (`open <url>`).
- **Same rules as for explanations:** Claude only reads, only runs checks from the fixed list, and commands run only after your click.

## How it works

Three parts:

1. **The mod** in the Herdr app: the parrot, the bubble and the button. It does nothing heavy itself. It follows `~/.parrot/events/` with `watchFolder`, shows what comes in and calls Claude after a click.
2. **The zsh hook** (`preexec` and `precmd`, one file you source in `.zshrc`) writes a line to `~/.parrot/events/` after every command: the command, the exit code, the folder, the duration, the time and the shell's pid. Parrot links the pid to a terminal through `hc ls --json` (the `pid` field).
3. **The watcher** (`parrot-watch`): a small Bun script that runs in the background as a herdr-core terminal (`hc run --bg --name parrot-watch`). The mod starts it when parrot is on and stops it with `hc kill parrot-watch` when you turn it off. It follows the sources beyond the terminal (see Sources) and writes what it sees as events in the same folder. The mod cannot do that itself, because `exec` stops after 10 minutes at most.

After a click:

1. **Gather context.** For a terminal error, parrot cuts the output of that one command out of `hc read`, between the prompt lines. For other errors it takes the log lines, the CI log or the browser error from the event. The folder, the branch and `git status` always go along.
2. **Mask secrets and ask Claude:** `claude -p --output-format json`, with only tools that read and the fixed list of checks (see Accuracy).
3. **Show the answer.** The bubble shows the answer with the label Checked or Hunch, the lines it rests on and the suggested fix as a button.
4. **Run the fix, with one click.** A fix can have several steps, but it stays one button.
   - Parrot sends the first step with `hc send <terminal> "<cmd>"` and waits until the hook reports exit code 0 for that terminal. Then it sends the next step.
   - The bubble shows which step is running and which are done.
   - If a step fails, it stops and startles again, with that error as context.

## On and off

A **Parrot** button in the tab bar, next to your other mod buttons such as Chartroom, turns it on or off. ⌥⌘P does the same (`parrot.toggle`).

- **Only with a terminal in the tab:** parrot watches shells, not agents.
  - In a tab with only an agent session you cannot turn it on: the button is dim, and a click or ⌥⌘P shows a notice.
  - If the tab has a terminal pane, it watches that one, also while you type in the agent session beside it.
- **On:** the parrot stands in the top right of the window, under the tab bar and the panes' title bar. If you drag it somewhere else, Herdr remembers that spot. The watcher, once there is one, starts too.
- **Off:** the window closes, the watcher stops, and the hook writes nothing while `~/.parrot/off` exists. No watching, no squawk and no Claude.
- **The button** shows a small parrot head: in colour while the parrot is out, grey while it is off or the tab has no terminal.

`install.sh` puts the button in the tab bar as chartroom does (a `parrot-button` block with the mod and `props: { button: true }` in the tab bar's row) and binds ⌥⌘P and ⌥⇧⌘P when those keys are free.

## Accuracy

Tested on one of your shells: `hc read` returns a pane's literal text, with the prompt lines, without colours, and with the whole history (`"complete": true`).

| Step | How good | What we do |
|---|---|---|
| What it sees | Literal text, no screenshot. It misses the colours, and of full-screen programs (vim, htop, lazygit) only the current screen | Recognise errors by words, not by colour |
| Which output belongs to which command | Good: the hook knows the command and the time, and the prompt lines are in the text | Cut between that command's prompt and the next. For long output, the start, the end and the lines with `error`, `fail` or `exception` |
| Recognising errors beyond the terminal | With patterns per source, so false alarms are possible | Own rules per source, the same error in a row counts as one alert with a counter, and a "this is no error" button that silences that pattern |
| The diagnosis | Depends on what Claude may check | Three levels, below |

The three levels of the diagnosis:

1. **Only the text:** good for known errors (stack traces, ports in use, missing modules, git conflicts), but sometimes a guess.
2. **With the code:** Read, Grep and Glob, so Claude looks up the file and the line from a stack trace.
3. **With checks that only read:** a fixed list of commands Claude may run itself, through `--allowedTools "Bash(<command>:*)"`. To start with: `git status`, `git log -5`, `git diff --stat`, `docker compose ps`, `docker compose logs --tail`, `lsof -i`, `node -v`, `pnpm -v` and `gh pr checks`. Nothing that writes, stops or installs.

Every answer gets a label: **Checked**, with the check it ran, or **Hunch**, when it only goes by the text. Under it are the lines it rests on.

**Secrets.** Before anything goes to Claude, parrot masks known patterns: API keys, tokens, JWTs, passwords in URLs and values from `.env`. That does not catch everything, which is why nothing leaves before your click.

## Sources: errors beyond the terminal

**Out of scope for now** (since plan version 4): the watcher, your stack's logs, your PR's CI and the browser extension. Parrot sticks to the terminal and to what you paste into the chat yourself. This section stays as an idea for later.

The watcher recognises errors locally, with patterns, without Claude. Claude only comes in after your click.

| Source | What it sees | How | When |
|---|---|---|---|
| Commands in your shells | A command that ends with an error code | The zsh hook | v1 |
| Pasting | An error from anywhere (Slack, Sentry, an email) | The question bar | v1 |
| Running programs in other panes (dev server, test watcher) | An error that shows up while the program keeps running | The watcher reads those panes with `hc read` when they change and looks for new error lines | v2 |
| Your stack's logs | Errors in the worktree's containers (api, worker, db) | `docker compose logs --follow`, per worktree with a wt stack | v2 |
| What you changed recently | No errors, but context: "you just changed that file" | `git diff` and `git log` with the explanation | v2 |
| Your PR's CI | A red check on a worktree's branch | `gh pr checks` every few minutes; for the explanation `gh run view --log-failed` | v3 |
| Your local app in the browser | Console errors and failed requests (4xx and 5xx) on localhost | A small Chrome extension that only follows localhost and sends to the watcher on `127.0.0.1` | v4 |

How it lets you know:

- **You are looking at Herdr:** it startles and squawks.
- **You are somewhere else, in the browser for example:** a Herdr notification with `notify()` as well, so you see it when you come back.
- **Silent mode:** only the exclamation mark, no sound.

## What parrot can do in the Herdr app

Each point below rests on something the Herdr app or herdr-core offers today (`~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `gpui-kit.d.ts`, `hc --help`).

| Can | How |
|---|---|
| Stand free, without a card around it, and be dragged | A frameless window: `openOverlay({ kind: "window", frame: "none", key: "parrot-corner", at })`. Herdr remembers where you put it |
| Or sit as a card at the edge of the work area | A floating block in the layout (`floating`, `edge`, `align`); Herdr always draws a frame with a shadow around it |
| An on/off button in the tab bar, next to your other mod buttons | A block with the mod in the tab bar's row, like `chartroom-button`; the button opens or closes the window |
| Sit half behind the edge, so it covers no terminal text | `peek` on a floating block at a side: only its head sticks out until you hover over it |
| Show a full-colour pixel-art parrot | `image()` with PNG frames from the mod's folder |
| Animate | Native: `loop("top")` for swaying, `loop("left")` for shaking, `frames()` for the z's and the "...". A timer only for one blink frame every few seconds and for short sequences (startling, dancing, talking) |
| Know which pane has focus and what runs there | `panes()`, `focused()`, `agents()`; `hc ls --json` gives the foreground program per terminal |
| Read a pane's text | `hc read <t> --lines N`: screen plus history |
| Run a helper in the background | `hc run --bg --name parrot-watch` starts it as a herdr-core terminal; `hc kill parrot-watch` stops it |
| Follow when terminals change | `hc events` gives every change as a JSON line |
| Ask your own Claude, with follow-up questions | `exec("claude", ["-p", ...])`, at most 10 minutes per call; `--resume <session-id>` for a follow-up |
| Run a fix in the pane, step by step | `hc send <t> <text>` (pastes and presses Enter, waits when you have half typed something yourself); after each step parrot waits for the hook event with exit code 0 |
| Take you somewhere | `run("pane.focus", ...)`, `run("tab.select", ...)`, `cursor -g <file>:<line>`, `open <url>` |
| Make a sound | `playSound(<mp3>)`: a squawk of its own |
| Notify you while you look elsewhere | `notify()`, the toast you already have |
| Keep settings and memory | Shared state per mod (silent mode, pirate talk on or off, model, silenced patterns) |
| Open a bigger window for a long answer | `openOverlay({ kind: "window" })`, draggable, without a border if we want |

## What parrot cannot do

| Cannot | Why | What we do |
|---|---|---|
| Draw in the terminal text itself, between your lines | Mods only draw in their own block or overlay | It stands above the work area, not in it |
| Know by itself that a command failed | herdr-core only gives the exit code of the terminal itself, not of each command in it | The zsh hook |
| Keep following from the mod itself | `exec` stops after 10 minutes at most | The watcher runs as a herdr-core background terminal |
| Look into the browser | The Herdr app has no access to your browser | A Chrome extension for localhost (v4) |
| Notice that a dev server started fine | The hook only sees commands that end; `pnpm dev` keeps running | The watcher does see a running server's errors (v2); it only dances after commands that end |
| Sit exactly on the edge of one particular pane | `panes()` gives no position in pixels; a floating block belongs to one part of the layout | v1: one parrot that names the pane with the error. Spike: let it sit in the pane header (see Questions for the spike) |
| Fly freely over the whole window | A transparent window over everything would catch your clicks | Flying off and landing as an animation inside its own window |
| Rotate or scale as an animation | Native motion only knows `opacity`, `width`, `height`, `left`, `top` | We draw the tilted head, the wings and the dance as separate frames |
| Use HTML, CSS or a web view | Mods are native GPUI | Everything as native elements and PNG frames |
| Show Claude's answer word by word | `exec` gives the output only when the program is done | "Thinking" until the answer is there; later perhaps `--output-format stream-json` to a file the mod follows |
| Watch an agent pane | Technically possible, but a Claude is already at work there, and we do not disturb its context | It skips agent panes |
| Follow shells on another machine | `watchFolder` only works locally | v1 local only; later polling with `readTextFile({ on })` |

## Privacy, cost and safety

- **Recognising happens locally.** The hook and the watcher use patterns, not Claude.
- **Claude, only after your click or on a typo.** Nothing goes to Claude until you click the parrot or ask something. The one exception (since plan version 7, at your request) is a command zsh cannot find, or that its output says was used wrong. Then parrot asks your Claude at once what you meant: with Haiku, without tools and without a saved session, with the line, the masked output, the project's scripts and the commands you use. A failing test run or build does wait for your click.
- **What goes along:** only the context of that one error or question (see How it works), with the secrets masked.
- **Claude only reads:** Read, Grep, Glob and the fixed list of checks. Never Edit, Write or free Bash.
- **One click, also for what throws something away.** A fix runs only after your click, and never takes more than one click.
  - Commands that throw away or overwrite something (`rm -rf`, `git reset --hard`, `git push --force`, `kill`, `DROP`, `docker system prune`, ...) get a red label and run only after 3 seconds.
  - In that time a click or Esc cancels. No confirm click is needed.
- **Rather press Enter yourself?** A setting puts such a command on your prompt without Enter, so you still see it and start it yourself. zsh's `print -z` can do that, also with `&&` and pipes (tested in the spike); an invisible alternative through the clipboard we test in PR 4.
- **The browser extension** only follows localhost and only sends to `127.0.0.1`.
- **Off is off:** no hook events, no watcher and no Claude.
- **Model:** a fast model by default for the first explanation; follow-up questions on the model you pick, like chartroom's Ask.

## Questions for the spike

1. **Where it sits.** Three candidates, in order of preference:
   - a frameless window (`frame: "none"`): stands free and can be dragged. Is the background really transparent around the sprite, and does it stay when you switch tabs?
   - a floating block: reliable and with `peek`, but always in a card;
   - the pane header: every pane has a header mod (`pane`, 30 px high). If we clone it, it can sit exactly on the pane with the error and "fly" from pane to pane. Is 30 px big enough for a readable parrot?
2. **Switching frames** with `cx.sleep` at about 8 per second: smooth enough, and frugal enough when it sits calm for hours? Sitting still can do without a timer, with native motion only.
3. **The zsh hook** beside the shell integration of Ghostty and Herdr: do they stay out of each other's way, and does it also catch commands with pipes and `&&`?
4. **Speed** of `claude -p` for a first explanation: how many seconds until the bubble is there, per model?
5. **The button and the kept window.** After a restart Herdr opens the window again (`keep: true`), with a new id. The button must find it again to be able to close it, through the mod's shared state.
6. **The watcher as a background terminal.** Does a terminal from `hc run --bg` stay out of your tabs, and how does the mod start it again after a herdr-core restart?
7. **`hc events`:** does it report new output too, or must the watcher read panes with running programs every few seconds?
8. **False alarms:** how many do the patterns give on real dev server and container logs from your own stacks?
9. **On your prompt without Enter:** does `hc keys` type a command with spaces, `&&` and pipes correctly, key by key?

## Outcome of the spike

Tested on 22 November 2026 in the Herdr app, on branch `spike/perch` (not merged).

1. **Where it sits:** in a frameless window.
   - The background really is transparent: the parrot stands free on the terminal, without a card or a shadow. A floating block and the pane header are no longer needed.
   - `mod.json` can describe the window itself (`"overlay": { "kind": "window", "frame": "none", "key": "parrot" }`), and `mod.open` opens and closes it. In PR 1 a `parrot.toggle` of its own through the button turned out better; see point 5.
   - `herdr-app do parrot.<command>` reaches the window. That way the hook and the watcher can startle it later.
   - A mod behind a symlink does not reload on save. Closing and reopening the window loads the new version; `install.sh` links again, as with chartroom.
2. **Animation:** Herdr advises against timers for animation, because every redraw redraws the whole window.
   - Calm, watching and asleep are therefore native: swaying with `loop("top")` and the z's as text with `frames()`. A blink is one frame every 4 to 7 seconds.
   - Only short sequences (startling, dancing, talking) run on a timer. All moods show correctly.
3. **The zsh hook:** works.
   - It gives the right exit code, also with pipes and `&&`, and valid JSON, also with quotes and backslashes.
   - It is first in `precmd_functions`, so `$?` is still the command's. From PR 2 it puts itself back in front on every command, in case another hook moves ahead later.
4. **Speed:** `claude -p` with a system prompt of its own, only Read, Grep and Glob, and no MCP servers gives an answer in about 4.5 s on Haiku and 5 s on Sonnet.
   - `--bare` is out: it only uses an API key, not your subscription.
   - Your own `~/.claude/CLAUDE.md` is loaded too: the answer followed its instructions on tone. In PR 3 we look for how parrot keeps a tone of its own.
5. **The button and the window** (adjusted during PR 1, after your test):
   - `at: "pointer"` does not work for windows, and Herdr remembers a window's first spot per `key`.
   - A mod does not know the size of the Herdr window. The button therefore measures it once per session with a 2-point-high strip across the full width (`width: 1`), and then opens the parrot in the top right.
   - The button is the copy of parrot that is always there. It opens and closes the parrot itself when the tab changes, and takes ⌥⌘P (`parrot.toggle`).
   - A parrot window the button did not open itself, such as a kept window from an older version, closes at once.
6. **The watcher as a background terminal:** a terminal from `hc run --bg --no-parent --name ...` does not show in your Herdr window.
7. **`hc events`** only reports which program runs in the foreground (the start and end of a command), no output. So the watcher reads panes with a running program itself, every few seconds.
8. **False alarms:** to be measured once the watcher is built, with real logs.
9. **On your prompt without Enter:**
   - `hc keys` cannot type `&` or `|`; shift is ignored.
   - zsh's `print -z` does work: `hc send <t> " print -z -- '<cmd>'"` puts the command ready on the prompt, with `&&` and pipes, without starting it. The downside is one extra line in the scrollback.
   - In PR 4 we test the clipboard plus `terminal.paste`, which is invisible.

## Build order

Each piece is a PR of its own that works by itself.

1. **The parrot on the map:** the mod in the spot the spike picks, the sprite with calm, asleep and watching, the on/off button in the tab bar with ⌥⌘P, and `install.sh` adding the button and the keys as chartroom does.
2. **Chat with parrot:**
   - a click on the parrot opens a chat about the project of the terminal in your tab;
   - `claude -p` runs in that terminal's folder and only reads;
   - the terminal's last output goes along, with secrets masked;
   - follow-up questions with `--resume`, one conversation per project, and the parrot thinks while you wait.
3. **Startling at terminal errors, with suggestions for typos:**
   - the zsh hook, the events folder and startling (the squawk moves to the finishing touches: `playSound` only plays MP3, and there is no encoder here to make one);
   - zsh's `command_not_found_handler` reports a mistyped command (`tetsts`, `gid`) at once;
   - your Claude says which command you most likely meant, and only your Claude (since plan version 8): Haiku, a few seconds. It gets the line, the exit code, the masked output (with the tool's own hint in it), the project's scripts, your aliases and functions, and the commands you use. When Claude cannot answer, the alert says why;
   - one click puts the command in your terminal.
4. **Commands from the chat on your prompt** (brought forward in plan version 9, with "Ask Parrot why" from 0.3.0 as the explanation of errors):
   - the messages as chat bubbles in the parrot's colours: yours blue, its own soft red;
   - square with a 2px border, like the chat window itself; code in a block, with under each shell command a green link that puts it on your prompt (not run, the pane gets the focus); what throws away, overwrites or pushes gets a red link;
   - "Clear chat" and `/clear` empty a project's chat.
5. **A clear first run and a clean way out** (added in plan version 10, before running fixes):
   - a hello the first time the parrot comes out: what it watches, what it does when a command fails, and that a click asks it anything;
   - a note when a terminal cannot tell parrot how its commands end, such as one open before the install, with a button that loads the hook there;
   - plain words when Claude cannot answer: not logged in, out of usage, too slow, overloaded, offline or not installed;
   - `uninstall.sh`, which undoes `install.sh`.
6. **One look and one language** (added in plan version 10):
   - the alert in the chat's square bubble look, with its guesses as the same links as in the chat;
   - the same words for the same thing everywhere;
   - the questions parrot asks for you in the language you chat in;
   - a timer while Claude thinks, and which terminal the parrot watches.
7. **Run and checks:** the fix as one button that also runs it (also with several steps), the red label with 3 seconds to cancel, the Checked or Hunch label with the fixed list of checks, and buttons that take you to a pane, file or URL.
8. **Finishing touches:** the squawk (an MP3), silent mode, pirate talk on or off, model choice. The README with screenshots in light and dark came early, with 0.4.1.

**Out of scope for now:** the watcher (running programs in other panes, your stack's logs, "What it saw"), your PR's CI and the browser extension.

## Versions

Parrot follows [semver](https://semver.org). Until everything in the build order is there, it stays on 0.x, and each piece of the build order is a minor version:

| Version | What it adds |
|---|---|
| 0.1.0 | The parrot on the map |
| 0.2.0 | Chat with parrot |
| 0.3.0 | Startling at terminal errors, with suggestions for typos |
| 0.4.0 | Commands from the chat on your prompt |
| 0.5.0 | A clear first run and a clean way out |
| 0.6.0 | One look and one language |
| 0.7.0 | Run and checks |
| 1.0.0 | Finishing touches |

- **Fixes in between** are patch versions, such as 0.3.1.
- **One place for the number:** the version number lives only in `package.json`. The mod shows it in the button's tooltip and `install.sh` prints it.
- **Every version** gets a section in `CHANGELOG.md` (Keep a Changelog) and a git tag `vX.Y.Z`.
- **Once the repo is on GitHub:** a release per tag, as with portly.
- **The plan** has a plan version of its own at the top. It goes up when the course changes, and the sketch shows the same one.

Testing with `bun test` for the parts without the app: reading the hook's lines, cutting output between prompt lines, masking secrets, error patterns per source (with anonymised logs as examples), recognising dangerous commands, splitting the answer into explanation, steps and navigation buttons.
