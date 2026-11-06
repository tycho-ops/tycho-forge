// src/drivers/forgejo.driver.ts
/**
 * Tycho Forge - Forgejo & Gitea Adapter
 * @description Supports both 'tea' CLI and direct native Forgejo REST API v1
 * @license AGPL-3.0-only
 */

import type { ForgejoPull, ForgejoRepo, ForgejoUser } from "./forgejo.api.ts";
import type { GitForgeDriver } from "./driver.interface.ts";
import { ConfigManager } from "../config.ts";
import type {
  AuthStatus,
  ForgeContext,
  Issue,
  IssueCreateOptions,
  IssueListOptions,
  Label,
  Milestone,
  ForgeType,
  PrCreateOptions,
  PrListOptions,
  PrMergeOptions,
  PullRequest,
  ReleaseCreateOptions,
  RepoCreateOptions,
  RepoDetails,
} from "../types.ts";

export class ForgejoDriver implements GitForgeDriver {
  public readonly forgeType: ForgeType = "forgejo";
  private readonly baseUrl: string;
  public readonly token?: string;

  constructor(public readonly context: ForgeContext) {
    const host = context.host || "git.qtrn.io";
    this.baseUrl = host.startsWith("http") ? host : `https://${host}`;
    // Never hardcode credentials: env vars first, then ~/.tycho/forge.json (no implicit fallback).
    this.token =
      process.env.FORGEJO_TOKEN ||
      process.env.QTRN_GIT_TOKEN ||
      process.env.TEA_TOKEN ||
      ConfigManager.load()?.token ||
      undefined;
  }

  public async isCliAvailable(): Promise<boolean> {
    return !!Bun.which("tea");
  }

  public getCliInstallHint(): string {
    if (process.platform === "darwin") {
      return "Forgejo/Gitea CLI (tea) optional: brew install tea (macOS)";
    }
    return "Forgejo/Gitea CLI (tea) optional: https://gitea.com/gitea/tea or run standard commands via git";
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `token ${this.token}`;
    }
    return headers;
  }

  /**
   * Owner and repository of the current context.
   * @returns The repository coordinates.
   * @throws Error when no repository was detected (run inside a clone, or pass a remote).
   */
  private repoCoords(): { owner: string; repo: string } {
    const { owner, repo } = this.context;
    if (!owner || !repo) {
      throw new Error("No repository detected: run this command inside a git clone with a Forgejo remote.");
    }
    return { owner, repo };
  }

  public async authStatus(): Promise<AuthStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/user`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const user = (await res.json()) as ForgejoUser;
        return {
          loggedIn: true,
          user: user.username,
          host: this.context.host || "git.qtrn.io",
          tokenType: "Bearer/Token",
        };
      }
      return {
        loggedIn: false,
        host: this.context.host || "git.qtrn.io",
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (e: any) {
      return {
        loggedIn: false,
        host: this.context.host || "git.qtrn.io",
        error: e.message,
      };
    }
  }

  public async whoami(): Promise<string> {
    const status = await this.authStatus();
    return status.user || "unauthenticated";
  }

  public async repoView(): Promise<RepoDetails> {
    const { owner, repo } = this.repoCoords();
    const res = await fetch(`${this.baseUrl}/api/v1/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch repo ${owner}/${repo}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as ForgejoRepo;
    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.login || owner,
      defaultBranch: data.default_branch || "main",
      isPrivate: data.private,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      webUrl: data.html_url,
      description: data.description,
    };
  }

  public async repoCreate(options: RepoCreateOptions): Promise<RepoDetails> {
    const endpoint = options.org
      ? `${this.baseUrl}/api/v1/orgs/${options.org}/repos`
      : `${this.baseUrl}/api/v1/user/repos`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        name: options.name,
        private: options.isPrivate !== false,
        description: options.description || "",
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create repository ${options.name}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as ForgejoRepo;
    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.login || "",
      defaultBranch: data.default_branch || "main",
      isPrivate: data.private,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      webUrl: data.html_url,
      description: data.description,
    };
  }

  public async repoClone(target: string, destination?: string): Promise<void> {
    const url = target.startsWith("http") || target.startsWith("git@")
      ? target
      : `${this.baseUrl}/${target}.git`;

    const args = ["git", "clone", url];
    if (destination) args.push(destination);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`git clone failed`);
    }
  }

  public async prList(options?: PrListOptions): Promise<PullRequest[]> {
    const { owner, repo } = this.repoCoords();
    const state = options?.state || "open";
    const url = `${this.baseUrl}/api/v1/repos/${owner}/${repo}/pulls?state=${state}&limit=${options?.limit || 20}`;

    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      throw new Error(`Failed to list pull requests for ${owner}/${repo}: HTTP ${res.status}`);
    }
    const list = (await res.json()) as ForgejoPull[];
    return list.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.merged ? "merged" : item.state === "closed" ? "closed" : "open",
      author: item.user?.username || "unknown",
      sourceBranch: item.head?.ref,
      targetBranch: item.base?.ref,
      url: item.html_url,
      updatedAt: item.updated_at,
    }));
  }

  public async prView(prNumber: number): Promise<PullRequest> {
    const { owner, repo } = this.repoCoords();
    const res = await fetch(`${this.baseUrl}/api/v1/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch PR #${prNumber}: HTTP ${res.status}`);
    }
    const item = (await res.json()) as ForgejoPull;
    return {
      number: item.number,
      title: item.title,
      state: item.merged ? "merged" : item.state === "closed" ? "closed" : "open",
      author: item.user?.username || "unknown",
      sourceBranch: item.head?.ref,
      targetBranch: item.base?.ref,
      url: item.html_url,
    };
  }

  public async prCreate(options: PrCreateOptions): Promise<PullRequest> {
    const { owner, repo } = this.repoCoords();

    // Auto-detect current branch as head if not specified
    let head = options.head;
    if (!head) {
      const proc = Bun.spawn(["git", "branch", "--show-current"], { stdout: "pipe" });
      head = (await new Response(proc.stdout).text()).trim();
    }

    const res = await fetch(`${this.baseUrl}/api/v1/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        title: options.title,
        body: options.body || "",
        base: options.base || "main",
        head,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create PR: HTTP ${res.status} - ${err}`);
    }
    const item = (await res.json()) as ForgejoPull;
    return {
      number: item.number,
      title: item.title,
      state: "open",
      author: item.user?.username || "unknown",
      sourceBranch: item.head?.ref,
      targetBranch: item.base?.ref,
      url: item.html_url,
    };
  }

  public async prCheckout(prNumber: number): Promise<void> {
    // If tea CLI is installed, delegate to tea
    if (await this.isCliAvailable()) {
      const proc = Bun.spawn(["tea", "pr", "checkout", prNumber.toString()], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      if ((await proc.exited) === 0) return;
    }

    // Native Git fallback: fetch refs/pull/<id>/head into local branch pr-<id>
    const proc = Bun.spawn(
      ["git", "fetch", "origin", `pull/${prNumber}/head:pr-${prNumber}`],
      { stdio: ["inherit", "inherit", "inherit"] }
    );
    if ((await proc.exited) !== 0) {
      throw new Error(`Failed to fetch pull request #${prNumber}`);
    }
    const checkout = Bun.spawn(["git", "checkout", `pr-${prNumber}`], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await checkout.exited) !== 0) {
      throw new Error(`Failed to checkout branch pr-${prNumber}`);
    }
  }

  public async prMerge(prNumber: number, options?: PrMergeOptions): Promise<void> {
    const { owner, repo } = this.repoCoords();
    const doType = options?.method === "squash" ? "squash" : options?.method === "rebase" ? "rebase" : "merge";

    const res = await fetch(`${this.baseUrl}/api/v1/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        Do: doType,
        delete_branch_after_merge: options?.deleteBranch ?? true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to merge PR #${prNumber}: HTTP ${res.status} - ${err}`);
    }
  }

  public async releaseCreate(options: ReleaseCreateOptions): Promise<void> {
    const { owner, repo } = this.repoCoords();

    const res = await fetch(`${this.baseUrl}/api/v1/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        tag_name: options.tag,
        name: options.title || options.tag,
        body: options.notes || "",
        draft: !!options.draft,
        prerelease: !!options.prerelease,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create release ${options.tag}: HTTP ${res.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Issues, milestones & labels (Forgejo REST API v1)
  // ---------------------------------------------------------------------------

  private repoApi(path: string): string {
    const { owner, repo } = this.repoCoords();
    return `${this.baseUrl}/api/v1/repos/${owner}/${repo}${path}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) {
      throw new Error("No Forgejo token: set FORGEJO_TOKEN or run `tycho forge setup`.");
    }
    const res = await fetch(this.repoApi(path), {
      method,
      headers: this.getHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} failed: HTTP ${res.status} ${await res.text()}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }

  public async issueList(options?: IssueListOptions): Promise<Issue[]> {
    const state = options?.state || "open";
    const limit = options?.limit || 50;
    const list = await this.request<any[]>("GET", `/issues?type=issues&state=${state}&limit=${limit}`);
    return list.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels || []).map((l: any) => l.name),
      milestone: i.milestone?.title,
      url: i.html_url,
    }));
  }

  public async issueCreate(options: IssueCreateOptions): Promise<Issue> {
    const i = await this.request<any>("POST", "/issues", {
      title: options.title,
      body: options.body || "",
      labels: options.labelIds || [],
      milestone: options.milestoneId,
    });
    return { number: i.number, title: i.title, state: i.state, labels: [], url: i.html_url };
  }

  public async milestoneList(): Promise<Milestone[]> {
    const list = await this.request<any[]>("GET", "/milestones?state=all&limit=100");
    return list.map((m) => ({ id: m.id, title: m.title }));
  }

  public async milestoneCreate(title: string, description?: string): Promise<Milestone> {
    const m = await this.request<any>("POST", "/milestones", { title, description: description || "" });
    return { id: m.id, title: m.title };
  }

  public async labelList(): Promise<Label[]> {
    const list = await this.request<any[]>("GET", "/labels?limit=100");
    return list.map((l) => ({ id: l.id, name: l.name, color: l.color }));
  }

  public async labelCreate(name: string, color: string): Promise<Label> {
    const l = await this.request<any>("POST", "/labels", { name, color });
    return { id: l.id, name: l.name, color: l.color };
  }

  public async passthrough(args: string[]): Promise<number> {
    if (await this.isCliAvailable()) {
      const proc = Bun.spawn(["tea", ...args], { stdio: ["inherit", "inherit", "inherit"] });
      return proc.exited;
    }
    // Fallback to native git command
    const proc = Bun.spawn(["git", ...args], { stdio: ["inherit", "inherit", "inherit"] });
    const exitCode = await proc.exited;
    if (exitCode === 0) return 0;

    console.error(`\x1b[33m[tycho-forge]\x1b[0m ${this.getCliInstallHint()}`);
    return exitCode;
  }
}
