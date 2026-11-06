/**
 * Subset of the Bitbucket Cloud REST API (2.0) objects read by the Bitbucket driver.
 * @license AGPL-3.0-only
 */

/** Link object (`links.html.href`). */
export interface BitbucketLinks {
  html: { href: string };
}

/** User. */
export interface BitbucketUser {
  username?: string;
  display_name?: string;
}

/** Repository. */
export interface BitbucketRepo {
  name: string;
  full_name: string;
  owner?: BitbucketUser;
  mainbranch?: { name: string };
  is_private: boolean;
  links: BitbucketLinks;
  description?: string;
}

/** Branch endpoint of a pull request. */
export interface BitbucketEndpoint {
  branch: { name: string };
}

/** Pull request. */
export interface BitbucketPull {
  id: number;
  title: string;
  state: string;
  author?: BitbucketUser;
  source: BitbucketEndpoint;
  destination: BitbucketEndpoint;
  links: BitbucketLinks;
  updated_on?: string;
}

/** Paginated response. */
export interface BitbucketPage<T> {
  values?: T[];
}
