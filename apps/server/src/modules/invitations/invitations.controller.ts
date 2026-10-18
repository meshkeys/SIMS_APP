import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StrictRateLimit } from '../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { INVITER_ROLES } from '../../domain/roles/roles.js';
import {
  type AuthContext,
  clientMeta,
  CurrentAuth,
  Public,
  Roles,
  sendSession,
} from '../auth/index.js';
import { InvitationsService } from './invitations.service.js';
import {
  type AcceptInvitationInput,
  acceptInvitationSchema,
  type CreateInvitationInput,
  createInvitationSchema,
  idSchema,
  type InvitationPreview,
  type InvitationTokenInput,
  invitationTokenSchema,
  type InvitationView,
  type SentInvitation,
  type SessionResponse,
} from '@sims/contracts';

const idPipe = new ZodValidationPipe(idSchema);

@Controller('invitations')
export class InvitationsController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly invitations: InvitationsService,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookies = env.COOKIE_SECURE;
  }

  /** Invite someone by email. Re-inviting an address replaces its pending invitation. */
  @Roles(...INVITER_ROLES)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  invite(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(createInvitationSchema))
    input: CreateInvitationInput,
  ): Promise<SentInvitation> {
    return this.invitations.invite(caller, input);
  }

  /** Recent invitations (newest first) with their status. */
  @Roles(...INVITER_ROLES)
  @Get()
  list(): Promise<InvitationView[]> {
    return this.invitations.list();
  }

  @Roles(...INVITER_ROLES)
  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  resend(
    @CurrentAuth() caller: AuthContext,
    @Param('id', idPipe) id: string,
  ): Promise<SentInvitation> {
    return this.invitations.resend(caller, id);
  }

  @Roles(...INVITER_ROLES)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentAuth() caller: AuthContext,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    return this.invitations.revoke(caller, id);
  }

  /** Public: what the accept page shows (organisation, roles, whether to ask for a new password). */
  @Public()
  @StrictRateLimit()
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(invitationTokenSchema))
    input: InvitationTokenInput,
  ): Promise<InvitationPreview> {
    return this.invitations.preview(input.token);
  }

  /** Public: accept, join the organisation and sign in. */
  @Public()
  @StrictRateLimit()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    input: AcceptInvitationInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.invitations.accept(input, clientMeta(req));
    return sendSession(res, session, this.secureCookies);
  }
}
