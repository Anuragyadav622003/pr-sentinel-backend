import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { hash, compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthStateService } from './oauth-state.service';
import type {
  AuthenticatedUser,
  GithubOAuthTokenResponse,
  GithubUserProfile,
  JwtPayload,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly oauthState: OAuthStateService,
  ) {}

  // ─── OAuth state ──────────────────────────────────────────────────────────

  getGithubAuthorizeUrl(state: string): string {
    const clientId = this.getRequiredConfig('GITHUB_OAUTH_CLIENT_ID');
    const callbackUrl = this.getRequiredConfig('GITHUB_OAUTH_CALLBACK_URL');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** Create a random OAuth state stored in Redis.  Returns the token. */
  async createOAuthState(redirect?: string): Promise<string> {
    return this.oauthState.create(redirect);
  }

  // ─── OAuth callback ───────────────────────────────────────────────────────

  async handleGithubCallback(
    code: string,
    state: string,
  ): Promise<{ accessToken: string; user: AuthenticatedUser; redirect?: string }> {
    // Consume the state — throws if missing/expired.
    const statePayload = await this.oauthState.consume(state);
    if (!statePayload) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const githubAccessToken = await this.exchangeCodeForToken(code);
    const githubProfile = await this.fetchGithubProfile(githubAccessToken);
    const user = await this.upsertGithubUser(githubProfile);
    const accessToken = await this.createAccessToken(user);

    return {
      accessToken,
      user,
      redirect: statePayload.redirect,
    };
  }

  // ─── Email / password ─────────────────────────────────────────────────────

  async registerLocalUser(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await this.hashPassword(password);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword },
    });

    const authenticatedUser = this.toAuthenticatedUser(user);
    return {
      accessToken: await this.createAccessToken(authenticatedUser),
      user: authenticatedUser,
    };
  }

  async loginLocalUser(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.comparePassword(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    return {
      accessToken: await this.createAccessToken(authenticatedUser),
      user: authenticatedUser,
    };
  }

  async validateUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? this.toAuthenticatedUser(user) : null;
  }

  // ─── Token helpers ────────────────────────────────────────────────────────

  async createAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      githubId: user.githubId,
      githubLogin: user.githubLogin,
    };
    return this.jwtService.signAsync(payload);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async exchangeCodeForToken(code: string): Promise<string> {
    const clientId = this.getRequiredConfig('GITHUB_OAUTH_CLIENT_ID');
    const clientSecret = this.getRequiredConfig('GITHUB_OAUTH_CLIENT_SECRET');
    const redirectUri = this.getRequiredConfig('GITHUB_OAUTH_CALLBACK_URL');

    try {
      const response = await axios.post<GithubOAuthTokenResponse>(
        'https://github.com/login/oauth/access_token',
        { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
        { headers: { Accept: 'application/json' } },
      );

      if (!response.data.access_token) {
        throw new UnauthorizedException('GitHub did not return an access token');
      }

      return response.data.access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new UnauthorizedException('Failed to exchange GitHub OAuth code');
      }
      throw error;
    }
  }

  private async fetchGithubProfile(accessToken: string): Promise<GithubUserProfile> {
    try {
      const response = await axios.get<GithubUserProfile>(
        'https://api.github.com/user',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );
      return response.data;
    } catch {
      throw new UnauthorizedException('Failed to fetch GitHub user profile');
    }
  }

  private async upsertGithubUser(
    profile: GithubUserProfile,
  ): Promise<AuthenticatedUser> {
    const githubId = String(profile.id);
    const user = await this.prisma.user.upsert({
      where: { githubId },
      create: {
        githubId,
        githubLogin: profile.login,
        email: profile.email,
        avatarUrl: profile.avatar_url,
      },
      update: {
        githubLogin: profile.login,
        email: profile.email,
        avatarUrl: profile.avatar_url,
      },
    });
    return this.toAuthenticatedUser(user);
  }

  private async hashPassword(password: string): Promise<string> {
    return hash(password, 12);
  }

  private async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return compare(password, hashedPassword);
  }

  private toAuthenticatedUser(user: {
    id: string;
    githubId?: string | null;
    githubLogin?: string | null;
    email: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AuthenticatedUser {
    return {
      id: user.id,
      githubId: user.githubId ?? undefined,
      githubLogin: user.githubLogin ?? undefined,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }
    return value;
  }
}
