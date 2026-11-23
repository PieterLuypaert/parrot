# parrot's zsh hook: tells parrot how each command ended, so it can startle at an error and have your
# Claude suggest the command you meant after a typo. install.sh sources it from ~/.zshrc. It writes only under
# ~/.parrot (or $PARROT_HOME), nothing while ~/.parrot/off exists, and starts no process per command.
[[ -o interactive ]] || return 0
zmodload zsh/datetime 2>/dev/null || return 0
autoload -Uz add-zsh-hook

typeset -g _parrot_cmd="" _parrot_start=0

# $1 as the inside of a JSON string, in $REPLY.
_parrot_escape() {
  REPLY=${1//\\/\\\\}
  REPLY=${REPLY//\"/\\\"}
  REPLY=${REPLY//$'\n'/\\n}
  REPLY=${REPLY//$'\t'/\\t}
  REPLY=${REPLY//[[:cntrl:]]/}
}

_parrot_preexec() {
  _parrot_cmd=$1
  _parrot_start=$EPOCHREALTIME
  # Stay first in line, so $? in precmd is still the command's own exit code.
  [[ ${precmd_functions[1]} == _parrot_precmd ]] || precmd_functions=(_parrot_precmd ${precmd_functions:#_parrot_precmd})
}

_parrot_precmd() {
  local code=$?
  [[ -n $_parrot_cmd ]] || return 0
  local cmd=$_parrot_cmd home=${PARROT_HOME:-$HOME/.parrot}
  _parrot_cmd=""
  [[ -e $home/off ]] && return 0
  local dir=$home/events
  # Only you can read it: your history lands here.
  [[ -d $dir ]] || mkdir -m 700 -p -- "$dir" 2>/dev/null || return 0
  # After a command that failed, your recent history, so your Claude knows which commands you use.
  # Ctrl-C, a closed pipe and Ctrl-Z are no errors.
  if (( code != 0 && code != 130 && code != 141 && code != 146 && code != 148 )); then
    fc -ln -300 >| "$dir/$$.history" 2>/dev/null
  fi
  local ms=$(( (EPOCHREALTIME - _parrot_start) * 1000 ))
  _parrot_escape "$cmd"; local json_cmd=$REPLY
  _parrot_escape "$PWD"; local json_cwd=$REPLY
  print -r -- "{\"pid\":$$,\"code\":$code,\"cmd\":\"$json_cmd\",\"cwd\":\"$json_cwd\",\"ms\":${ms%.*},\"at\":$EPOCHREALTIME}" >| "$dir/$$.json" 2>/dev/null
  return 0
}

add-zsh-hook preexec _parrot_preexec
precmd_functions=(_parrot_precmd ${precmd_functions:#_parrot_precmd})
