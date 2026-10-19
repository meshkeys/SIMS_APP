import { Controller, Get, Query } from '@nestjs/common';
import {
  type Department,
  type MemberPage,
  type MemberQuery,
  memberQuerySchema,
} from '@sims/contracts';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { PeopleService } from './people.service.js';

/** The people directory and departments (for pickers and filters). */
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('members')
  members(
    @Query(new ZodValidationPipe(memberQuerySchema)) query: MemberQuery,
  ): Promise<MemberPage> {
    return this.people.members(query);
  }

  @Get('departments')
  departments(): Promise<Department[]> {
    return this.people.departments();
  }
}
