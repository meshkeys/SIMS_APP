import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { customFieldKey } from '../../domain/onboarding/onboarding-rules.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import type { CreateCustomFieldInput, CustomFieldView } from '@sims/contracts';

type FieldRow = Omit<CustomFieldView, 'options'> & { options: unknown };

const toView = (row: FieldRow): CustomFieldView => ({
  id: row.id,
  entity: row.entity,
  key: row.key,
  label: row.label,
  type: row.type,
  options: Array.isArray(row.options) ? (row.options as string[]) : null,
  required: row.required,
  sortOrder: row.sortOrder,
});

/**
 * Extra fields an organisation adds to its records ("Budget code" on
 * initiatives). Definitions only: values live on each record.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<CustomFieldView[]> {
    const rows = await this.db.client.customFieldDefinition.findMany({
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(input: CreateCustomFieldInput): Promise<CustomFieldView> {
    const id = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        const last = await tx.customFieldDefinition.findFirst({
          where: { entity: input.entity },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        await tx.customFieldDefinition.create({
          data: {
            id,
            organisationId: TenantContext.require().organisationId,
            entity: input.entity,
            key: customFieldKey(input.label),
            label: input.label,
            type: input.type,
            options: input.options ?? undefined,
            required: input.required,
            sortOrder: (last?.sortOrder ?? -1) + 1,
          },
        });
        await recordAudit(tx, {
          action: 'CUSTOM_FIELD_CREATED',
          entityType: 'CustomFieldDefinition',
          entityId: id,
          after: input,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'key')) {
        throw new ConflictException({
          code: 'FIELD_EXISTS',
          message: `There is already a field called ${input.label}.`,
        });
      }
      throw error;
    }
    const row = await this.db.client.customFieldDefinition.findUniqueOrThrow({
      where: { id },
    });
    return toView(row);
  }

  async remove(fieldId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await tx.customFieldDefinition.findUnique({
        where: { id: fieldId },
      });
      if (!row) {
        throw new NotFoundException({
          code: 'FIELD_NOT_FOUND',
          message: 'Field not found.',
        });
      }
      await tx.customFieldDefinition.delete({ where: { id: fieldId } });
      await recordAudit(tx, {
        action: 'CUSTOM_FIELD_DELETED',
        entityType: 'CustomFieldDefinition',
        entityId: fieldId,
        before: { label: row.label, entity: row.entity, type: row.type },
      });
    });
  }
}
