import type { Prisma } from '@prisma/client';
import { prisma } from '../infra/prisma.js';

const productIndexingInclude = {
  brand: true,
  category: {
    include: {
      parent: {
        include: {
          parent: true
        }
      }
    }
  },
  tags: {
    include: {
      tag: true
    }
  },
  variants: true
} satisfies Prisma.ProductInclude;

export type ProductIndexingRecord = Prisma.ProductGetPayload<{
  include: typeof productIndexingInclude;
}>;

export async function findProductsForIndexing(
  productIds: string[]
): Promise<ProductIndexingRecord[]> {
  if (productIds.length === 0) {
    return [];
  }

  return prisma.product.findMany({
    where: {
      id: {
        in: productIds
      },
      deletedAt: null
    },
    include: productIndexingInclude
  });
}

export async function findProductIdsForReindex(options: {
  batchSize: number;
  afterId?: string;
  updatedSince?: Date;
}): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(options.updatedSince === undefined
        ? {}
        : {
            updatedAt: {
              gte: options.updatedSince
            }
          }),
      ...(options.afterId === undefined
        ? {}
        : {
            id: {
              gt: options.afterId
            }
          })
    },
    orderBy: {
      id: 'asc'
    },
    take: options.batchSize,
    select: {
      id: true
    }
  });

  return products.map((product) => product.id);
}
