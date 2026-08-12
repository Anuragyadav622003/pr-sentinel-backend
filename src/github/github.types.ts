/** Mirrors the frontend's GitHubInstallationStatus shape from lib/api/types.ts */
export interface GitHubInstallationStatus {
  connected: boolean;
  installation: {
    id: string;
    githubInstallationId: number;
    userId: string | null;
    accountLogin: string | null;
    accountAvatarUrl: string | null;
    /** True when GitHub has suspended the installation. */
    suspended: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  repositoryCount: number;
}
