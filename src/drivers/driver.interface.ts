// src/drivers/driver.interface.ts
/**
 * Tycho Forge - GitForgeDriver Port (Hexagonal Architecture)
 * @license AGPL-3.0-only
 */

import type {
  AuthStatus,
  ForgeContext,
  ForgeType,
  Issue,
  IssueCreateOptions,
  IssueListOptions,
  Label,
  Milestone,
  PrCreateOptions,
  PrListOptions,
  PrMergeOptions,
  PullRequest,
  ReleaseCreateOptions,
  RepoCreateOptions,
  RepoDetails,
} from "../types.ts";

export interface GitForgeDriver {
  readonly forgeType: ForgeType;
  readonly context: ForgeContext;

  // Driver capabilities & health
  isCliAvailable(): Promise<boolean>;
  getCliInstallHint(): string;

  // Authentication
  authStatus(): Promise<AuthStatus>;
  whoami(): Promise<string>;

  // Repository Operations
  repoView(): Promise<RepoDetails>;
  repoCreate(options: RepoCreateOptions): Promise<RepoDetails>;
  repoClone(target: string, destination?: string): Promise<void>;

  // Pull Request Operations
  prList(options?: PrListOptions): Promise<PullRequest[]>;
  prView(prNumber: number): Promise<PullRequest>;
  prCreate(options: PrCreateOptions): Promise<PullRequest>;
  prCheckout(prNumber: number): Promise<void>;
  prMerge(prNumber: number, options?: PrMergeOptions): Promise<void>;

  // Release Operations
  releaseCreate(options: ReleaseCreateOptions): Promise<void>;

  // Issue tracking (optional: not every driver implements it yet)
  issueList?(options?: IssueListOptions): Promise<Issue[]>;
  issueCreate?(options: IssueCreateOptions): Promise<Issue>;
  milestoneList?(): Promise<Milestone[]>;
  milestoneCreate?(title: string, description?: string): Promise<Milestone>;
  labelList?(): Promise<Label[]>;
  labelCreate?(name: string, color: string): Promise<Label>;

  // Passthrough escape hatch for native CLI power users
  passthrough(args: string[]): Promise<number>;
}
