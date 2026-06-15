import type { ProductIndexingRecord } from './product-source.js';

export type ProductSearchDocument = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  searchableText: string;
  status: string;
  priceCents: number;
  currency: string;
  inventoryCount: number;
  inStock: boolean;
  ratingAverage: number;
  ratingCount: number;
  brand: {
    id: string;
    name: string;
    slug: string;
  } | null;
  category: {
    id: string;
    name: string;
    slug: string;
    path: string[];
  } | null;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    title: string;
    priceCents: number;
    inventoryCount: number;
    attributes: Record<string, unknown>;
  }>;
  attributes: Record<string, unknown>;
  embedding: number[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function categoryPath(product: ProductIndexingRecord): string[] {
  const category = product.category;

  if (category === null) {
    return [];
  }

  const path: string[] = [];
  const parent = category.parent;
  const grandparent = parent?.parent;

  if (grandparent != null) {
    path.push(grandparent.slug);
  }

  if (parent != null) {
    path.push(parent.slug);
  }

  path.push(category.slug);

  return path;
}

export function toProductSearchDocument(
  product: ProductIndexingRecord
): ProductSearchDocument {
  const searchableParts = [
    product.title,
    product.subtitle,
    product.description,
    product.brand?.name,
    product.category?.name,
    ...product.tags.map(({ tag }) => tag.name),
    ...product.variants.map((variant) => variant.title)
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    searchableText: product.searchableText ?? searchableParts.join(' '),
    status: product.status,
    priceCents: product.priceCents,
    currency: product.currency,
    inventoryCount: product.inventoryCount,
    inStock: product.inventoryCount > 0,
    ratingAverage: product.ratingAverage.toNumber(),
    ratingCount: product.ratingCount,
    brand:
      product.brand === null
        ? null
        : {
            id: product.brand.id,
            name: product.brand.name,
            slug: product.brand.slug
          },
    category:
      product.category === null
        ? null
        : {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
            path: categoryPath(product)
          },
    tags: product.tags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      priceCents: variant.priceCents,
      inventoryCount: variant.inventoryCount,
      attributes: toPlainObject(variant.attributes)
    })),
    attributes: toPlainObject(product.attributes),
    embedding: product.embedding,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}
