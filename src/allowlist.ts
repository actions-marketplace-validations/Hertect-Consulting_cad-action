// The one file that keeps the "do not flag" list for check 1 (dead command),
// per the build brief: "Do not flag shell builtins or common tools ...
// Keep that allow list in one file."

export const COMMON_TOOLS = new Set([
  "git",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "make",
  "go",
  "cargo",
  "python",
  "python3",
  "pip",
  "pip3",
  "bun",
  "deno",
  "uv",
  "sh",
  "bash",
  "zsh",
  "docker",
  "kubectl",
  "gh",
  "sudo",
  "ls",
  "cat",
  "cp",
  "mv",
  "rm",
  "mkdir",
  "touch",
  "chmod",
  "grep",
  "sed",
  "awk",
  "find",
  "curl",
  "wget",
  "tar",
]);

export const SHELL_BUILTINS = new Set([
  "cd",
  "echo",
  "export",
  "source",
  "test",
  "true",
  "false",
  "exit",
  "alias",
  "pwd",
  "set",
  "unset",
  "read",
  "printf",
  "eval",
  "which",
]);

export function isAllowedFirstToken(token: string, extra: string[] = []): boolean {
  const t = token.replace(/^\.\//, "").toLowerCase();
  if (COMMON_TOOLS.has(t) || SHELL_BUILTINS.has(t)) return true;
  return extra.map((e) => e.trim().toLowerCase()).includes(t);
}
