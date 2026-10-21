import * as core from "@actions/core";
import * as github from "@actions/github";
import { buildComment, buildSuggestion, COMMENT_MARKER, suggestionMarker } from "./comment.js";
import { run } from "./run.js";
import type { ChangedFile, Finding, RunOptions } from "./types.js";

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseFailOn(value: string): RunOptions["failOn"] {
  if (value === "none" || value === "dead-only") return value;
  return "all";
}

/**
 * A pull_request event from a fork gets a read-only GITHUB_TOKEN — it can
 * check out the code but cannot post a PR comment. Detected by comparing
 * the head and base repo full names.
 */
export function isForkPullRequest(): boolean {
  const pr = github.context.payload.pull_request;
  if (!pr) return false;
  const headRepo = pr.head?.repo?.full_name;
  const baseRepo = pr.base?.repo?.full_name;
  return Boolean(headRepo && baseRepo && headRepo !== baseRepo);
}

/**
 * The pull request's changed files, read from the API rather than from git:
 * actions/checkout is shallow by default, so the head checkout has no base
 * to diff against. A read, and the only one the Action makes beyond the
 * sticky comment it looks for. Empty outside a pull request or when the
 * API gives no answer, in which case the comment simply has no section.
 */
export async function listChangedFiles(token: string): Promise<ChangedFile[]> {
  const pr = github.context.payload.pull_request;
  if (!pr || !token) return [];
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: pr.number });
  return files.map((f) => ({
    path: f.filename,
    status: f.status === "added" || f.status === "removed" || f.status === "renamed" ? f.status : "modified",
    patch: f.patch,
    previousPath: f.previous_filename,
  }));
}

async function upsertStickyComment(token: string, body: string): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.info("Not a pull_request event; skipping the sticky PR comment.");
    return;
  }
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const issue_number = pr.number;

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
  });
  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number, body });
  }
}

/**
 * Posts each proposed fix as a review comment holding a suggested change,
 * on the finding's own line, for the reader to accept or not in the normal
 * review UI. One per finding, only where the line is in the pull request's
 * diff, and only ever a review comment: a rerun updates the one it posted
 * before (found by its marker) rather than posting another, and nothing is
 * deleted. The only write this Action makes besides the sticky comment.
 */
async function upsertSuggestions(token: string, findings: Finding[]): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) return;
  const proposals = findings.filter((f) => f.proposal?.suggested);
  if (proposals.length === 0) return;
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pull_number = pr.number;
  const commit_id = pr.head?.sha as string;

  const existing = await octokit.paginate(octokit.rest.pulls.listReviewComments, { owner, repo, pull_number });
  for (const f of proposals) {
    const body = buildSuggestion(f);
    const marker = suggestionMarker(f);
    const previous = existing.find((c) => c.body?.includes(marker));
    if (previous?.body === body) continue;
    if (previous) {
      await octokit.rest.pulls.updateReviewComment({ owner, repo, comment_id: previous.id, body });
    } else {
      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number,
        commit_id,
        path: f.file,
        line: f.line,
        side: "RIGHT",
        body,
      });
    }
  }
}

async function writeJobSummary(body: string): Promise<void> {
  await core.summary.addRaw(body, true).write();
}

async function main(): Promise<void> {
  const root = process.cwd();
  const token = core.getInput("token") || process.env.GITHUB_TOKEN || "";

  let changedFiles: ChangedFile[] = [];
  try {
    changedFiles = await listChangedFiles(token);
  } catch (err) {
    core.warning(`Could not list the pull request's files, so the comment will not say which instruction files changed: ${(err as Error).message}`);
  }

  const options: RunOptions = {
    root,
    extraPaths: splitList(core.getInput("paths")),
    failOn: parseFailOn(core.getInput("fail-on") || "all"),
    extraAllowCommands: splitList(core.getInput("allow-commands")),
    changedFiles,
  };

  const result = run(options);
  const findingsJson = JSON.stringify(result.findings, null, 2);

  core.setOutput("findings-json", findingsJson);
  core.setOutput("finding-count", String(result.findings.length));
  core.setOutput("conclusion", result.conclusion);

  core.info(`Ctrl Alt Delegate: ${result.findings.length} finding(s) across ${result.ruleCount} rule(s) in ${result.fileCount} file(s).`);

  const body = buildComment(result);
  const fork = isForkPullRequest();

  if (fork) {
    core.info(
      "Fork pull request: GITHUB_TOKEN is read-only here, so findings go to the job summary instead of a PR comment.",
    );
    try {
      await writeJobSummary(body);
    } catch (err) {
      core.warning(`Could not write the job summary: ${(err as Error).message}`);
    }
  } else if (token) {
    try {
      await upsertStickyComment(token, body);
    } catch (err) {
      core.warning(`Could not post the sticky PR comment: ${(err as Error).message}`);
      try {
        await writeJobSummary(body);
      } catch (summaryErr) {
        core.warning(`Could not write the job summary either: ${(summaryErr as Error).message}`);
      }
    }
    try {
      await upsertSuggestions(token, result.findings);
    } catch (err) {
      core.warning(`Could not post a suggested change: ${(err as Error).message}`);
    }
  }

  // The comment/summary step never gates the run — only findings do, and
  // only when `fail-on` says they should.
  if (result.conclusion === "failure") {
    core.setFailed(`Ctrl Alt Delegate found ${result.findings.length} finding(s).`);
  }
}

// Guarded so importing this module in tests (e.g. to test isForkPullRequest)
// does not also run the Action.
if (!process.env.VITEST) {
  main().catch((err) => {
    core.setFailed((err as Error).message ?? String(err));
  });
}
