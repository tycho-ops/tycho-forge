// src/config.ts
/**
 * Tycho Forge - Persistent User Configuration & Interactive First-Launch Setup
 * @license AGPL-3.0-only
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as readline from "node:readline/promises";
import type { ForgeType } from "./types.ts";

export interface TychoForgeConfig {
  defaultForge: string;
  forgeType: ForgeType;
  host: string;
  defaultOrg?: string;
  token?: string;
}

export type TychoGitConfig = TychoForgeConfig;

export class ConfigManager {
  public static getWorkDir(): string {
    return process.env.TYCHO_WORK_DIR || join(process.env.HOME || "", ".tycho");
  }

  public static getConfigPath(): string {
    const primary = join(this.getWorkDir(), "forge.json");
    if (!existsSync(primary)) {
      const legacy = join(this.getWorkDir(), "git.json");
      if (existsSync(legacy)) return legacy;
    }
    return primary;
  }

  public static load(): TychoForgeConfig | null {
    const configPath = this.getConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as TychoForgeConfig;
    } catch {
      return null;
    }
  }

  public static save(config: TychoForgeConfig): void {
    const workDir = this.getWorkDir();
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }
    writeFileSync(this.getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Interactive first-launch prompt when no forge is configured
   */
  public static async promptFirstLaunch(): Promise<TychoForgeConfig> {
    console.log(`\n\x1b[34m╭──────────────────────────────────────────────────────────╮\x1b[0m`);
    console.log(`\x1b[34m│\x1b[0m  \x1b[1mTycho Forge — First Launch Setup\x1b[0m                        \x1b[34m│\x1b[0m`);
    console.log(`\x1b[34m│\x1b[0m  Please select your primary Git Forge:                   \x1b[34m│\x1b[0m`);
    console.log(`\x1b[34m╰──────────────────────────────────────────────────────────╯\x1b[0m\n`);

    console.log(`  \x1b[36m1)\x1b[0m github      (github.com)`);
    console.log(`  \x1b[36m2)\x1b[0m gitlab      (gitlab.com)`);
    console.log(`  \x1b[36m3)\x1b[0m git.qtrn.io (git.qtrn.io — Sovereign Cloud)`);
    console.log(`  \x1b[36m4)\x1b[0m custom      (Self-hosted URL)\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let config: TychoGitConfig;

    try {
      const choice = (await rl.question("\x1b[1mSelect an option [1-4]: \x1b[0m")).trim().toLowerCase();

      switch (choice) {
        case "1":
        case "github": {
          config = {
            defaultForge: "github",
            forgeType: "github",
            host: "github.com",
          };
          break;
        }

        case "2":
        case "gitlab": {
          config = {
            defaultForge: "gitlab",
            forgeType: "gitlab",
            host: "gitlab.com",
          };
          break;
        }

        case "3":
        case "git.qtrn.io":
        case "qtrn": {
          config = {
            defaultForge: "git.qtrn.io",
            forgeType: "forgejo",
            host: "git.qtrn.io",
          };
          break;
        }

        case "4":
        case "custom": {
          const customHost = (await rl.question("Enter your custom Git host (e.g. git.example.org): ")).trim();
          console.log("\nForge Engine Types: forgejo, gitlab, github, bitbucket");
          const customEngine = (await rl.question("Select engine type [forgejo]: ")).trim().toLowerCase() || "forgejo";

          config = {
            defaultForge: "custom",
            forgeType: (customEngine as ForgeType) || "forgejo",
            host: customHost || "localhost",
          };
          break;
        }

        default: {
          console.log(`Invalid selection "${choice}". Defaulting to git.qtrn.io.`);
          config = {
            defaultForge: "git.qtrn.io",
            forgeType: "forgejo",
            host: "git.qtrn.io",
          };
          break;
        }
      }

      this.save(config);
      console.log(`\n\x1b[32m✔ Configuration saved to ${this.getConfigPath()}\x1b[0m`);
      console.log(`Primary Forge: \x1b[1m${config.host}\x1b[0m (${config.forgeType.toUpperCase()})\n`);
      return config;
    } finally {
      rl.close();
    }
  }
}
