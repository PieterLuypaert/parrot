#!/bin/sh
# Takes parrot out of the Herdr app again, undoing install.sh: clears parrot's chats and state in
# the app, takes the button out of every layout, frees the keys bound to parrot, unlinks the mod,
# takes the hook's line out of ~/.zshrc and removes ~/.parrot, where the hook wrote. Every file it
# changes is kept beside it first. This checkout stays where it is.
#
#   ./uninstall.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
parrot_home="${PARROT_HOME:-$HOME/.parrot}"
stamp=$(date +%Y%m%d-%H%M%S)
hook_mark="# parrot: tells parrot how each command ended"

fail() { echo "uninstall: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fail "needs jq on the PATH (brew install jq)"

# herdr-app as install.sh finds it. HERDR_APP_BIN names another one, as the tests do.
herdr=${HERDR_APP_BIN:-$(command -v herdr-app 2>/dev/null || true)}
if [ -z "$herdr" ] && [ -x "$HOME/.local/bin/herdr-app" ]; then herdr="$HOME/.local/bin/herdr-app"; fi

# Parrot's chats and state live in the app's shared state. With the app open, parrot clears them
# itself, and the app writes the rest; with it closed, they are taken out of shared.json.
forget_state() {
  if [ -n "$herdr" ] && "$herdr" status >/dev/null 2>&1; then
    if "$herdr" "do" parrot.forget >/dev/null 2>&1; then
      echo "app: parrot's chats and state are cleared"
    else
      echo "app: parrot did not answer, so its chats stay in the app: close the Herdr app and run this again to clear them" >&2
    fi
    return
  fi
  state="$app_home/shared.json"
  if [ ! -f "$state" ] || ! jq -e 'keys | any(startswith("parrot."))' "$state" >/dev/null 2>&1; then
    echo "app: no chats or state of parrot's"
    return
  fi
  cp "$state" "$state.backup-$stamp"
  jq 'with_entries(select(.key | startswith("parrot.") | not))' "$state.backup-$stamp" >"$state.tmp" \
    || { rm -f "$state.tmp"; fail "could not clear parrot's state from $state"; }
  mv "$state.tmp" "$state"
  echo "app: parrot's chats and state are cleared (shared.json was kept as shared.json.backup-$stamp)"
}

# Every layout with the button, also one you copied: the button goes, and the tab bar row it
# brought along when nothing else shares it.
remove_buttons() {
  found=""
  for file in "$app_home"/layouts/*.json; do
    [ -f "$file" ] || continue
    jq -e 'any(.. | objects; .id? == "parrot-button")' "$file" >/dev/null 2>&1 || continue
    name=$(basename "$file" .json) found=yes
    cp "$file" "$file.old-$stamp"
    jq -f "$here/unlayout.jq" "$file.old-$stamp" >"$file.tmp" || { rm -f "$file.tmp"; fail "could not take the button out of $name"; }
    mv "$file.tmp" "$file"
    echo "layout: took the button out of $name ($name.json was kept as $name.json.old-$stamp)"
    case "$name" in
      *-parrot) echo "layout: $name is the copy install.sh made of ${name%-parrot}; ctrl-shift-l switches back to that one" ;;
    esac
  done
  [ -n "$found" ] || echo "layout: none has the button"
}

# Every key in keys.json bound to parrot, so also one you moved; others are left alone.
free_keys() {
  keys="$app_home/keys.json"
  if [ ! -f "$keys" ]; then echo "key: there is no keys.json"; return; fi
  ours=$(jq -r '(.global // {}) | to_entries[] | select((.value | type) == "string" and (.value | startswith("parrot.") or . == "mod.open:parrot")) | .key' "$keys")
  if [ -z "$ours" ]; then echo "key: none is bound to parrot"; return; fi
  cp "$keys" "$keys.backup-$stamp"
  for key in $ours; do
    jq --arg k "$key" 'del(.global[$k])' "$keys" >"$keys.tmp" || { rm -f "$keys.tmp"; fail "could not free $key in $keys"; }
    mv "$keys.tmp" "$keys"
    echo "key: $key is free again"
  done
  echo "key: keys.json was kept as keys.json.backup-$stamp"
}

# A link to a parrot checkout's mod, as install.sh makes it; anything else there is left alone.
unlink_mod() {
  dest="$app_home/mods/parrot"
  if [ ! -L "$dest" ]; then
    if [ -e "$dest" ]; then echo "mod: $dest is not a parrot checkout's link, so it stays" >&2; else echo "mod: not linked"; fi
    return
  fi
  case "$(readlink "$dest")" in
    */mods/parrot) rm "$dest" && echo "mod: unlinked $dest" ;;
    *) echo "mod: $dest links somewhere else, so it stays" >&2 ;;
  esac
}

# The hook's line in ~/.zshrc goes, with the empty line install.sh put before it. Written through,
# so a ~/.zshrc that links to your dotfiles stays a link.
remove_hook() {
  rc="${ZDOTDIR:-$HOME}/.zshrc"
  if [ ! -f "$rc" ] || ! grep -Fq "$hook_mark" "$rc"; then echo "hook: $rc does not load it"; return; fi
  cp "$rc" "$rc.backup-$stamp"
  awk -v mark="$hook_mark" '
    index($0, mark) { blank = 0; next }
    { if (blank) print ""; blank = 0 }
    $0 == "" { blank = 1; next }
    { print }
    END { if (blank) print "" }
  ' "$rc.backup-$stamp" >"$rc.tmp" || { rm -f "$rc.tmp"; fail "could not take the hook out of $rc"; }
  cat "$rc.tmp" >"$rc" && rm -f "$rc.tmp"
  echo "hook: $rc no longer loads it ($rc was kept as $rc.backup-$stamp)"
}

# What the hook wrote: how your commands ended, and your history after a failure. A folder that
# holds anything else is not parrot's alone, so it stays.
remove_home() {
  if [ ! -d "$parrot_home" ]; then echo "data: there is no $parrot_home"; return; fi
  for entry in "$parrot_home"/* "$parrot_home"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "${entry##*/}" in
      events|off) ;;
      *) echo "data: $parrot_home holds more than parrot's own files, so it stays: remove it yourself" >&2; return ;;
    esac
  done
  rm -rf -- "$parrot_home"
  echo "data: removed $parrot_home"
}

echo "parrot $(jq -r .version "$here/package.json"): uninstalling"
forget_state
remove_buttons
free_keys
unlink_mod
remove_hook
remove_home
echo "Parrot is out. Terminals that are open keep its hook until they close, but it stays quiet. This checkout, $here, is yours to delete."
