import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StrictRateLimit } from '../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { AuthContext } from './auth-context.js';
import { AuthService } from './auth.service.js';
import { CurrentAuth, Public } from './decorators.js';
import { clearRefreshCookie, readRefreshCookie } from './refresh-cookie.js';
import { sendSession } from './session-response.js';
import { clientMeta } from './client-meta.js';
import {
  type LoginInput,
  loginSchema,
  type SessionResponse,
  type SessionView,
  type SignupInput,
  signupSchema,
  type SwitchOrganisationInput,
  switchOrganisationSchema,
} from '@sims/contracts';

const missingRefreshToken = () =>
  new UnauthorizedException({
    code: 'INVALID_REFRESH_TOKEN',
    message: 'Please sign in again.',
  });

@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookies = env.COOKIE_SECURE;
  }

  /** Create an account and a new organisation; signs the user in. */
  @Public()
  @StrictRateLimit()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) input: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return sendSession(
      res,
      await this.auth.signup(input, clientMeta(req)),
      this.secureCookies,
    );
  }

  @Public()
  @StrictRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return sendSession(
      res,
      await this.auth.login(input, clientMeta(req)),
      this.secureCookies,
    );
  }

  /** Exchanges the refresh cookie for a new access token (and a new cookie). */
  @Public()
  @StrictRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = readRefreshCookie(req);
    if (!token) throw missingRefreshToken();
    try {
      return sendSession(
        res,
        await this.auth.refresh(token, clientMeta(req)),
        this.secureCookies,
      );
    } catch (error) {
      clearRefreshCookie(res, this.secureCookies);
      throw error;
    }
  }

  /** Opens another workspace the user belongs to. */
  @Post('switch-organisation')
  @HttpCode(HttpStatus.OK)
  async switchOrganisation(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(switchOrganisationSchema))
    input: SwitchOrganisationInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = readRefreshCookie(req);
    if (!token) throw missingRefreshToken();
    return sendSession(
      res,
      await this.auth.switchOrganisation(
        caller,
        token,
        input.organisationId,
        clientMeta(req),
      ),
      this.secureCookies,
    );
  }

  /** Ends the session on this device and every device sharing the same sign-in. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res, this.secureCookies);
  }

  @Get('me')
  me(@CurrentAuth() caller: AuthContext): Promise<SessionView> {
    return this.auth.me(caller);
  }
}
