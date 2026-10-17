import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import type { FieldError } from '../http/problem-details.filter.js';

/**
 * Validates and parses input with a zod schema, returning the typed result.
 * Unknown properties are stripped by the schema, so handlers only ever see
 * fields they declared.
 *
 *   @Post() create(@Body(new ZodValidationPipe(createSchema)) input: CreateInput)
 */
export class ZodValidationPipe<
  TSchema extends z.ZodType,
> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const errors: FieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are missing or invalid.',
      errors,
    });
  }
}
