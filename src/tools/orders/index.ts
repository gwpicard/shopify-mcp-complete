import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import { LIST_ORDERS_QUERY, GET_ORDER_QUERY } from "./queries.js";
import { formatSuccess, formatListResponse } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
} from "../../utils/errors.js";
import { buildPaginationArgs, formatPageInfo } from "../../utils/pagination.js";

const tools: ToolDefinition[] = [
  {
    name: "get_orders",
    description:
      "List orders with optional filtering using Shopify query syntax. Supports sort keys. Returns order summary with financial/fulfillment status, totals, and customer info.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of orders (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
        },
        query: {
          type: "string",
          description:
            'Shopify query filter (e.g. "fulfillment_status:unshipped", "financial_status:paid")',
        },
        sort_key: {
          type: "string",
          enum: [
            "PROCESSED_AT",
            "TOTAL_PRICE",
            "CREATED_AT",
            "UPDATED_AT",
            "ID",
            "ORDER_NUMBER",
          ],
          description: "Sort key (default: PROCESSED_AT)",
        },
        reverse: {
          type: "boolean",
          description: "Reverse sort order (default: false)",
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
      const result = await client.query<{ orders: any }>(LIST_ORDERS_QUERY, {
        ...pagination,
        query: args.query || undefined,
        sortKey: args.sort_key || undefined,
        reverse: args.reverse || undefined,
      });
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const orders = result.data!.orders;
      const items = orders.edges.map((e: any) => e.node);
      return formatListResponse(items, formatPageInfo(orders.pageInfo));
    },
  },
  {
    name: "get_order",
    description:
      "Get full details of a single order by Shopify GID, including line items (100), customer, shipping/billing addresses, fulfillments, and metafields.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Shopify order GID (e.g. gid://shopify/Order/123)",
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
      const result = await client.query<{ order: any }>(GET_ORDER_QUERY, {
        id: args.id,
      });
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.order) return formatErrorResponse("Order not found");

      const o = result.data.order;
      return formatSuccess({
        ...o,
        lineItems: o.lineItems?.edges?.map((e: any) => e.node) || [],
        metafields: o.metafields?.edges?.map((e: any) => e.node) || [],
      });
    },
  },
];

export const ordersModule: DomainModule = { tools };
registerDomain(ordersModule);
