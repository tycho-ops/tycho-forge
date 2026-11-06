// src/drivers/bitbucket.driver.ts
/**
 * Tycho Forge - Bitbucket Cloud Adapter
 * @description Uses Bitbucket Cloud REST API v2
 * @license AGPL-3.0-only
 */

import type { BitbucketPage, BitbucketPull, BitbucketRepo, BitbucketUser } from "./bitbucket.api.ts";
import type { GitForgeDriver } from "./driver.interface.ts";
import type {
  AuthStatus,
  ForgeContext,
  ForgeType,
  PrCreateOptions,
  PrListOptions,
  PrMergeOptions,
  PullRequest,
  ReleaseCreateOptions,
  RepoCreateOptions,
  RepoDetails,
} from "../types.ts";

export class BitbucketDriver implements GitForgeDriver {
  public readonly forgeType: ForgeType = "bitbucket";
  private readonly baseUrl = "https://api.bitbucket.org/2.0";
  private user?: string;
  private appPassword?: string;

  constructor(public readonly context: ForgeContext) {
    this.user = process.env.BITBUCKET_USER || process.env.BITBUCKET_USERNAME;
    this.appPassword = process.env.BITBUCKET_APP_PASSWORD || process.env.BITBUCKET_TOKEN;
  }

  public async isCliAvailable(): Promise<boolean> {
    return true; // Native HTTP REST API driver
  }

  public getCliInstallHint(): string {
    return "Bitbucket uses REST API v2. Set BITBUCKET_USER and BITBUCKET_APP_PASSWORD in environment.";
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.user && this.appPassword) {
      const basic = Buffer.from(`${this.user}:${this.appPassword}`).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }
    return headers;
  }

  public async authStatus(): Promise<AuthStatus> {
    if (!this.user || !this.appPassword) {
      return {
        loggedIn: false,
        host: "bitbucket.org",
        error: "BITBUCKET_USER and BITBUCKET_APP_PASSWORD not set",
      };
    }
    try {
      const res = await fetch(`${this.baseUrl}/user`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = (await res.json()) as BitbucketUser;
        return {
          loggedIn: true,
          user: data.username || data.display_name,
          host: "bitbucket.org",
          tokenType: "AppPassword",
        };
      }
      return { loggedIn: false, host: "bitbucket.org", error: `HTTP ${res.status}` };
    } catch (e: any) {
      return { loggedIn: false, host: "bitbucket.org", error: e.message };
    }
  }

  public async whoami(): Promise<string> {
    const status = await this.authStatus();
    return status.user || "unauthenticated";
  }

  public async repoView(): Promise<RepoDetails> {
    const workspace = this.context.owner;
    const repo_slug = this.context.repo;
    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${repo_slug}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to view repo ${workspace}/${repo_slug}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as BitbucketRepo;
    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.username || workspace,
      defaultBranch: data.mainbranch?.name || "main",
      isPrivate: data.is_private,
      cloneUrl: `https://bitbucket.org/${workspace}/${repo_slug}.git`,
      sshUrl: `git@bitbucket.org:${workspace}/${repo_slug}.git`,
      webUrl: data.links?.html?.href,
      description: data.description,
    };
  }

  public async repoCreate(options: RepoCreateOptions): Promise<RepoDetails> {
    const workspace = options.org || this.context.owner || this.user;
    if (!workspace) throw new Error("Workspace/Owner is required to create a Bitbucket repository");

    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${options.name}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        scm: "git",
        is_private: options.isPrivate !== false,
        description: options.description || "",
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create repository: HTTP ${res.status}`);
    }
    const data = (await res.json()) as BitbucketRepo;
    return {
      name: data.name,
      fullName: data.full_name,
      owner: workspace,
      defaultBranch: "main",
      isPrivate: data.is_private,
      cloneUrl: `https://bitbucket.org/${workspace}/${options.name}.git`,
      sshUrl: `git@bitbucket.org:${workspace}/${options.name}.git`,
      webUrl: data.links?.html?.href,
      description: data.description,
    };
  }

  public async repoClone(target: string, destination?: string): Promise<void> {
    const url = target.startsWith("http") || target.startsWith("git@")
      ? target
      : `https://bitbucket.org/${target}.git`;

    const args = ["git", "clone", url];
    if (destination) args.push(destination);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`git clone failed`);
    }
  }

  public async prList(options?: PrListOptions): Promise<PullRequest[]> {
    const workspace = this.context.owner;
    const repo_slug = this.context.repo;
    const state = options?.state === "all" ? "" : `?state=${(options?.state || "open").toUpperCase()}`;

    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${repo_slug}/pullrequests${state}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to list pull requests: HTTP ${res.status}`);
    }
    const data = (await res.json()) as BitbucketPage<BitbucketPull>;
    return (data.values || []).map((item) => ({
      number: item.id,
      title: item.title,
      state: item.state === "MERGED" ? "merged" : item.state === "DECLINED" ? "closed" : "open",
      author: item.author?.display_name || "unknown",
      sourceBranch: item.source?.branch?.name,
      targetBranch: item.destination?.branch?.name,
      url: item.links?.html?.href,
      updatedAt: item.updated_on,
    }));
  }

  public async prView(prNumber: number): Promise<PullRequest> {
    const workspace = this.context.owner;
    const repo_slug = this.context.repo;
    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${repo_slug}/pullrequests/${prNumber}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch PR #${prNumber}: HTTP ${res.status}`);
    }
    const item = (await res.json()) as BitbucketPull;
    return {
      number: item.id,
      title: item.title,
      state: item.state === "MERGED" ? "merged" : item.state === "DECLINED" ? "closed" : "open",
      author: item.author?.display_name || "unknown",
      sourceBranch: item.source?.branch?.name,
      targetBranch: item.destination?.branch?.name,
      url: item.links?.html?.href,
    };
  }

  public async prCreate(options: PrCreateOptions): Promise<PullRequest> {
    const workspace = this.context.owner;
    const repo_slug = this.context.repo;

    let head = options.head;
    if (!head) {
      const proc = Bun.spawn(["git", "branch", "--show-current"], { stdout: "pipe" });
      head = (await new Response(proc.stdout).text()).trim();
    }

    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${repo_slug}/pullrequests`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        title: options.title,
        description: options.body || "",
        source: { branch: { name: head } },
        destination: { branch: { name: options.base || "main" } },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create PR: HTTP ${res.status} - ${err}`);
    }
    const item = (await res.json()) as BitbucketPull;
    return {
      number: item.id,
      title: item.title,
      state: "open",
      author: item.author?.display_name || "unknown",
      sourceBranch: item.source?.branch?.name,
      targetBranch: item.destination?.branch?.name,
      url: item.links?.html?.href,
    };
  }

  public async prCheckout(prNumber: number): Promise<void> {
    const pr = await this.prView(prNumber);
    const proc = Bun.spawn(["git", "fetch", "origin", pr.sourceBranch], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await proc.exited) !== 0) throw new Error(`git fetch failed`);
    const checkout = Bun.spawn(["git", "checkout", pr.sourceBranch], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await checkout.exited) !== 0) throw new Error(`git checkout failed`);
  }

  public async prMerge(prNumber: number, options?: PrMergeOptions): Promise<void> {
    const workspace = this.context.owner;
    const repo_slug = this.context.repo;

    const res = await fetch(`${this.baseUrl}/repositories/${workspace}/${repo_slug}/pullrequests/${prNumber}/merge`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        close_source_branch: options?.deleteBranch ?? true,
        merge_strategy: options?.method === "squash" ? "squash" : "merge_commit",
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to merge PR #${prNumber}: HTTP ${res.status}`);
    }
  }

  public async releaseCreate(options: ReleaseCreateOptions): Promise<void> {
    // Bitbucket uses git tags
    const proc = Bun.spawn(["git", "tag", "-a", options.tag, "-m", options.title || options.tag], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await proc.exited) !== 0) throw new Error(`git tag creation failed`);
    const push = Bun.spawn(["git", "push", "origin", options.tag], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await push.exited) !== 0) throw new Error(`git push tag failed`);
  }

  public async passthrough(_args: string[]): Promise<number> {
    console.error(`\x1b[33m[tycho-forge]\x1b[0m Bitbucket operates natively via HTTP REST API v2.`);
    return 1;
  }
}
