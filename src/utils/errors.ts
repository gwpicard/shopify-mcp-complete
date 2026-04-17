import type { ToolResponse } from "../types/index.js";
import type { ShopifyGraphQLResponse } from "../types/shopify.js";

export function formatErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function extractGraphQLErrors<T>(
  response: ShopifyGraphQLResponse<T>
): string | null {
  if (!response.errors || response.errors.length === 0) return null;
  return response.errors.map((e) => e.message).join("; ");
}

export function formatUserErrors(
  userErrors: Array<{ field?: string[]; message: string }>
): string | null {
  if (!userErrors || userErrors.length === 0) return null;
  return userErrors
    .map((e) => (e.field ? `${e.field.join(".")}: ${e.message}` : e.message))
    .join("; ");
}
