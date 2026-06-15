import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  validateSync
} from 'class-validator';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const sortOptions = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'rating_desc'
] as const;

const facetOptions = [
  'brands',
  'categories',
  'tags',
  'priceRanges',
  'availability'
] as const;

const attributeFiltersSchema = z
  .record(
    z.string().min(1),
    z.array(z.string().trim().min(1)).min(1).max(20)
  )
  .default({});

const productSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  sort: z.enum(sortOptions).default('relevance'),
  filters: z
    .object({
      brandSlugs: z.array(z.string().trim().min(1)).max(25).default([]),
      categorySlugs: z.array(z.string().trim().min(1)).max(25).default([]),
      tagSlugs: z.array(z.string().trim().min(1)).max(25).default([]),
      inStock: z.boolean().optional(),
      minPriceCents: z.number().int().min(0).optional(),
      maxPriceCents: z.number().int().min(0).optional(),
      minRating: z.number().min(0).max(5).optional(),
      attributes: attributeFiltersSchema
    })
    .default({}),
  facets: z
    .array(z.enum(facetOptions))
    .max(facetOptions.length)
    .default([...facetOptions])
});

export type ProductSearchRequest = z.infer<typeof productSearchRequestSchema>;

class ProductSearchFiltersDto {
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  public brandSlugs: string[] = [];

  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  public categorySlugs: string[] = [];

  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  public tagSlugs: string[] = [];

  @IsOptional()
  @IsBoolean()
  public inStock?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  public minPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public maxPriceCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  public minRating?: number;

  @IsObject()
  public attributes: Record<string, string[]> = {};
}

class ProductSearchRequestDto {
  @IsOptional()
  @IsString()
  public query?: string;

  @IsInt()
  @Min(1)
  public page!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  public pageSize!: number;

  @IsIn(sortOptions)
  public sort!: (typeof sortOptions)[number];

  @ValidateNested()
  @Type(() => ProductSearchFiltersDto)
  public filters!: ProductSearchFiltersDto;

  @IsArray()
  @ArrayMaxSize(facetOptions.length)
  @IsIn(facetOptions, { each: true })
  public facets!: Array<(typeof facetOptions)[number]>;
}

export function parseProductSearchRequest(payload: unknown): ProductSearchRequest {
  const parsed = productSearchRequestSchema.parse(payload);

  if (
    parsed.filters.minPriceCents !== undefined &&
    parsed.filters.maxPriceCents !== undefined &&
    parsed.filters.minPriceCents > parsed.filters.maxPriceCents
  ) {
    throw new AppError(
      'Minimum price cannot be greater than maximum price',
      400,
      'INVALID_SEARCH_FILTER'
    );
  }

  const dto = plainToInstance(ProductSearchRequestDto, parsed);
  const validationErrors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true
  });

  if (validationErrors.length > 0) {
    throw new AppError('Search request validation failed', 400, 'INVALID_SEARCH_REQUEST');
  }

  return {
    ...parsed,
    filters: {
      brandSlugs: dedupe(parsed.filters.brandSlugs),
      categorySlugs: dedupe(parsed.filters.categorySlugs),
      tagSlugs: dedupe(parsed.filters.tagSlugs),
      inStock: parsed.filters.inStock,
      minPriceCents: parsed.filters.minPriceCents,
      maxPriceCents: parsed.filters.maxPriceCents,
      minRating: parsed.filters.minRating,
      attributes: normalizeAttributes(parsed.filters.attributes)
    },
    facets: dedupe(parsed.facets)
  };
}

function dedupe<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeAttributes(
  attributes: Record<string, string[]>
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, values]) => [key, dedupe(values)] satisfies [string, string[]])
      .filter(([, values]) => values.length > 0)
  );
}
