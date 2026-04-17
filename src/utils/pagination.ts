import type { PageInfo, PaginationArgs } from "../types/index.js";

export function buildPaginationArgs(args: PaginationArgs): {
  first: number;
  after?: string;
} {
  const result: { first: number; after?: string } = {
    first: args.first ?? 50,
  };
  if (args.after) {
    result.after = args.after;
  }
  return result;
}

export function formatPageInfo(pageInfo: PageInfo): {
  hasNextPage: boolean;
  endCursor: string | null;
} {
  return {
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}
