import { describe, expect, it } from "vitest";
import { extractCuedCommands, isWorkspaceScoped, makeTargetInvocation, packageScriptInvocation, shellSegments } from "../src/scan.js";

describe("packageScriptInvocation", () => {
  it("returns the script for the run forms and the npm lifecycle shortcuts", () => {
    expect(packageScriptInvocation("npm run lint")).toBe("lint");
    expect(packageScriptInvocation("npm run-script lint")).toBe("lint");
    expect(packageScriptInvocation("npm test")).toBe("test");
    expect(packageScriptInvocation("npm start")).toBe("start");
    expect(packageScriptInvocation("pnpm run build")).toBe("build");
    expect(packageScriptInvocation("yarn run build -- --watch")).toBe("build");
  });

  it("returns the script for the bare pnpm and yarn forms", () => {
    expect(packageScriptInvocation("pnpm typecheck")).toBe("typecheck");
    expect(packageScriptInvocation("yarn build")).toBe("build");
    expect(packageScriptInvocation("pnpm test")).toBe("test");
  });

  it("returns null for subcommands the package manager owns, flags, and anything that is not npm, pnpm or yarn", () => {
    expect(packageScriptInvocation("pnpm install")).toBeNull();
    expect(packageScriptInvocation("yarn add react")).toBeNull();
    expect(packageScriptInvocation("pnpm dlx create-next-app")).toBeNull();
    expect(packageScriptInvocation("yarn --version")).toBeNull();
    expect(packageScriptInvocation("npm install")).toBeNull();
    expect(packageScriptInvocation("npm run")).toBeNull();
    expect(packageScriptInvocation("npx vitest")).toBeNull();
    expect(packageScriptInvocation("make build")).toBeNull();
  });
});

describe("workspace-scoped scripts", () => {
  it("skips the selector and returns the script", () => {
    expect(packageScriptInvocation("pnpm --filter web test")).toBe("test");
    expect(packageScriptInvocation("pnpm -F web run build")).toBe("build");
    expect(packageScriptInvocation("pnpm --filter=web lint")).toBe("lint");
    expect(packageScriptInvocation("npm run test -w apps/web")).toBe("test");
    expect(packageScriptInvocation("npm run test --workspace=apps/web")).toBe("test");
    expect(packageScriptInvocation("yarn workspace web build")).toBe("build");
  });

  it("knows which commands name a workspace", () => {
    expect(isWorkspaceScoped("pnpm --filter web test")).toBe(true);
    expect(isWorkspaceScoped("npm run test -w web")).toBe(true);
    expect(isWorkspaceScoped("yarn workspace web build")).toBe(true);
    expect(isWorkspaceScoped("pnpm -r build")).toBe(true);
    expect(isWorkspaceScoped("npm run test")).toBe(false);
    expect(isWorkspaceScoped("yarn build")).toBe(false);
  });
});

describe("makeTargetInvocation", () => {
  it("returns the first target, skipping flags and variable assignments", () => {
    expect(makeTargetInvocation("make deploy")).toBe("deploy");
    expect(makeTargetInvocation("make -j4 build")).toBe("build");
    expect(makeTargetInvocation("make ENV=prod deploy")).toBe("deploy");
  });

  it("returns null for a bare make and for anything else", () => {
    expect(makeTargetInvocation("make")).toBeNull();
    expect(makeTargetInvocation("make -s")).toBeNull();
    expect(makeTargetInvocation("cmake --build .")).toBeNull();
  });
});

describe("shellSegments", () => {
  it("splits a chained line on &&, ||, ; and |", () => {
    expect(shellSegments("npm run build && make lint || echo no; yarn test | tee out.log")).toEqual([
      "npm run build",
      "make lint",
      "echo no",
      "yarn test",
      "tee out.log",
    ]);
  });

  it("returns a single command unchanged", () => {
    expect(shellSegments("  git status  ")).toEqual(["git status"]);
  });
});

describe("extractCuedCommands", () => {
  it("returns a backticked span only when a run-like word precedes it", () => {
    expect(extractCuedCommands("Run `buildit` before pushing, then run `git status`.")).toEqual(["buildit", "git status"]);
    expect(extractCuedCommands("Deploy via `make deploy` (execute `./ship.sh` after).")).toEqual(["make deploy", "./ship.sh"]);
    expect(extractCuedCommands("The command: `$ npm ci`")).toEqual(["npm ci"]);
  });

  it("ignores spans a sentence merely names", () => {
    expect(extractCuedCommands("Branch from `origin/main`; the `verify` script is slow.")).toEqual([]);
    expect(extractCuedCommands("Set the `X-Frame-Options` header and read `docs/a.md`.")).toEqual([]);
  });
});
