// src/types.ts
/**
 * Tycho Forge - Multi-Forge Domain Types & Interfaces
 * @license AGPL-3.0-only
 */

export type ForgeType = "forgejo" | "github" | "gitlab" | "bitbucket" | "unknown";

export interface ForgeContext {
  forgeType: ForgeType;
  host: string;
  owner: string;
  repo: string;
  remoteName: string;
  remoteUrl: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  author: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  updatedAt?: string;
}

export interface RepoDetails {
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  cloneUrl: string;
  sshUrl: string;
  webUrl: string;
  description?: string;
}

export interface AuthStatus {
  loggedIn: boolean;
  user?: string;
  host: string;
  tokenType?: string;
  scopes?: string[];
  error?: string;
}

export interface PrListOptions {
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface PrCreateOptions {
  title: string;
  body?: string;
  head?: string;
  base?: string;
}

export interface PrMergeOptions {
  method?: "merge" | "rebase" | "squash";
  deleteBranch?: boolean;
}

export interface RepoCreateOptions {
  name: string;
  isPrivate?: boolean;
  description?: string;
  org?: string;
}

export interface ReleaseCreateOptions {
  tag: string;
  title?: string;
  notes?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  milestone?: string;
  url: string;
}

export interface IssueListOptions {
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface IssueCreateOptions {
  title: string;
  body?: string;
  labelIds?: number[];
  milestoneId?: number;
}

export interface Milestone {
  id: number;
  title: string;
}

export interface Label {
  id: number;
  name: string;
  color: string;
}
