import { Controller, Get } from '@nestjs/common';
import { FRAMEWORK_TEMPLATES } from '../../domain/strategy/framework.js';
import type { FrameworkTemplate } from '../../generated/prisma/enums.js';
import type { FrameworkTemplateView } from '@sims/contracts';

/** Starting frameworks offered on the "How is your strategy structured?" step. */
@Controller('framework-templates')
export class FrameworkTemplatesController {
  @Get()
  list(): FrameworkTemplateView[] {
    return Object.entries(FRAMEWORK_TEMPLATES).map(([key, template]) => ({
      key: key as FrameworkTemplate,
      ...template,
    }));
  }
}
