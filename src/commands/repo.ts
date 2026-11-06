// src/commands/repo.ts
/**
 * Tycho Forge - Repository Commands
 * @license AGPL-3.0-only
 */

import type { GitForgeDriver } from "../drivers/driver.interface.ts";

export async function handleRepoCommand(driver: GitForgeDriver, args: string[]): Promise<void> {
  const action = args[0] || "view";

  switch (action) {
    case "view": {
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Inspecting repository on \x1b[32m${driver.context.host}\x1b[0m...\n`);
      const repo = await driver.repoView();
      console.log(`\x1b[1mRepository:     ${repo.fullName}\x1b[0m`);
      console.log(`Forge:          ${driver.forgeType.toUpperCase()} (${driver.context.host})`);
      console.log(`Visibility:     ${repo.isPrivate ? "\x1b[33mPrivate\x1b[0m" : "\x1b[32mPublic\x1b[0m"}`);
      console.log(`Default Branch: ${repo.defaultBranch}`);
      console.log(`Clone (HTTPS):  ${repo.cloneUrl}`);
      console.log(`Clone (SSH):    ${repo.sshUrl}`);
      console.log(`Web URL:        ${repo.webUrl}`);
      if (repo.description) console.log(`Description:    ${repo.description}`);
      break;
    }

    case "clone": {
      const target = args[1];
      if (!target) {
        console.error("Usage: tycho forge repo clone <target> [destination]");
        process.exit(1);
      }
      const destination = args[2];
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Cloning \x1b[1m${target}\x1b[0m via ${driver.forgeType}...`);
      await driver.repoClone(target, destination);
      console.log(`\x1b[32m✔\x1b[0m Cloned successfully.`);
      break;
    }

    case "create": {
      const name = args[1];
      if (!name) {
        console.error("Usage: tycho forge repo create <name> [--private|--public] [--org <org>] [--gitflow] [--push]");
        process.exit(1);
      }
      const isPrivate = !args.includes("--public");
      const orgIndex = args.indexOf("--org");
      const org = orgIndex !== -1 ? args[orgIndex + 1] : (driver.context.owner || undefined);
      const shouldPush = args.includes("--push");
      const enableGitFlow = args.includes("--gitflow") || shouldPush;

      console.log(`\x1b[34m[tycho-forge]\x1b[0m Creating repository \x1b[1m${name}\x1b[0m on ${driver.context.host}...`);
      const repo = await driver.repoCreate({ name, isPrivate, org });
      console.log(`\x1b[32m✔\x1b[0m Created repository: \x1b[1m${repo.fullName}\x1b[0m`);
      console.log(`Clone: ${repo.cloneUrl}`);

      if (shouldPush) {
        console.log(`\n\x1b[34m[tycho-forge]\x1b[0m Linking local repository and pushing branches...`);

        // Check if inside a git work tree
        const isGitProc = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], { stdout: "pipe", stderr: "ignore" });
        const isGit = (await isGitProc.exited) === 0;

        if (!isGit) {
          console.warn(`\x1b[33mWarning:\x1b[0m Current directory is not a git repository. Skipping push.`);
          break;
        }

        // Add or update remote origin. Never embed credentials in the URL:
        // authentication goes through the git credential helper.
        const pushUrl = repo.cloneUrl;

        const remoteCheckProc = Bun.spawn(["git", "remote", "get-url", "origin"], { stdout: "pipe", stderr: "ignore" });
        const hasOrigin = (await remoteCheckProc.exited) === 0;

        if (hasOrigin) {
          await Bun.spawn(["git", "remote", "set-url", "origin", pushUrl]).exited;
        } else {
          await Bun.spawn(["git", "remote", "add", "origin", pushUrl]).exited;
        }
        console.log(`\x1b[32m✔\x1b[0m Remote \x1b[1morigin\x1b[0m configured: ${repo.cloneUrl}`);

        // Ensure main branch
        await Bun.spawn(["git", "branch", "-M", "main"]).exited;
        console.log(`\x1b[34m[tycho-forge]\x1b[0m Pushing \x1b[1mmain\x1b[0m...`);
        const pushMain = Bun.spawn(["git", "push", "-u", "origin", "main"], { stdio: ["inherit", "inherit", "inherit"] });
        if ((await pushMain.exited) !== 0) {
          console.error(`\x1b[31m✖ Failed to push main branch.\x1b[0m`);
          break;
        }
        console.log(`\x1b[32m✔\x1b[0m Pushed branch: main`);

        // If GitFlow is requested, create develop branch and push
        if (enableGitFlow) {
          console.log(`\x1b[34m[tycho-forge]\x1b[0m Initializing GitFlow: creating & pushing \x1b[1mdevelop\x1b[0m...`);
          const branchCheck = Bun.spawn(["git", "rev-parse", "--verify", "develop"], { stdout: "pipe", stderr: "ignore" });
          if ((await branchCheck.exited) !== 0) {
            await Bun.spawn(["git", "branch", "develop"]).exited;
          }
          const pushDev = Bun.spawn(["git", "push", "-u", "origin", "develop"], { stdio: ["inherit", "inherit", "inherit"] });
          if ((await pushDev.exited) === 0) {
            console.log(`\x1b[32m✔\x1b[0m Pushed branch: develop (GitFlow ready)`);
          } else {
            console.warn(`\x1b[33mWarning:\x1b[0m Failed to push develop branch.`);
          }
        }
      }
      break;
    }

    default:
      console.log(`
Usage: tycho forge repo <action> [options]

Actions:
  view                                         View repository details
  clone <target> [dest]                        Clone repository
  create <name> [--public] [--org <o>] [--push] [--gitflow] Create new repository
`);
      break;
  }
}
