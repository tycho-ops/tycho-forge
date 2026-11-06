// src/detector.ts
/**
 * Tycho Forge - Forge Context Resolver
 * @description Auto-detects forge type, host, and repo coordinates from git remotes
 * @license AGPL-3.0-only
 */

import type { ForgeContext, ForgeType } from "./types.ts";

import { ConfigManager } from "./config.ts";

export class ForgeContextResolver {
  /**
   * Resolves the forge context from the current directory git remotes, or persistent config/first-launch prompt
   */
  public static async resolve(overrideForge?: ForgeType): Promise<ForgeContext> {
    const remoteUrl = await this.detectRemoteUrl();
    const parsed = this.parseGitUrl(remoteUrl);

    let forgeType: ForgeType = overrideForge || (process.env.TYCHO_FORGE as ForgeType) || "unknown";

    if (!overrideForge && !process.env.TYCHO_FORGE) {
      if (parsed.host) {
        forgeType = this.classifyHost(parsed.host);
      } else {
        // No remote URL detected in current directory (e.g. new repo or outside git)
        let config = ConfigManager.load();
        if (!config && process.stdin.isTTY) {
          config = await ConfigManager.promptFirstLaunch();
        }
        if (config) {
          forgeType = config.forgeType;
          parsed.host = config.host;
          if (config.defaultOrg && !parsed.owner) {
            parsed.owner = config.defaultOrg;
          }
        }
      }
    }

    return {
      forgeType,
      host: parsed.host,
      owner: parsed.owner,
      repo: parsed.repo,
      remoteName: parsed.remoteName,
      remoteUrl,
    };
  }

  /**
   * Extract primary remote URL with fallback precedence: origin > sovereign > upstream
   */
  private static async detectRemoteUrl(): Promise<string> {
    const remotesToTry = ["origin", "sovereign", "upstream"];

    for (const remote of remotesToTry) {
      try {
        const proc = Bun.spawn(["git", "config", "--get", `remote.${remote}.url`], {
          stdout: "pipe",
          stderr: "ignore",
        });
        const url = (await new Response(proc.stdout).text()).trim();
        if (url) return url;
      } catch {
        // Continue to next remote
      }
    }

    // Fallback: git remote -v first entry
    try {
      const proc = Bun.spawn(["git", "remote", "-v"], { stdout: "pipe", stderr: "ignore" });
      const text = (await new Response(proc.stdout).text()).trim();
      const firstLine = text.split("\n")[0];
      if (firstLine) {
        const parts = firstLine.split(/\s+/);
        if (parts[1]) return parts[1];
      }
    } catch {
      // Ignored
    }

    return "";
  }

  /**
   * Parse SSH and HTTPS git URLs
   */
  public static parseGitUrl(rawUrl: string): { host: string; owner: string; repo: string; remoteName: string } {
    if (!rawUrl) {
      return { host: "", owner: "", repo: "", remoteName: "origin" };
    }

    let clean = rawUrl.trim();
    let host = "";
    let path = "";

    // SCP-like SSH: git@host:owner/repo.git
    const scpMatch = clean.match(/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+):(.+)$/);
    if (scpMatch) {
      host = scpMatch[2];
      path = scpMatch[3];
    } else {
      // Standard URI: https://host/owner/repo.git or ssh://...
      try {
        // Strip auth like crapougnax:token@
        const urlObj = new URL(clean.replace(/^git\+/, ""));
        host = urlObj.hostname;
        path = urlObj.pathname.replace(/^\//, "");
      } catch {
        // Fallback simple parsing
        const match = clean.match(/^(?:https?|ssh):\/\/([^/]+)\/(.+)$/);
        if (match) {
          host = match[1].includes("@") ? match[1].split("@")[1] : match[1];
          path = match[2];
        }
      }
    }

    // Clean .git extension
    path = path.replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);

    const repo = parts.pop() || "";
    const owner = parts.join("/"); // Handles multi-level groups (e.g. GitLab groups)

    return { host, owner, repo, remoteName: "origin" };
  }

  /**
   * Classify host into known forge types
   */
  public static classifyHost(host: string): ForgeType {
    if (!host) return "unknown";
    const lower = host.toLowerCase();

    if (lower === "github.com" || lower.endsWith(".github.com")) {
      return "github";
    }

    if (
      lower === "git.qtrn.io" ||
      lower === "codeberg.org" ||
      lower.includes("forgejo") ||
      lower.includes("gitea")
    ) {
      return "forgejo";
    }

    if (lower === "gitlab.com" || lower.includes("gitlab")) {
      return "gitlab";
    }

    if (lower === "bitbucket.org" || lower.includes("bitbucket")) {
      return "bitbucket";
    }

    return "unknown";
  }
}
