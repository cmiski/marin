import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync
} from 'class-validator';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const productAutocompleteRequestSchema = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(10).default(8),
  brandSlug: z.string().trim().min(1).optional(),
  categorySlug: z.string().trim().min(1).optional(),
  inStock: z.boolean().optional()
});

export type ProductAutocompleteRequest = z.infer<
  typeof productAutocompleteRequestSchema
>;

class ProductAutocompleteRequestDto {
  @IsString()
  public query!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  public limit!: number;

  @IsOptional()
  @IsString()
  public brandSlug?: string;

  @IsOptional()
  @IsString()
  public categorySlug?: string;

  @IsOptional()
  @IsBoolean()
  public inStock?: boolean;
}

export function parseProductAutocompleteRequest(
  payload: unknown
): ProductAutocompleteRequest {
  const parsed = productAutocompleteRequestSchema.parse(payload);
  const dto = plainToInstance(ProductAutocompleteRequestDto, parsed);
  const validationErrors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true
  });

  if (validationErrors.length > 0) {
    throw new AppError(
      'Autocomplete request validation failed',
      400,
      'INVALID_AUTOCOMPLETE_REQUEST'
    );
  }

  return parsed;
}
