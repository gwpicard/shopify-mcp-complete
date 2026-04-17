import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  LIST_DISCOUNTS_QUERY,
  CREATE_DISCOUNT_CODE_MUTATION,
  UPDATE_DISCOUNT_CODE_MUTATION,
  DELETE_DISCOUNT_CODE_MUTATION,
  DELETE_DISCOUNT_AUTOMATIC_MUTATION,
} from "./queries.js";
import { formatSuccess, formatListResponse } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
  formatUserErrors,
} from "../../utils/errors.js";
import { buildPaginationArgs, formatPageInfo } from "../../utils/pagination.js";

const tools: ToolDefinition[] = [
  {
    name: "get_discounts",
    description:
      "List discounts (code and automatic) with unified polymorphic query. Returns title, status, dates, summary, and discount values across all 6 discount types.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of discounts (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
        },
        query: {
          type: "string",
          description:
            'Shopify query filter (e.g. "status:active")',
        },
        sort_key: {
          type: "string",
          enum: ["CREATED_AT", "UPDATED_AT", "ID"],
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
      const result = await client.query<{ discountNodes: any }>(
        LIST_DISCOUNTS_QUERY,
        {
          ...pagination,
          query: args.query || undefined,
          sortKey: args.sort_key || undefined,
          reverse: args.reverse || undefined,
        }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const discounts = result.data!.discountNodes;
      const items = discounts.edges.map((e: any) => ({
        id: e.node.id,
        ...e.node.discount,
        codes: e.node.discount?.codes?.edges?.map((c: any) => c.node.code),
      }));
      return formatListResponse(items, formatPageInfo(discounts.pageInfo));
    },
  },
  {
    name: "create_discount",
    description:
      "Create a basic discount code (percentage or fixed amount). Provide a code, title, discount value, and optionally customer eligibility and date range.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Discount title (internal name)",
        },
        code: {
          type: "string",
          description: "Discount code customers will enter",
        },
        value_type: {
          type: "string",
          enum: ["percentage", "fixed_amount"],
          description: "Type of discount value",
        },
        value: {
          type: "number",
          description:
            "Discount value (percentage as decimal 0.0-1.0, or fixed amount in store currency)",
        },
        starts_at: {
          type: "string",
          description: "Start date (ISO 8601, default: now)",
        },
        ends_at: {
          type: "string",
          description: "End date (ISO 8601, optional)",
        },
        applies_once_per_customer: {
          type: "boolean",
          description: "Limit to once per customer (default: false)",
        },
        usage_limit: {
          type: "number",
          description: "Maximum total uses (optional)",
        },
      },
      required: ["title", "code", "value_type", "value"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const customerGets: Record<string, unknown> = {
        items: { all: true },
        value:
          args.value_type === "percentage"
            ? { percentage: args.value }
            : { discountAmount: { amount: args.value, appliesOnEachItem: false } },
      };

      const basicCodeDiscount: Record<string, unknown> = {
        title: args.title,
        code: args.code,
        startsAt: args.starts_at || new Date().toISOString(),
        customerGets,
        customerSelection: { all: true },
        appliesOncePerCustomer: args.applies_once_per_customer ?? false,
      };

      if (args.ends_at) basicCodeDiscount.endsAt = args.ends_at;
      if (args.usage_limit) basicCodeDiscount.usageLimit = args.usage_limit;

      const result = await client.query<{ discountCodeBasicCreate: any }>(
        CREATE_DISCOUNT_CODE_MUTATION,
        { basicCodeDiscount }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(
        result.data!.discountCodeBasicCreate.userErrors
      );
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.discountCodeBasicCreate.codeDiscountNode);
    },
  },
  {
    name: "update_discount",
    description:
      "Update an existing basic discount code. Provide the discount node GID and fields to change.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Discount node GID",
        },
        title: {
          type: "string",
          description: "New title",
        },
        code: {
          type: "string",
          description: "New discount code",
        },
        value_type: {
          type: "string",
          enum: ["percentage", "fixed_amount"],
          description: "Type of discount value",
        },
        value: {
          type: "number",
          description: "New discount value",
        },
        starts_at: {
          type: "string",
          description: "New start date (ISO 8601)",
        },
        ends_at: {
          type: "string",
          description: "New end date (ISO 8601, or null to remove)",
        },
        usage_limit: {
          type: "number",
          description: "New maximum total uses",
        },
      },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const basicCodeDiscount: Record<string, unknown> = {};

      if (args.title) basicCodeDiscount.title = args.title;
      if (args.code) basicCodeDiscount.code = args.code;
      if (args.starts_at) basicCodeDiscount.startsAt = args.starts_at;
      if (args.ends_at !== undefined) basicCodeDiscount.endsAt = args.ends_at;
      if (args.usage_limit !== undefined)
        basicCodeDiscount.usageLimit = args.usage_limit;

      if (args.value_type && args.value !== undefined) {
        basicCodeDiscount.customerGets = {
          items: { all: true },
          value:
            args.value_type === "percentage"
              ? { percentage: args.value }
              : {
                  discountAmount: {
                    amount: args.value,
                    appliesOnEachItem: false,
                  },
                },
        };
        basicCodeDiscount.customerSelection = { all: true };
      }

      const result = await client.query<{ discountCodeBasicUpdate: any }>(
        UPDATE_DISCOUNT_CODE_MUTATION,
        { id: args.id, basicCodeDiscount }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(
        result.data!.discountCodeBasicUpdate.userErrors
      );
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.discountCodeBasicUpdate.codeDiscountNode);
    },
  },
  {
    name: "delete_discount",
    description:
      'Delete a discount by GID. Specify type as "code" or "automatic" to route to the correct mutation.',
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Discount GID",
        },
        type: {
          type: "string",
          enum: ["code", "automatic"],
          description: "Discount type (determines which delete mutation to use)",
        },
      },
      required: ["id", "type"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      if (args.type === "code") {
        const result = await client.query<{ discountCodeDelete: any }>(
          DELETE_DISCOUNT_CODE_MUTATION,
          { id: args.id }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.discountCodeDelete.userErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess({
          deletedId: result.data!.discountCodeDelete.deletedCodeDiscountId,
        });
      } else if (args.type === "automatic") {
        const result = await client.query<{ discountAutomaticDelete: any }>(
          DELETE_DISCOUNT_AUTOMATIC_MUTATION,
          { id: args.id }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.discountAutomaticDelete.userErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess({
          deletedId:
            result.data!.discountAutomaticDelete.deletedAutomaticDiscountId,
        });
      }

      return formatErrorResponse('Invalid type. Use "code" or "automatic".');
    },
  },
];

export const discountsModule: DomainModule = { tools };
registerDomain(discountsModule);
