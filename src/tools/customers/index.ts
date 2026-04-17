import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import { LIST_CUSTOMERS_QUERY, GET_CUSTOMER_QUERY } from "./queries.js";
import { formatSuccess, formatListResponse } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
} from "../../utils/errors.js";
import { buildPaginationArgs, formatPageInfo } from "../../utils/pagination.js";

const tools: ToolDefinition[] = [
  {
    name: "get_customers",
    description:
      "List customers with optional search and sort. Returns summary: name, email, phone, state, tags, ordersCount, amountSpent.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of customers (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
        },
        query: {
          type: "string",
          description:
            'Shopify query filter (e.g. "email:john@example.com", "state:enabled")',
        },
        sort_key: {
          type: "string",
          enum: [
            "NAME",
            "RELEVANCE",
            "LOCATION",
            "ORDER_COUNT",
            "LAST_ORDER_DATE",
            "TOTAL_SPENT",
            "CREATED_AT",
            "UPDATED_AT",
            "ID",
          ],
          description: "Sort key (default: ID)",
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
      const result = await client.query<{ customers: any }>(
        LIST_CUSTOMERS_QUERY,
        {
          ...pagination,
          query: args.query || undefined,
          sortKey: args.sort_key || undefined,
          reverse: args.reverse || undefined,
        }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const customers = result.data!.customers;
      const items = customers.edges.map((e: any) => e.node);
      return formatListResponse(items, formatPageInfo(customers.pageInfo));
    },
  },
  {
    name: "get_customer",
    description:
      "Get full details of a single customer by Shopify GID, including addresses, amountSpent, ordersCount, tax info, and metafields.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Shopify customer GID (e.g. gid://shopify/Customer/123)",
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
      const result = await client.query<{ customer: any }>(
        GET_CUSTOMER_QUERY,
        { id: args.id }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.customer)
        return formatErrorResponse("Customer not found");

      const c = result.data.customer;
      return formatSuccess({
        ...c,
        metafields: c.metafields?.edges?.map((e: any) => e.node) || [],
      });
    },
  },
];

export const customersModule: DomainModule = { tools };
registerDomain(customersModule);
