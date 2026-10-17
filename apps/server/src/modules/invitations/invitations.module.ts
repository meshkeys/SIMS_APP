import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { InvitationDirectory } from './invitation-directory.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationDirectory],
})
export class InvitationsModule {}
