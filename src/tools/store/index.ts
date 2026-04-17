import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  SHOP_INFO_QUERY,
  TAGS_ADD_MUTATION,
  TAGS_REMOVE_MUTATION,
} from "./queries.js";
import { formatSuccess } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
  formatUserErrors,
} from "../../utils/errors.js";

const tools: ToolDefinition[] = [
  {
    name: "get_shop",
    description:
      "Get store information: name, domain, plan, currency, timezone, weight unit, billing address, and contact details.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, _args) => {
      const result = await client.query<{ shop: any }>(SHOP_INFO_QUERY);
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const shop = result.data!.shop;
      return formatSuccess({
        name: shop.name,
        email: shop.email,
        myshopifyDomain: shop.myshopifyDomain,
        plan: shop.plan?.displayName,
        primaryDomain: shop.primaryDomain?.url,
        contactEmail: shop.contactEmail,
        billingAddress: shop.billingAddress,
        timezone: shop.timezoneAbbreviation,
        currency: shop.currencyCode,
        weightUnit: shop.weightUnit,
      });
    },
  },
  {
    name: "manage_tags",
    description:
      'Add or remove tags on any taggable Shopify resource (products, orders, customers, etc.) by GID. Use action "add" or "remove".',
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify GID of the resource (e.g. gid://shopify/Product/123)",
        },
        action: {
          type: "string",
          enum: ["add", "remove"],
          description: "Whether to add or remove tags",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to add or remove",
        },
      },
      required: ["id", "action", "tags"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      if (args.action === "add") {
        const result = await client.query<{ tagsAdd: any }>(
          TAGS_ADD_MUTATION,
          { id: args.id, tags: args.tags }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(result.data!.tagsAdd.userErrors);
        if (userError) return formatErrorResponse(userError);

        return formatSuccess({ success: true, action: "add", tags: args.tags });
      } else if (args.action === "remove") {
        const result = await client.query<{ tagsRemove: any }>(
          TAGS_REMOVE_MUTATION,
          { id: args.id, tags: args.tags }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(result.data!.tagsRemove.userErrors);
        if (userError) return formatErrorResponse(userError);

        return formatSuccess({
          success: true,
          action: "remove",
          tags: args.tags,
        });
      }

      return formatErrorResponse('Invalid action. Use "add" or "remove".');
    },
  },
];

export const storeModule: DomainModule = { tools };
registerDomain(storeModule);
