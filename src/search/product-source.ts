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
