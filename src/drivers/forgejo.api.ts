/**
 * Subset of the Forgejo / Gitea REST API objects read by the Forgejo driver.
 * @license AGPL-3.0-only
 */

/** User or organisation. */
export interface ForgejoUser {
  login?: string;
  username?: string;
}

/** Repository. */
export interface ForgejoRepo {
  name: string;
  full_name: string;
  owner?: ForgejoUser;
  default_branch?: string;
  private: boolean;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  description?: string;
}

/** Branch reference of a pull request. */
export interface ForgejoBranchRef {
  ref: string;
  label?: string;
}

/** Pull request. */
export interface ForgejoPull {
  number: number;
  title: string;
  state: string;
  merged?: boolean;
  user?: ForgejoUser;
  head: ForgejoBranchRef;
  base: ForgejoBranchRef;
  html_url: string;
  updated_at?: string;
}
