// src/drivers/gitlab.driver.ts
/**
 * Tycho Forge - GitLab Adapter (delegates to glab CLI & API)
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

export class GitLabDriver implements GitForgeDriver {
  public readonly forgeType: ForgeType = "gitlab";

  constructor(public readonly context: ForgeContext) {}

  public async isCliAvailable(): Promise<boolean> {
    return !!Bun.which("glab");
  }

  public getCliInstallHint(): string {
    return "GitLab CLI (glab) required: brew install glab (macOS) or sudo apt install glab (Linux)";
  }

  public async authStatus(): Promise<AuthStatus> {
    if (!(await this.isCliAvailable())) {
      return { loggedIn: false, host: this.context.host || "gitlab.com", error: this.getCliInstallHint() };
    }
    try {
      const proc = Bun.spawn(["glab", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
      const out = await new Response(proc.stdout).text();
      const err = await new Response(proc.stderr).text();
      const full = out + err;
      const loggedIn = (await proc.exited) === 0 || full.includes("Logged in to");
      const userMatch = full.match(/Logged in to [^ ]+ as ([^ \n(]+)/);
      return {
        loggedIn,
        user: userMatch ? userMatch[1] : undefined,
        host: this.context.host || "gitlab.com",
      };
    } catch (e: any) {
      return { loggedIn: false, host: this.context.host || "gitlab.com", error: e.message };
    }
  }

  public async whoami(): Promise<string> {
    const status = await this.authStatus();
    return status.user || "unauthenticated";
  }

  public async repoView(): Promise<RepoDetails> {
    const proc = Bun.spawn(["glab", "repo", "view", "--output", "json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab repo view failed`);
    }
    const data = JSON.parse(await new Response(proc.stdout).text());
    return {
      name: data.name,
      fullName: data.path_with_namespace,
      owner: data.namespace?.name || this.context.owner,
      defaultBranch: data.default_branch || "main",
      isPrivate: data.visibility === "private",
      cloneUrl: data.http_url_to_repo,
      sshUrl: data.ssh_url_to_repo,
      webUrl: data.web_url,
      description: data.description,
    };
  }

  public async repoCreate(options: RepoCreateOptions): Promise<RepoDetails> {
    const args = ["glab", "repo", "create", options.name];
    if (options.isPrivate) args.push("--private");
    else args.push("--public");
    if (options.description) args.push("--description", options.description);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab repo create failed`);
    }
    return this.repoView();
  }

  public async repoClone(target: string, destination?: string): Promise<void> {
    const args = ["glab", "repo", "clone", target];
    if (destination) args.push(destination);
    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab repo clone failed`);
    }
  }

  public async prList(options?: PrListOptions): Promise<PullRequest[]> {
    // In GitLab, PRs are Merge Requests (MR)
    const args = ["glab", "mr", "list", "--output", "json"];
    if (options?.state) args.push("--state", options.state);
    if (options?.limit) args.push("--per-page", options.limit.toString());

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab mr list failed`);
    }
    const list = JSON.parse(await new Response(proc.stdout).text());
    return list.map((item: any) => ({
      number: item.iid,
      title: item.title,
      state: item.state === "merged" ? "merged" : item.state === "closed" ? "closed" : "open",
      author: item.author?.username || "unknown",
      sourceBranch: item.source_branch,
      targetBranch: item.target_branch,
      url: item.web_url,
      updatedAt: item.updated_at,
    }));
  }

  public async prView(prNumber: number): Promise<PullRequest> {
    const proc = Bun.spawn(["glab", "mr", "view", prNumber.toString(), "--output", "json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab mr view ${prNumber} failed`);
    }
    const item = JSON.parse(await new Response(proc.stdout).text());
    return {
      number: item.iid,
      title: item.title,
      state: item.state === "merged" ? "merged" : item.state === "closed" ? "closed" : "open",
      author: item.author?.username || "unknown",
      sourceBranch: item.source_branch,
      targetBranch: item.target_branch,
      url: item.web_url,
    };
  }

  public async prCreate(options: PrCreateOptions): Promise<PullRequest> {
    const args = ["glab", "mr", "create", "--title", options.title];
    if (options.body) args.push("--description", options.body);
    if (options.base) args.push("--target-branch", options.base);
    if (options.head) args.push("--source-branch", options.head);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab mr create failed`);
    }
    const list = await this.prList({ limit: 1 });
    return list[0];
  }

  public async prCheckout(prNumber: number): Promise<void> {
    const proc = Bun.spawn(["glab", "mr", "checkout", prNumber.toString()], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab mr checkout ${prNumber} failed`);
    }
  }

  public async prMerge(prNumber: number, options?: PrMergeOptions): Promise<void> {
    const args = ["glab", "mr", "merge", prNumber.toString(), "--yes"];
    if (options?.method === "squash") args.push("--squash");
    if (options?.deleteBranch) args.push("--delete-source-branch");

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab mr merge ${prNumber} failed`);
    }
  }

  public async releaseCreate(options: ReleaseCreateOptions): Promise<void> {
    const args = ["glab", "release", "create", options.tag];
    if (options.title) args.push("--name", options.title);
    if (options.notes) args.push("--notes", options.notes);

    const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      throw new Error(`glab release create ${options.tag} failed`);
    }
  }

  public async passthrough(args: string[]): Promise<number> {
    const proc = Bun.spawn(["glab", ...args], { stdio: ["inherit", "inherit", "inherit"] });
    return proc.exited;
  }
}
