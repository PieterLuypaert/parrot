# Changelog

All notable changes to parrot are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semver](https://semver.org).

## [Unreleased]

## [0.10.0] - 2026-11-23

Explain, or fix it.

### Added

- When a command fails, the parrot asks what to do: **Fix it** asks your Claude only for the commands that fix it, in a code block with one line on why, so they arrive ready to run or put on the prompt; **Explain** asks why it failed, briefly. Both go to the chat with the terminal's output, in the language you chat in. After a typo they sit under your Claude's guesses.
- `parrot.fix` asks for the fix of the current alert, as `parrot.explain` asks why.

### Changed

- The two buttons take the place of **Ask Parrot**, so you no longer type the first question yourself.
- Plan version 12: explain or fix is 0.10.0, before the finishing touches.

## [0.9.0] - 2026-11-23

Links that take you there.

### Added

- A file your Claude names in an answer, such as `src/orders.ts:42`, is a link: it opens in Cursor at that line, else in VS Code, else in the file's own app. One that is not in the terminal's folder or the project's root says so.
- With a question your Claude gets the terminals open in that space, with their folder and what runs in them, masked. When it points to one, the link takes you to that pane.
- A bare web address in an answer is a link to your browser.

## [0.8.0] - 2026-11-23

Checked, or a hunch.

### Added

- Your Claude may run a fixed list of commands that only read, exactly as written: `git status`, `git log --oneline -10`, `git diff --stat`, `git remote -v`, `git branch --show-current`, `git stash list`, `docker ps`, `docker compose ps`, `docker compose logs --tail`, `lsof -i`, `node -v`, `npm -v`, `pnpm -v`, `bun --version`, `gh pr checks` and `gh pr view`. Claude Code refuses every other command, also one chained to these or with an option that writes, since no one is there to approve it.
- Each answer starts with **✓ Checked** and what your Claude ran or read to be sure, or **~ Hunch** when it went by the text alone.

## [0.7.0] - 2026-11-23

Run with one click.

### Added

- **▶ Run** under a command in the chat and under a guess runs it in the terminal at once, with that pane focused. Under a block with several commands, **▶ Run all** runs them in order as one line that stops at the first that fails.
- How it went shows under the block, from the hook's report of that line: **✓ Done**, or **✗ Failed** with its exit code. A guess you ran waits out of sight, so the parrot dances when it works.
- A command that deletes, overwrites, pushes, stops processes or runs a script from the internet counts down three seconds first, and a click or Esc stops it. A guess like that only goes on the prompt.

### Changed

- Run only sends a command that reads as it looks: complete on one line, with no `!`, no heredoc and nothing to fill in, such as `<url>`, `YOUR_TOKEN` or "Your Name". **Run all** only runs a block whose every line is such a command. The rest goes on the prompt for you to finish.
- A comment after a command (`pnpm i # once`) no longer goes along when it is run or put on the prompt: zsh would take it as arguments.
- More commands are marked red as risky: `git push`, removing any file, `kill`, global git config, docker volumes, dropping a database and scripts piped from the internet. Writing to `/dev/null` no longer is.
- Parrot never types into an agent that runs in the terminal, also when putting a command on the prompt.
- Plan version 11: run and checks is split into run with one click (0.7.0), checks (0.8.0) and links that take you there (0.9.0).

## [0.6.0] - 2026-11-23

One look and one language.

### Added

- Parrot asks its own questions, such as the one behind **Ask Parrot**, in the language you chat in: English, Dutch, French, German or Spanish, told by the last question you typed yourself. The answer comes in it too, and Haiku writes the reason for each guess in it.
- While your Claude works, a line says so with the seconds it has taken, in the chat and beside the parrot.
- The tooltips and the chat's header name the terminal the parrot watches, such as the zsh in shop-api.

### Changed

- Alerts and notes are the parrot's speech bubbles, square with a 2px border as its chat answers are, beside it and in the chat. Your Claude's guesses are code with the same **↵ Put on prompt** link as in the chat, with the reason beside it.
- The same words everywhere: **Ask Parrot** on every alert, **Ask** in the chat, and × to close.

## [0.5.1] - 2026-11-23

The parrot keeps to its corner at any zoom.

### Fixed

- With Herdr zoomed in, the parrot stays in the top right corner of the panes, and its chat and alert open beside it. Before, it landed too far right, and at 2x its bubble ran off the window over the tab bar.

## [0.5.0] - 2026-11-23

A clear first run, and a clean way out.

### Added

- The first time the parrot comes out, it says hello with a little dance: what it watches, what it does when a command fails, and that a click asks it anything.
- A note beside the parrot when the zsh it watches has not loaded the hook, as in a terminal open before the install, with **Load it here**, which loads the hook in that terminal. The hook leaves a mark under `~/.parrot/shells` when a shell loads it, which is how parrot tells. A terminal with another shell gets a note that parrot cannot hear it.
- `uninstall.sh` undoes `install.sh`. Parrot's chats and state leave the app (through `parrot.forget`), the button leaves every layout, the keys bound to parrot are freed, the mod is unlinked, the hook's line leaves `~/.zshrc` and `~/.parrot` goes. It keeps each file it changes beside it.

### Fixed

- When Claude cannot answer, the chat and the alert say what to do: log in, wait until your usage resets, try again, check your connection, or install Claude Code.
- **Put on prompt** works in any zsh, also one without the hook, through zsh's own `print -z`. In another shell it says it cannot type there.

### Changed

- The hook stays quiet once `~/.parrot` is gone, so a terminal left open after uninstalling never brings it back.
- Plan version 10: a clear first run and a clean way out is 0.5.0, one look and one language 0.6.0, and running a fix with one click moves to 0.7.0.

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
