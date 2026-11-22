# Changelog

All notable changes to parrot are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semver](https://semver.org).

## [Unreleased]

## [0.4.1] - 2026-11-22

Sharper guesses, and a chat that keeps up.

### Fixed

- Your Claude fixes a typo first and prefers the project's own scripts, so `pnmp lnit` becomes `pnpm lint` rather than another command.
- Its suggestions fix only the line you just typed, never an earlier typo from your history.
- A chat answer comes into view when it lands. After a long one, its question sits at the top, so the answer reads from its start.
- An alert in the open chat stays in view when your Claude's guesses land, **Ask Parrot** included.
- The chat follows the shell into another folder: after a `cd` into another project it shows and asks about that one.

## [0.4.0] - 2026-11-22

Its fixes, one click from your prompt.

### Added

- Chat messages as bubbles in the parrot's colours, yours blue and its answers soft red, with code in a block in your terminal's font, all square with a 2px border like the chat's frame. Under each shell command, **↵ Put on prompt** puts it on the terminal's prompt, not yet run, with that pane focused; a command that deletes, overwrites or pushes gets a red link. Other code gets **⧉ Copy**.
- **Clear chat** in the chat's header, and `/clear` (or `/new`, `/reset`) in the chat, start a project's conversation over without asking Claude.
- `parrot.explain` asks about the current alert, as its **Ask Parrot** button does.

### Fixed

- **Ask Parrot why** reaches Claude: it no longer depends on the alert's window, which closes with the click.

### Changed

- Plan version 9: putting a chat answer's commands on your prompt comes forward as 0.4.0; running a fix with one click stays 0.5.0.

## [0.3.0] - 2026-11-22

It reacts to your terminal.

### Added

- A zsh hook (`hook.zsh`, loaded from `~/.zshrc` by `install.sh`) that tells parrot how each command ended. It starts no process per command and writes nothing while parrot is off.
- After a typo or a command used wrong, the parrot startles and your Claude suggests the command you probably meant, always written in full and never as one of your aliases: Haiku on your own subscription, asked at once, with no tools and no session kept, from the masked line and output, its exit code, the project's scripts (package.json and Makefile) and the commands you use. A click puts it on the prompt, not yet run, with that pane focused, and only while the terminal is at its prompt.
- Exit code 1 from a command that answers no (`grep`, `test`, `diff`, `git diff --quiet`) is no error, and only zsh's own "command not found" counts as a typo.
- `~/.parrot` is readable only by you, and the files of shells that are gone are cleared out.
- After another failure, such as a failing test run, it startles and offers **Ask Parrot why**, which asks your Claude in the chat with the terminal's output.
- It dances when the next command in that terminal works. Ctrl-C, a closed pipe and Ctrl-Z are no errors.
- A startled and a dancing parrot, and `parrot.alarm` and `parrot.dance` to preview them.

### Changed

- Plan version 6: the squawk moves to the finishing touches, as `playSound` only plays MP3.
- Plan version 7: a typo or a command used wrong is the one case where parrot asks your Claude without a click.
- Plan version 8: those suggestions come only from your Claude, with nothing guessed beside them.

## [0.2.0] - 2026-11-22

Chat with parrot.

### Added

- A click on the parrot, or `⌥⇧⌘P` (`parrot.chat`), opens a chat beside it about the project of the terminal in your tab, in the parrot's colours with a pixel frame. It stays put and moves along with the parrot. It follows the tab, keeps one conversation per git project (its last 40 messages, the 12 projects talked about last) and starts a project over with **New chat**.
- Questions go to your own Claude on your own subscription, as Chartroom asks it: `claude -p` in the terminal's folder with only Read, Grep and Glob, no MCP servers and none of your hooks or plugins, and `--resume` for follow-ups. The terminal's branch and last 60 lines go along, with keys, tokens and passwords masked first. claude is found also when the app was opened from the Dock.
- The button asks the questions, so an answer lands in its conversation even when the chat closed meanwhile; one question per project runs at a time, and after an error the next question starts a new conversation.
- A thinking mood while Claude works on a question, and `parrot.think` to preview it.
- `⌥⇧⌘P` says why nothing opens while the parrot is off.

### Changed

- Plan versions 4 and 5: the chat comes first; errors outside the terminal are out of scope for now, and a mistyped command gets a suggestion in 0.3.0.

### Fixed

- The parrot lands under the panes' title bar also where the layout sets it on the block that holds the panes.
- The parrot keeps clear of an open side panel, such as Quarterdeck's or Chartroom's, and moves back when it closes.
- After a reload or an upgrade there is never a second parrot or a chat nobody tracks.

## [0.1.0] - 2026-11-22

The parrot on the map.

### Added

- A pixel parrot in a frameless window in the top right corner of the window, watching the terminal in your tab. It sways while all is calm, tilts its head while a command runs, falls asleep after ten quiet minutes and blinks now and then.
- It watches shells, not agents: a tab with only an agent session cannot turn it on, and beside one it keeps watching the terminal while you type to the agent.
- A **Parrot** button in the tab bar, just after Chartroom's, and `⌥⌘P` (`parrot.toggle`) to turn it on or off. The button is lit while the parrot is out and dim in a tab without a terminal.
- `install.sh`: links the mod, binds the key and adds the button, keeping every file it changes beside it first. Herdr's own layouts get a copy.
- `herdr-app do parrot.calm | parrot.watch | parrot.sleep` shows a mood for ten seconds.
- The frames are drawn from one sprite definition (`scripts/sprite.js`), the same parrot as in the sketch.
- The plan (`PLAN.md`, plan version 3, with the spike's findings) and a visual sketch in English of parrot's moods and three flows: an error in the terminal, an error outside it, and a question (`sketch/moods.html`).
