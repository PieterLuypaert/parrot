# Parrot

A pixel parrot for the [Herdr app](https://herdr.dev) that stands on your work area and watches your shells. Later versions let it spot errors, in the terminal and beyond, and explain them with your own Claude, with the fix as one button. The plan, in Dutch, is in [PLAN.md](PLAN.md), and a sketch of where it is going is in [sketch/moods.html](sketch/moods.html).

**0.3.0, it reacts to your terminal:** it stands without a frame in the top right corner of the panes and watches the terminal in your tab. It sways while all is calm, tilts its head while a command runs, falls asleep after ten quiet minutes, startles when a command fails and dances when the next one works. After a typo it suggests the command you meant. Click it to ask your own Claude anything about the terminal's project. It watches shells, not agents: a tab with only an agent session cannot turn it on, and beside one it keeps watching the terminal while you type to the agent.

## Install

Needs the Herdr app and `jq`. Clone this repo to a folder that stays, then run its installer with the Herdr app open:

```sh
./install.sh
```

It links the mod, binds `⌥⌘P` and `⌥⇧⌘P`, adds a **Parrot** button to your layout's tab bar, just after Chartroom's when that is there, and adds one line to your `~/.zshrc` that loads parrot's zsh hook. Terminals opened after that have it; in one that is open already, run `source ~/.zshrc`. Herdr replaces its own layouts on every start, so when one of those is shown, `install.sh` puts the button into a copy of it, such as `main-parrot`, and shows that. Every file it changes is kept beside it first. After pulling, run `./install.sh` again.

## Use

- **Parrot** in the tab bar, or `⌥⌘P`, turns the parrot on or off. It needs a terminal pane in the tab; without one the button is dim and tells you so.
- It lands in the top right corner of the panes, under the tab bar and the panes' title bars, and moves left of a panel such as Quarterdeck's or Chartroom's while that is open.
- A click on the parrot, or `⌥⇧⌘P`, opens the chat beside it. Asleep, the click wakes it too.
- `herdr-app do parrot.calm`, `parrot.watch`, `parrot.sleep`, `parrot.think`, `parrot.alarm` or `parrot.dance` shows a mood for ten seconds.

## When a command fails

The zsh hook tells parrot how each command in your shells ended: the command, its exit code, the folder and how long it took, and after a failure your recent history, written under `~/.parrot/events`, a folder only you can read. It starts no process per command and writes nothing while parrot is off. Parrot reacts only to the tab you look at, and clears out the files of shells that are gone.

- **A typo** (`gitce`, `pnmp lnit`), or **a command used wrong** (`git statsu`, an unknown option, a missing script): the parrot startles, asks your Claude at once what you meant, and shows its guesses, best first. Click one and it goes on your prompt, not yet run, with that pane focused: Enter runs it.
  - The suggestions come only from your Claude, on your own subscription with a fast model (Haiku, a few seconds), with no tools and no session kept.
  - Claude gets the line and the last 30 lines of output with secrets masked (a tool's own "Did you mean" is in there), the exit code, the project's scripts (package.json and Makefile) and the commands you use most. It always suggests the full command, never one of your aliases.
  - When Claude cannot answer, the alert says why, and Ask Parrot is still there.
- **Another failure**, such as a failing test run or build: the parrot startles and offers **Ask Parrot why**, which asks your Claude in the chat, with the terminal's output. Nothing goes to Claude before you click.
- **The next command in that terminal works**: it dances, also after you took a suggestion.
- **No errors**: Ctrl-C, a closed pipe and Ctrl-Z, and exit code 1 from a command that answers no (`grep` without a match, `test`, `diff`, `git diff --quiet`). A script that ends with 127 because a program it calls is missing is a failure, not a typo.
- **A suggestion goes only to a prompt**: while vim, a REPL or a build still runs in that terminal, parrot says so instead of typing into it.

The alert opens beside the parrot, or in the chat while that is open. × dismisses it.

## Chat

Ask about the project of the terminal in your tab: how something works, where something lives, why a command failed. The chat opens beside the parrot in its colours, stays put, and moves along when the parrot does. It follows the tab, with one conversation per git project (a `cd` into a subfolder keeps it); follow-up questions continue it, and **New chat** starts that project over.

Every question goes to your own Claude, on your own subscription, the way Chartroom asks it: `claude -p` in the terminal's folder, with no MCP servers and none of your hooks or plugins. Nothing goes to Claude until you ask. The parrot thinks while it waits; an answer that reads files takes half a minute or so on Sonnet.

What Claude uses to answer:

- your question, and the conversation so far in that project;
- the terminal's folder, its branch and its last 60 lines, with keys, tokens and passwords masked first;
- the project's files, which Claude picks and reads itself with Read, Grep and Glob: it runs no commands and changes nothing;
- your own Claude context, as Claude Code loads it in that folder: your `~/.claude/CLAUDE.md`, the project's `CLAUDE.md` and your auto-memory for that folder.

## Development

```sh
bun test                         # the sprite, the moods, the zsh hook, the suggestions, the chat's questions and the layout change
bun run frames                   # draw the frames again after changing scripts/sprite.js
herdr-app check mods/parrot      # load the mod once
```

The app does not see edits behind the installed link: run `./install.sh` again, or turn the parrot off and on.

## License

[MIT](LICENSE)
