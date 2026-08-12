/**
 * Typed interfaces for the GitHub webhook payloads this app handles.
 * These cover the subset of fields we actually read — GitHub sends many more.
 */

// ─── Shared building blocks ────────────────────────────────────────────────

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: GithubUser;
  html_url: string;
  default_branch: string;
}

export interface GithubBranch {
  ref: string;
  sha: string;
  repo: GithubRepo;
}

export interface GithubInstallation {
  id: number;
  node_id: string;
}

// ─── Pull-request event ────────────────────────────────────────────────────

export interface GithubPullRequest {
  id: number;               // GitHub's internal PR id (used as githubPrId)
  number: number;           // PR number shown in the UI (used as githubPrNumber)
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  html_url: string;
  user: GithubUser;
  head: GithubBranch;
  base: GithubBranch;
  body: string | null;
  draft: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

/** The actions that should trigger a code review */
export type PullRequestTriggerAction =
  | 'opened'
  | 'synchronize'
  | 'reopened';

export interface PullRequestWebhookPayload {
  action: string;
  number: number;
  pull_request: GithubPullRequest;
  repository: GithubRepo;
  sender: GithubUser;
  installation?: GithubInstallation;
}

// ─── Files returned by GET /repos/{owner}/{repo}/pulls/{number}/files ──────

export interface GithubPrFile {
  sha: string;
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
}

// ─── Installation event ────────────────────────────────────────────────────

export interface InstallationWebhookPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend' | 'new_permissions_accepted';
  installation: {
    id: number;
    account: GithubUser;
    repository_selection: 'all' | 'selected';
    html_url: string;
    created_at: string;
    updated_at: string;
  };
  /** Repositories accessible at the time of installation (action: created) */
  repositories?: Array<{
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender: GithubUser;
}

// ─── Installation-repositories event ──────────────────────────────────────

export interface InstallationRepositoriesWebhookPayload {
  action: 'added' | 'removed';
  installation: {
    id: number;
    account: GithubUser;
  };
  repositories_added: Array<{
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed: Array<{
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender: GithubUser;
}

// ─── Generic wrapper (before we know the event type) ──────────────────────

export interface RawWebhookHeaders {
  'x-github-event': string;
  'x-github-delivery': string;
  'x-hub-signature-256': string;
  [key: string]: string;
}
