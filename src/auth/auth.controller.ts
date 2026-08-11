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

  @Get('github')
  githubLogin(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): void {
    const state = this.authService.createOAuthState(redirect);
    const authorizeUrl = this.authService.getGithubAuthorizeUrl(state);
    res.redirect(authorizeUrl);
  }

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
   * Body: { email, password }
   * Returns: { user: AuthenticatedUser }
   * (wrapped by ResponseFormatInterceptor → { success, data: { user }, ... })
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    
    const result = await this.authService.registerLocalUser(dto.email, dto.password);
    this.setAccessTokenCookie(res, result.accessToken);
    return { user: result.user };
  }

  /**
   * POST /api/auth/login
   * Body: { email, password }
   * Returns: { user: AuthenticatedUser }
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginLocalUser(dto.email, dto.password);
    this.setAccessTokenCookie(res, result.accessToken);
    return { user: result.user };
  }

  // ─── Session ───────────────────────────────────────────────────────────────

  /**
   * GET /api/auth/me
   * Returns the currently authenticated user from the JWT cookie.
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
    res.clearCookie('accessToken', { httpOnly: true, sameSite: 'lax' });
    return { message: 'Logged out successfully' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private setAccessTokenCookie(res: Response, accessToken: string) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    });
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
