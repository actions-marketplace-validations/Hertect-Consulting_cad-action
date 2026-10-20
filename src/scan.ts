/** Extracts every backticked span from a line/text, e.g. "run `npm test` now" -> ["npm test"]. */
export function extractBacktickedCommands(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cmd = m[1].trim();
    if (cmd) out.push(cmd);
  }
  return out;
}

/**
 * The words that, right before a backtick, say the span is something to run:
 * "run `buildit` first", "via `make deploy`". A backticked span in prose
 * without one of these is a name, a flag, a header, a branch — not a command
 * — and is left to the path scan.
 */
const COMMAND_CUES = new Set([
  "run",
  "runs",
  "running",
  "ran",
  "rerun",
  "re-run",
  "execute",
  "executes",
  "executing",
  "invoke",
  "invokes",
  "call",
  "calls",
  "via",
  "command",
]);

/**
 * Backticked spans that prose presents as commands: the word before the
 * opening backtick is one of the cues above. "Run `npm run lint`" yields
 * ["npm run lint"]; "Branch from `origin/main`" yields nothing.
 */
export function extractCuedCommands(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index).replace(/[\s:,("']+$/, "");
    const cue = /([A-Za-z-]+)$/.exec(before)?.[1].toLowerCase();
    const cmd = m[1].trim().replace(/^\$\s+/, "");
    if (cue && COMMAND_CUES.has(cue) && cmd) out.push(cmd);
  }
  return out;
}

/** Splits a chained shell line on `&&`, `||`, `;` and `|`, so each command is judged on its own. */
export function shellSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

/** Subcommands pnpm and yarn own themselves. `pnpm install` is not a script; `pnpm build` is. */
const PACKAGE_MANAGER_SUBCOMMANDS = new Set([
  "add",
  "audit",
  "bin",
  "cache",
  "config",
  "create",
  "dedupe",
  "deploy",
  "dlx",
  "doctor",
  "env",
  "exec",
  "fetch",
  "global",
  "help",
  "i",
  "import",
  "info",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "login",
  "logout",
  "ls",
  "outdated",
  "owner",
  "pack",
  "patch",
  "patch-commit",
  "patch-remove",
  "plugin",
  "prune",
  "publish",
  "rb",
  "rebuild",
  "remove",
  "rm",
  "root",
  "search",
  "self-update",
  "set",
  "setup",
  "store",
  "tag",
  "team",
  "un",
  "uninstall",
  "unlink",
  "up",
  "update",
  "upgrade",
  "upgrade-interactive",
  "version",
  "versions",
  "why",
  "workspace",
  "workspaces",
]);

/**
 * Removes a workspace selector from a package-manager command and says
 * whether one was there: `pnpm --filter web test` and `npm run test -w web`
 * run a script of one workspace package, `yarn workspace web test` likewise.
 * The selector decides which package.json the script is looked up in.
 */
function stripWorkspaceSelector(parts: string[]): { parts: string[]; scoped: boolean } {
  const tool = parts[0]?.replace(/^\.\//, "").toLowerCase();
  let scoped = false;
  const out: string[] = [parts[0]];
  if (tool === "yarn" && parts[1] === "workspace" && parts[2]) {
    return { parts: [parts[0], ...parts.slice(3)], scoped: true };
  }
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (tool === "pnpm" && (p === "--filter" || p === "-F" || p === "--filter-prod")) {
      scoped = true;
      i++;
      continue;
    }
    if (tool === "pnpm" && (p.startsWith("--filter=") || p === "-r" || p === "--recursive" || p === "-w")) {
      scoped = true;
      continue;
    }
    if (tool === "npm" && (p === "-w" || p === "--workspace")) {
      scoped = true;
      i++;
      continue;
    }
    if (tool === "npm" && (p.startsWith("--workspace=") || p === "-ws" || p === "--workspaces")) {
      scoped = true;
      continue;
    }
    out.push(p);
  }
  return { parts: out, scoped };
}

/** True when `command` runs a script in a workspace package rather than the root package.json. */
export function isWorkspaceScoped(command: string): boolean {
  return stripWorkspaceSelector(command.trim().split(/\s+/)).scoped;
}

/**
 * If `command` invokes a package.json script, returns the script name;
 * otherwise null. Recognises `npm run X`, `npm run-script X`, `npm test`,
 * `npm start`, `npm stop`, `npm restart`, `pnpm run X`, `yarn run X`, and
 * the bare `pnpm X` / `yarn X` forms when X is not a subcommand the package
 * manager owns itself: `yarn build` is a script, `yarn install` is not.
 * A workspace selector (`--filter`, `-w`, `yarn workspace`) is skipped over;
 * see isWorkspaceScoped for which package.json then applies.
 */
export function packageScriptInvocation(command: string): string | null {
  const { parts } = stripWorkspaceSelector(command.trim().split(/\s+/));
  const [tool, sub, name] = parts;
  if (!tool || !sub) return null;
  const t = tool.replace(/^\.\//, "").toLowerCase();
  if (t === "npm" && (sub === "test" || sub === "start" || sub === "stop" || sub === "restart")) return sub;
  if ((t === "npm" || t === "pnpm" || t === "yarn") && (sub === "run" || sub === "run-script")) {
    if (!name || name.startsWith("-")) return null;
    return name;
  }
  if ((t === "pnpm" || t === "yarn") && !sub.startsWith("-") && !PACKAGE_MANAGER_SUBCOMMANDS.has(sub)) {
    return sub;
  }
  return null;
}

/**
 * If `command` invokes a Makefile target, returns the target name; otherwise
 * null. Flags (`-j4`, `--silent`) and variable assignments (`ENV=prod`) are
 * skipped; `make` on its own runs the default target and is not judged.
 */
export function makeTargetInvocation(command: string): string | null {
  const parts = command.trim().split(/\s+/);
  const tool = parts[0]?.replace(/^\.\//, "").toLowerCase();
  if (tool !== "make") return null;
  for (const part of parts.slice(1)) {
    if (part.startsWith("-") || part.includes("=")) continue;
    return part;
  }
  return null;
}

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_LIKE_RE = /^[.\w][\w.\-/*]*$/;

/**
 * Extracts path-like tokens from free text: backticked spans, and bare
 * words that look like a file path or glob (contain a `/`, or an
 * extension, or a `*`). Deliberately excludes bare version numbers like
 * "3.11" and URLs.
 */
export function extractPathLikeTokens(text: string): string[] {
  if (!text) return [];
  const candidates = new Set<string>();

  const backticked = extractBacktickedCommands(text);
  for (const b of backticked) {
    for (const word of b.split(/\s+/)) candidates.add(word);
  }

  const plain = text.replace(/`[^`]*`/g, " ");
  for (const raw of plain.split(/\s+/)) {
    const word = raw.replace(/^[,;:()]+|[,;:()]+$/g, "");
    if (word) candidates.add(word);
  }

  const results: string[] = [];
  for (const token of candidates) {
    if (!token || URL_RE.test(token)) continue;
    if (!PATH_LIKE_RE.test(token)) continue;
    const hasSlash = token.includes("/");
    const hasGlob = token.includes("*");
    const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(token) && !/^\d+(\.\d+){1,2}$/.test(token);
    if (hasSlash || hasGlob || hasExtension) {
      results.push(token);
    }
  }
  return results;
}
