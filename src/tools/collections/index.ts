import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import { LIST_COLLECTIONS_QUERY, GET_COLLECTION_QUERY } from "./queries.js";
import { formatSuccess, formatListResponse } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
} from "../../utils/errors.js";
import { buildPaginationArgs, formatPageInfo } from "../../utils/pagination.js";

const tools: ToolDefinition[] = [
  {
    name: "get_collections",
    description:
      "List collections with optional search query. Returns title, handle, productsCount, ruleSet, and sort order.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of collections to return (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
        query: {
          type: "string",
          description:
            'Shopify query filter (e.g. "title:Summer" or "collection_type:smart")',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const pagination = buildPaginationArgs(args as any);
      const result = await client.query<{ collections: any }>(
        LIST_COLLECTIONS_QUERY,
        { ...pagination, query: args.query || undefined }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const collections = result.data!.collections;
      const items = collections.edges.map((e: any) => ({
        ...e.node,
        productsCount: e.node.productsCount?.count,
      }));
      return formatListResponse(items, formatPageInfo(collections.pageInfo));
    },
  },
  {
    name: "get_collection",
    description:
      "Get full details of a single collection by Shopify GID, including products (50), rules, SEO, and metafields (25).",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify collection GID (e.g. gid://shopify/Collection/123)",
        },
      },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const result = await client.query<{ collection: any }>(
        GET_COLLECTION_QUERY,
        { id: args.id }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.collection)
        return formatErrorResponse("Collection not found");

      const c = result.data.collection;
      return formatSuccess({
        ...c,
        productsCount: c.productsCount?.count,
        products: c.products?.edges?.map((e: any) => e.node) || [],
        metafields: c.metafields?.edges?.map((e: any) => e.node) || [],
      });
    },
  },
];

export const collectionsModule: DomainModule = { tools };
registerDomain(collectionsModule);
