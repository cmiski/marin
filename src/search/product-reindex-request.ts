import { plainToInstance } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, validateSync } from 'class-validator';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const reindexModes = ['full', 'incremental'] as const;

const productReindexRequestSchema = z.object({
  mode: z.enum(reindexModes).default('full'),
  updatedSince: z.string().datetime().optional()
});

export type ProductReindexRequest = z.infer<typeof productReindexRequestSchema>;

class ProductReindexRequestDto {
  @IsIn(reindexModes)
  public mode!: (typeof reindexModes)[number];

  @IsOptional()
  @IsDateString()
  public updatedSince?: string;
}

export function parseProductReindexRequest(payload: unknown): ProductReindexRequest {
  const parsed = productReindexRequestSchema.parse(payload ?? {});
  const dto = plainToInstance(ProductReindexRequestDto, parsed);
  const validationErrors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true
  });

  if (validationErrors.length > 0) {
    throw new AppError('Reindex request validation failed', 400, 'INVALID_REINDEX_REQUEST');
  }

  if (parsed.mode === 'incremental' && parsed.updatedSince === undefined) {
    throw new AppError(
      'updatedSince is required for incremental reindexing',
      400,
      'INVALID_REINDEX_REQUEST'
    );
  }

  return parsed;
}
