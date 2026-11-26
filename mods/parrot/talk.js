// The parrot's own lines, plain or in pirate talk. Commands, paths, buttons and errors are never
// among them: those stay exact. No Herdr imports, so it is tested with bun test.

const LINES = {
  thinking: { plain: "Your Claude is thinking", pirate: "Your Claude is peering through the spyglass" },
  guessed: { plain: "Your Claude thinks you meant:", pirate: "Your Claude reckons ye meant:" },
  noGuess: { plain: "Your Claude has no good guess for this one.", pirate: "Your Claude has no good guess for this one, matey." },
  ask: { plain: "Shall I explain it, or fix it?", pirate: "Arr, we ran aground. Shall I explain it, or fix it?" },
  emptyTitle: { plain: (name) => `Ask anything about ${name}`, pirate: (name) => `Ask anything about ${name}, matey` },
  emptyBody: {
    plain: "How something works, where something lives, why a command failed. Parrot reads the project's files and the terminal's last output, may run a few read-only checks such as git status, and never changes anything.",
    pirate: "How the ship sails, where the treasure is buried, why a command ran aground. Parrot reads the project's files and the terminal's last output, may run a few read-only checks such as git status, and never changes anything.",
  },
};

// One of the parrot's lines; a line that takes a value, such as the project's name, gets it.
export function say(key, pirate = false, value) {
  const line = LINES[key]?.[pirate ? "pirate" : "plain"];
  if (line === undefined) throw new Error(`parrot has no line called ${key}`);
  return typeof line === "function" ? line(value) : line;
}

export const LINE_KEYS = Object.keys(LINES);
