// src/factory.ts
/**
 * Tycho Forge - Driver Factory
 * @description Instantiates the appropriate GitForgeDriver based on detected context
 * @license AGPL-3.0-only
 */

import type { GitForgeDriver } from "./drivers/driver.interface.ts";
import { GitHubDriver } from "./drivers/github.driver.ts";
import { ForgejoDriver } from "./drivers/forgejo.driver.ts";
import { GitLabDriver } from "./drivers/gitlab.driver.ts";
import { BitbucketDriver } from "./drivers/bitbucket.driver.ts";
import type { ForgeContext } from "./types.ts";

export class ForgeDriverFactory {
  public static create(context: ForgeContext): GitForgeDriver {
    switch (context.forgeType) {
      case "github":
        return new GitHubDriver(context);
      case "forgejo":
        return new ForgejoDriver(context);
      case "gitlab":
        return new GitLabDriver(context);
      case "bitbucket":
        return new BitbucketDriver(context);
      default: {
        // No guess: an unrecognised or missing forge must be stated explicitly.
        const where = context.host ? `host "${context.host}" is not a known forge` : "no git remote detected";
        throw new Error(
          `Cannot select a forge (${where}). Run inside a clone, pass --forge=forgejo|github|gitlab|bitbucket, or run: tycho forge setup`,
        );
      }
    }
  }
}
