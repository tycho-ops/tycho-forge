// src/commands/pr.ts
/**
 * Tycho Forge - Pull Request Commands
 * @license AGPL-3.0-only
 */

import type { GitForgeDriver } from "../drivers/driver.interface.ts";

export async function handlePrCommand(driver: GitForgeDriver, args: string[]): Promise<void> {
  const action = args[0] || "list";

  switch (action) {
    case "list":
    case "ls": {
      const stateArg = args.find((a) => a.startsWith("--state="))?.split("=")[1] as any || "open";
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Listing \x1b[1m${stateArg}\x1b[0m pull requests on \x1b[32m${driver.context.host}\x1b[0m (${driver.context.owner}/${driver.context.repo})...\n`);
      const prs = await driver.prList({ state: stateArg });
      if (prs.length === 0) {
        console.log(`No ${stateArg} pull requests found.`);
        return;
      }
      console.log(`\x1b[1mID\tSTATE\tBRANCH\t\t\tTITLE\t\t\tAUTHOR\x1b[0m`);
      console.log(`--------------------------------------------------------------------------------`);
      for (const pr of prs) {
        const stateColor = pr.state === "open" ? "\x1b[32m" : pr.state === "merged" ? "\x1b[35m" : "\x1b[31m";
        const branch = `${pr.sourceBranch} -> ${pr.targetBranch}`;
        console.log(`#${pr.number}\t${stateColor}${pr.state.toUpperCase()}\x1b[0m\t${branch.padEnd(20)}\t${pr.title.slice(0, 30).padEnd(30)}\t@${pr.author}`);
      }
      break;
    }

    case "view": {
      const num = parseInt(args[1], 10);
      if (isNaN(num)) {
        console.error("Usage: tycho forge pr view <number>");
        process.exit(1);
      }
      const pr = await driver.prView(num);
      console.log(`\x1b[1mPull Request #${pr.number}: ${pr.title}\x1b[0m`);
      console.log(`State:    ${pr.state.toUpperCase()}`);
      console.log(`Author:   @${pr.author}`);
      console.log(`Branches: ${pr.sourceBranch} -> ${pr.targetBranch}`);
      console.log(`URL:      ${pr.url}`);
      break;
    }

    case "checkout":
    case "co": {
      const num = parseInt(args[1], 10);
      if (isNaN(num)) {
        console.error("Usage: tycho forge pr checkout <number>");
        process.exit(1);
      }
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Checking out PR #${num}...`);
      await driver.prCheckout(num);
      console.log(`\x1b[32m✔\x1b[0m Checked out PR #${num}`);
      break;
    }

    case "create": {
      const titleIndex = args.indexOf("--title");
      const title = titleIndex !== -1 && args[titleIndex + 1] ? args[titleIndex + 1] : args[1];
      if (!title) {
        console.error("Usage: tycho forge pr create --title <title> [--body <body>] [--base <base>]");
        process.exit(1);
      }
      const bodyIndex = args.indexOf("--body");
      const body = bodyIndex !== -1 ? args[bodyIndex + 1] : undefined;
      const baseIndex = args.indexOf("--base");
      const base = baseIndex !== -1 ? args[baseIndex + 1] : undefined;

      console.log(`\x1b[34m[tycho-forge]\x1b[0m Creating pull request on ${driver.context.host}...`);
      const pr = await driver.prCreate({ title, body, base });
      console.log(`\x1b[32m✔\x1b[0m Created PR #${pr.number}: ${pr.title}`);
      console.log(`URL: ${pr.url}`);
      break;
    }

    case "merge": {
      const num = parseInt(args[1], 10);
      if (isNaN(num)) {
        console.error("Usage: tycho forge pr merge <number> [--squash|--rebase|--merge]");
        process.exit(1);
      }
      const method = args.includes("--squash") ? "squash" : args.includes("--rebase") ? "rebase" : "merge";
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Merging PR #${num} using ${method}...`);
      await driver.prMerge(num, { method });
      console.log(`\x1b[32m✔\x1b[0m Merged PR #${num}`);
      break;
    }

    default:
      console.log(`
Usage: tycho forge pr <action> [options]

Actions:
  list [--state=open|closed|all]  List pull requests
  view <number>                   View PR details
  create --title <title>          Create a new PR
  checkout <number>               Checkout PR branch locally
  merge <number> [--squash]       Merge a pull request
`);
      break;
  }
}
