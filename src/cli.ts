#!/usr/bin/env bun
// src/cli.ts
/**
 * Tycho Forge - Multi-Forge Sovereign CLI Router
 * @license AGPL-3.0-only
 */

import { ForgeContextResolver } from "./detector.ts";
import { ForgeDriverFactory } from "./factory.ts";
import { handlePrCommand } from "./commands/pr.ts";
import { handleRepoCommand } from "./commands/repo.ts";
import { handleAuthCommand } from "./commands/auth.ts";
import { handleMirrorCommand } from "./commands/mirror.ts";
import { handleActionCommand } from "./commands/action.ts";
import { handleIssueCommand } from "./commands/issue.ts";
import { ConfigManager } from "./config.ts";
import type { ForgeType } from "./types.ts";

import pkg from "../package.json";

const VERSION: string = pkg.version;
const rawArgs = process.argv.slice(2);

// Extract optional --forge=<type> override
let overrideForge: ForgeType | undefined;
const filteredArgs: string[] = [];

for (const arg of rawArgs) {
  if (arg.startsWith("--forge=")) {
    overrideForge = arg.split("=")[1] as ForgeType;
  } else {
    filteredArgs.push(arg);
  }
}

const command = filteredArgs[0];
const subArgs = filteredArgs.slice(1);

// Standard Git commands to delegate natively to git
const NATIVE_GIT_COMMANDS = new Set([
  "add",
  "am",
  "archive",
  "bisect",
  "blame",
  "branch",
  "bundle",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "config",
  "describe",
  "diff",
  "fetch",
  "format-patch",
  "gc",
  "grep",
  "init",
  "log",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "reflog",
  "remote",
  "reset",
  "restore",
  "revert",
  "rm",
  "shortlog",
  "show",
  "stash",
  "status",
  "submodule",
  "switch",
  "tag",
  "whatchanged",
  "worktree",
]);

if (!command || command === "--help" || command === "-h" || command === "help") {
  console.log(`\x1b[34mTycho Forge - Multi-Forge Sovereign Adapter (v${VERSION})\x1b[0m`);
  console.log(`
Usage: tycho forge <command> [options] [--forge=forgejo|github|gitlab|bitbucket]

Forge Commands:
  pr          Pull Request / Merge Request management (list, view, create, checkout, merge)
  repo        Repository operations (view, create, clone)
  issue       Issues, milestones & labels (list, create, import <roadmap.json>)
  action      CI/CD workflows & Actions management (add container-build)
  mirror      Sovereign mirror replication (status, sync)
  auth        Authentication & identity checks (status, whoami, login)
  setup       Configure or change primary git forge (github, gitlab, git.qtrn.io, custom)

Native Git Passthrough:
  push, pull, commit, status, fetch, branch, checkout, diff, log, add, tag, ...
  (All standard Git commands are natively executed)

Supported Forges:
  • Forgejo / Gitea   (git.qtrn.io, codeberg.org)
  • GitHub            (github.com)
  • GitLab            (gitlab.com or self-hosted)
  • Bitbucket         (bitbucket.org)

Context Resolution:
  Tycho automatically detects the forge type by inspecting the current
  repository's git remotes. When no remote exists, the primary forge configured
  during first launch is used. You can override at any time with --forge=<name>.

Examples:
  tycho forge setup
  tycho forge push origin main
  tycho forge status
  tycho forge repo create my-project --org my-org --push --gitflow
  tycho forge action add container-build
  tycho forge pr list
`);
  process.exit(0);
}

try {
  // Setup / reconfigure command
  if (command === "setup" || command === "config") {
    await ConfigManager.promptFirstLaunch();
    process.exit(0);
  }

  // Direct mirror commands don't need a specific remote forge driver
  if (command === "mirror") {
    await handleMirrorCommand(subArgs);
    process.exit(0);
  }

  // Native Git commands pass through directly to git
  if (NATIVE_GIT_COMMANDS.has(command)) {
    const proc = Bun.spawn(["git", ...filteredArgs], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    const exitCode = await proc.exited;
    process.exit(exitCode);
  }

  // Resolve forge context from current git workspace or config/first launch prompt
  const context = await ForgeContextResolver.resolve(overrideForge);
  const driver = ForgeDriverFactory.create(context);

  switch (command) {
    case "pr":
    case "mr":
      await handlePrCommand(driver, subArgs);
      break;

    case "repo":
      await handleRepoCommand(driver, subArgs);
      break;

    case "issue":
      await handleIssueCommand(driver, subArgs);
      break;

    case "action":
    case "workflow":
      await handleActionCommand(driver, subArgs);
      break;

    case "auth":
      await handleAuthCommand(driver, subArgs);
      break;

    case "whoami":
      console.log(await driver.whoami());
      break;

    default:
      // Passthrough to underlying native CLI or fallback to git
      const exitCode = await driver.passthrough(filteredArgs);
      process.exit(exitCode);
  }
} catch (error: any) {
  console.error(`\x1b[31m[tycho-forge error]\x1b[0m ${error.message}`);
  process.exit(1);
}
