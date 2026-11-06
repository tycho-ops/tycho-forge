// src/commands/auth.ts
/**
 * Tycho Forge - Auth & Identity Commands
 * @license AGPL-3.0-only
 */

import type { GitForgeDriver } from "../drivers/driver.interface.ts";

export async function handleAuthCommand(driver: GitForgeDriver, args: string[]): Promise<void> {
  const action = args[0] || "status";

  switch (action) {
    case "status": {
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Checking authentication on \x1b[32m${driver.context.host}\x1b[0m (${driver.forgeType.toUpperCase()})...\n`);
      const status = await driver.authStatus();
      if (status.loggedIn) {
        console.log(`\x1b[32m✔ Logged in to ${status.host} as @${status.user}\x1b[0m`);
        if (status.tokenType) console.log(`Auth method: ${status.tokenType}`);
      } else {
        console.log(`\x1b[31m✖ Not authenticated to ${status.host}\x1b[0m`);
        if (status.error) console.log(`Reason: ${status.error}`);
        console.log(`\nHint: ${driver.getCliInstallHint()}`);
      }
      break;
    }

    case "whoami": {
      const user = await driver.whoami();
      console.log(user);
      break;
    }

    default:
      console.log(`
Usage: tycho forge auth <status|whoami>
`);
      break;
  }
}
