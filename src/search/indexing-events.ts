import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  validateSync
} from 'class-validator';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const operations = ['UPSERT', 'DELETE'] as const;
const aggregateTypes = ['product'] as const;

const indexingEventSchema = z.object({
  aggregateType: z.enum(aggregateTypes),
  aggregateId: z.string().uuid(),
  operation: z.enum(operations),
  reason: z.string().trim().min(1).max(200).optional()
});

const indexingWebhookSchema = z.object({
  events: z.array(indexingEventSchema).min(1).max(100)
});

export type IndexingEvent = z.infer<typeof indexingEventSchema>;

class IndexingEventDto {
  @IsIn(aggregateTypes)
  public aggregateType!: 'product';

  @IsUUID()
  public aggregateId!: string;

  @IsIn(operations)
  public operation!: (typeof operations)[number];

  @IsOptional()
  @IsString()
  public reason?: string;
}

class IndexingWebhookDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IndexingEventDto)
  public events!: IndexingEventDto[];
}

export function parseIndexingWebhookPayload(payload: unknown): IndexingEvent[] {
  const parsed = indexingWebhookSchema.parse(payload);
  const dto = plainToInstance(IndexingWebhookDto, parsed);
  const validationErrors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true
  });

  if (validationErrors.length > 0) {
    throw new AppError('Indexing event payload validation failed', 400, 'INVALID_INDEX_EVENT');
  }

  return parsed.events;
}
