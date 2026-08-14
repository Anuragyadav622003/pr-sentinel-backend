import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── GitHub OAuth ──────────────────────────────────────────────────────────

  /**
   * GET /api/auth/github
   * Entry point for GitHub OAuth login.  Generates a secure random state
   * (stored in Redis), builds the GitHub authorize URL, and redirects.
   */
  @Get('github')
  async githubLogin(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const state = await this.authService.createOAuthState(redirect);
    const authorizeUrl = this.authService.getGithubAuthorizeUrl(state);
    res.redirect(authorizeUrl);
  }

  /**
   * GET /api/auth/github/callback
   * GitHub redirects here after the user authorises the OAuth app.
   * Validates state, exchanges the code, upserts the user, sets the JWT
   * cookie, then redirects to the frontend callback page.
   */
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !state) {
      res.redirect(this.buildFrontendErrorUrl('Missing OAuth parameters'));
      return;
    }

    try {
      const result = await this.authService.handleGithubCallback(code, state);
      this.setAccessTokenCookie(res, result.accessToken);

      const callbackUrl = new URL('/auth/callback', this.getFrontendUrl());
      if (result.redirect) {
        callbackUrl.searchParams.set('redirect', result.redirect);
      }
      res.redirect(callbackUrl.toString());
    } catch {
      res.redirect(this.buildFrontendErrorUrl('GitHub authentication failed'));
    }
  }

  // ─── Email / password ──────────────────────────────────────────────────────

  /**
   * POST /api/auth/register
   * Creates a new local account, sets the JWT cookie, returns the user.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerLocalUser(dto.email, dto.password);
    this.setAccessTokenCookie(res, result.accessToken);
    return { user: result.user };
  }

  /**
   * POST /api/auth/login
   * Signs in with email + password, sets the JWT cookie, returns the user.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginLocalUser(dto.email, dto.password);
    this.setAccessTokenCookie(res, result.accessToken);
    return { user: result.user };
  }

  // ─── Session ───────────────────────────────────────────────────────────────

  /**
   * GET /api/auth/me
   * Returns the currently authenticated user (from the JWT cookie).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: Request & { user: AuthenticatedUser }) {
    return req.user;
  }

  /**
   * POST /api/auth/logout
   * Clears the access-token cookie and returns 200.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('accessToken', this.getClearCookieOptions());
    return { message: 'Logged out successfully' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Vercel frontend + Render backend requires SameSite=None cookies. */
  private usesCrossSiteCookies(): boolean {
    const frontend = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
    if (!frontend) return false;
    try {
      const url = new URL(frontend);
      return url.protocol === 'https:' && !url.hostname.includes('localhost');
    } catch {
      return false;
    }
  }

  private getCookieOptions() {
    const crossSite = this.usesCrossSiteCookies();
    return {
      httpOnly: true,
      secure: crossSite,
      sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    };
  }

  /** clearCookie must match set options but omit maxAge. */
  private getClearCookieOptions() {
    const { maxAge: _maxAge, ...options } = this.getCookieOptions();
    return options;
  }

  private setAccessTokenCookie(res: Response, accessToken: string): void {
    res.cookie('accessToken', accessToken, this.getCookieOptions());
  }

  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL ?? 'http://localhost:3001';
  }

  private buildFrontendErrorUrl(message: string): string {
    const url = new URL('/auth/callback', this.getFrontendUrl());
    url.searchParams.set('error', message);
    return url.toString();
  }
}
