// src/commands/mirror.ts
/**
 * Tycho Forge - Sovereign Mirror Synchronization
 * @description Manages bidirectional sync between git.qtrn.io and cloud mirrors (GitHub, GitLab)
 * @license AGPL-3.0-only
 */

export async function handleMirrorCommand(args: string[]): Promise<void> {
  const action = args[0] || "status";

  switch (action) {
    case "status": {
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Inspecting sovereign repository mirrors...\n`);
      const proc = Bun.spawn(["git", "remote", "-v"], { stdout: "pipe" });
      const remotes = (await new Response(proc.stdout).text()).trim();
      console.log(remotes);
      break;
    }

    case "sync": {
      const targetRemote = args[1] || "github";
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Synchronizing sovereign repository with mirror \x1b[1m${targetRemote}\x1b[0m...\n`);

      // 1. Fetch current branches from origin
      console.log(`Fetching from sovereign origin...`);
      const fetchProc = Bun.spawn(["git", "fetch", "origin"], { stdio: ["inherit", "inherit", "inherit"] });
      if ((await fetchProc.exited) !== 0) {
        throw new Error("Failed to fetch from sovereign origin");
      }

      // 2. Push to target mirror
      console.log(`Pushing branches and tags to ${targetRemote}...`);
      const pushProc = Bun.spawn(["git", "push", targetRemote, "--all"], { stdio: ["inherit", "inherit", "inherit"] });
      if ((await pushProc.exited) !== 0) {
        throw new Error(`Failed to push branches to mirror ${targetRemote}`);
      }

      const pushTags = Bun.spawn(["git", "push", targetRemote, "--tags"], { stdio: ["inherit", "inherit", "inherit"] });
      await pushTags.exited;

      console.log(`\n\x1b[32m✔ Sovereign mirror synchronized successfully with ${targetRemote}.\x1b[0m`);
      break;
    }

    default:
      console.log(`
Usage: tycho forge mirror <status|sync> [target-remote]

Actions:
  status                   Display configured remotes and mirror status
  sync [mirror-remote]     Synchronize sovereign repository to mirror (default: github)
`);
      break;
  }
}
