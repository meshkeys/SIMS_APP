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
import {
  type LoginInput,
  loginSchema,
  type SignupInput,
  signupSchema,
  type SwitchOrganisationInput,
  switchOrganisationSchema,
} from './auth.schemas.js';
import {
  AuthService,
  type IssuedSession,
  type SessionView,
} from './auth.service.js';
import { CurrentAuth, Public } from './decorators.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import type { ClientMeta } from './tokens/refresh-token.service.js';

/** Body of every endpoint that starts or renews a session. */
export interface SessionResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  session: SessionView;
}

const clientMeta = (req: Request): ClientMeta => ({
  userAgent: req.header('user-agent'),
  ipAddress: req.ip,
});

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
    return this.respond(res, await this.auth.signup(input, clientMeta(req)));
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
    return this.respond(res, await this.auth.login(input, clientMeta(req)));
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
      return this.respond(res, await this.auth.refresh(token, clientMeta(req)));
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
    return this.respond(
      res,
      await this.auth.switchOrganisation(
        caller,
        token,
        input.organisationId,
        clientMeta(req),
      ),
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

  private respond(res: Response, session: IssuedSession): SessionResponse {
    setRefreshCookie(res, session.refreshToken, this.secureCookies);
    res.setHeader('Cache-Control', 'no-store');
    return {
      accessToken: session.accessToken.token,
      accessTokenExpiresAt: session.accessToken.expiresAt.toISOString(),
      session: session.view,
    };
  }
}
