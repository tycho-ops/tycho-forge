// src/drivers/github.driver.ts
/**
 * Tycho Forge - GitHub Adapter (delegates to gh CLI)
 * @license AGPL-3.0-only
 */

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

export class GitHubDriver implements GitForgeDriver {
  public readonly forgeType: ForgeType = "github";

  constructor(public readonly context: ForgeContext) {}

  public async isCliAvailable(): Promise<boolean> {
    return !!Bun.which("gh");
  }

  public getCliInstallHint(): string {
    return "GitHub CLI (gh) is required: brew install gh (macOS) or sudo apt install gh (Linux)";
  }

  public async authStatus(): Promise<AuthStatus> {
    if (!(await this.isCliAvailable())) {
      return { loggedIn: false, host: this.context.host || "github.com", error: this.getCliInstallHint() };
    }
    try {
      const proc = Bun.spawn(["gh", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
      const out = await new Response(proc.stdout).text();
      const err = await new Response(proc.stderr).text();
      const full = out + err;
      const loggedIn = (await proc.exited) === 0 || full.includes("Logged in to");
      const userMatch = full.match(/Logged in to [^ ]+ account ([^ \n(]+)/);
      return {
        loggedIn,
        user: userMatch ? userMatch[1] : undefined,
        host: this.context.host || "github.com",
      };
    } catch (e: any) {
      return { loggedIn: false, host: this.context.host || "github.com", error: e.message };
    }
  }

  public async whoami(): Promise<string> {
    const status = await this.authStatus();
    return status.user || "unauthenticated";
  }

  public async repoView(): Promise<RepoDetails> {
    const proc = Bun.spawn(
      ["gh", "repo", "view", "--json", "name,nameWithOwner,owner,defaultBranchRef,isPrivate,url,sshUrl"],
      { stdout: "pipe", stderr: "pipe" }
    );
    if ((await proc.exited) !== 0) {
      throw new Error(`Failed to inspect GitHub repository via 'gh repo view'`);
    }
    const data = JSON.parse(await new Response(proc.stdout).text());
    return {
      name: data.name,
      fullName: data.nameWithOwner,
      owner: data.owner?.login || this.context.owner,
      defaultBranch: data.defaultBranchRef?.name || "main",
      isPrivate: data.isPrivate,
      cloneUrl: data.url + ".git",
      sshUrl: data.sshUrl,
      webUrl: data.url,
    };
  }

  public async repoCreate(options: RepoCreateOptions): Promise<RepoDetails> {
    const args = ["gh", "repo", "create", options.name, options.isPrivate ? "--private" : "--public"];
    if (options.description) args.push("--description", options.description);
    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh repo create failed`);
    }
    return this.repoView();
  }

  public async repoClone(target: string, destination?: string): Promise<void> {
    const args = ["gh", "repo", "clone", target];
    if (destination) args.push(destination);
    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh repo clone failed`);
    }
  }

  public async prList(options?: PrListOptions): Promise<PullRequest[]> {
    const args = ["gh", "pr", "list", "--json", "number,title,state,author,headRefName,baseRefName,url,updatedAt"];
    if (options?.state) args.push("--state", options.state);
    if (options?.limit) args.push("--limit", options.limit.toString());

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh pr list failed`);
    }
    const list = JSON.parse(await new Response(proc.stdout).text());
    return list.map((item: any) => ({
      number: item.number,
      title: item.title,
      state: item.state?.toLowerCase() === "merged" ? "merged" : item.state?.toLowerCase() === "closed" ? "closed" : "open",
      author: item.author?.login || "unknown",
      sourceBranch: item.headRefName,
      targetBranch: item.baseRefName,
      url: item.url,
      updatedAt: item.updatedAt,
    }));
  }

  public async prView(prNumber: number): Promise<PullRequest> {
    const proc = Bun.spawn(
      ["gh", "pr", "view", prNumber.toString(), "--json", "number,title,state,author,headRefName,baseRefName,url"],
      { stdout: "pipe", stderr: "pipe" }
    );
    if ((await proc.exited) !== 0) {
      throw new Error(`gh pr view ${prNumber} failed`);
    }
    const item = JSON.parse(await new Response(proc.stdout).text());
    return {
      number: item.number,
      title: item.title,
      state: item.state?.toLowerCase() === "merged" ? "merged" : item.state?.toLowerCase() === "closed" ? "closed" : "open",
      author: item.author?.login || "unknown",
      sourceBranch: item.headRefName,
      targetBranch: item.baseRefName,
      url: item.url,
    };
  }

  public async prCreate(options: PrCreateOptions): Promise<PullRequest> {
    const args = ["gh", "pr", "create", "--title", options.title];
    if (options.body) args.push("--body", options.body);
    if (options.base) args.push("--base", options.base);
    if (options.head) args.push("--head", options.head);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh pr create failed`);
    }
    const list = await this.prList({ limit: 1 });
    return list[0];
  }

  public async prCheckout(prNumber: number): Promise<void> {
    const proc = Bun.spawn(["gh", "pr", "checkout", prNumber.toString()], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh pr checkout ${prNumber} failed`);
    }
  }

  public async prMerge(prNumber: number, options?: PrMergeOptions): Promise<void> {
    const args = ["gh", "pr", "merge", prNumber.toString()];
    if (options?.method === "squash") args.push("--squash");
    else if (options?.method === "rebase") args.push("--rebase");
    else args.push("--merge");

    if (options?.deleteBranch) args.push("--delete-branch");

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh pr merge ${prNumber} failed`);
    }
  }

  public async releaseCreate(options: ReleaseCreateOptions): Promise<void> {
    const args = ["gh", "release", "create", options.tag];
    if (options.title) args.push("--title", options.title);
    if (options.notes) args.push("--notes", options.notes);
    if (options.draft) args.push("--draft");
    if (options.prerelease) args.push("--prerelease");

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`gh release create ${options.tag} failed`);
    }
  }

  public async passthrough(args: string[]): Promise<number> {
    const proc = Bun.spawn(["gh", ...args], { stdio: ["inherit", "inherit", "inherit"] });
    return proc.exited;
  }
}
