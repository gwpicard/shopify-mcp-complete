import type { ToolResponse } from "../types/index.js";

export function flattenEdges(connection: any): any[] {
  if (!connection?.edges) return [];
  return connection.edges.map((e: any) => e.node);
}

export function formatSuccess(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function formatListResponse(
  items: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
  totalCount?: number
): ToolResponse {
  const result: Record<string, unknown> = { items };
  if (totalCount !== undefined) result.totalCount = totalCount;
  result.pagination = pageInfo;
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
