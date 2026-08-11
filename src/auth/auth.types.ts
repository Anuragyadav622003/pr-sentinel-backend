export interface GithubOAuthTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GithubUserProfile {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}

export interface JwtPayload {
  sub: string;
  githubId?: string;
  githubLogin?: string;
}

export interface AuthenticatedUser {
  id: string;
  githubId?: string;
  githubLogin?: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
