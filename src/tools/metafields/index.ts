import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  GET_METAFIELDS_QUERY,
  SET_METAFIELDS_MUTATION,
  DELETE_METAFIELD_MUTATION,
  GET_METAFIELD_DEFINITIONS_QUERY,
} from "./queries.js";
import { formatSuccess, formatListResponse, flattenEdges } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
  formatUserErrors,
} from "../../utils/errors.js";
import { buildPaginationArgs, formatPageInfo } from "../../utils/pagination.js";

const tools: ToolDefinition[] = [
  {
    name: "get_metafields",
    description:
      "Get metafields for any resource using the HasMetafields interface. Pass any Shopify GID (product, collection, customer, order, etc.) and optionally filter by namespace.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify resource GID (e.g. gid://shopify/Product/123)",
        },
        namespace: {
          type: "string",
          description: "Optional namespace to filter metafields by",
        },
        first: {
          type: "number",
          description: "Number of metafields to return (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor from previous response",
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
      const pagination = buildPaginationArgs(args as any);
      const variables: Record<string, unknown> = {
        id: args.id,
        ...pagination,
        namespace: args.namespace || undefined,
      };

      const result = await client.query<{ node: any }>(
        GET_METAFIELDS_QUERY,
        variables
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.node) return formatErrorResponse("Resource not found");

      const metafields = result.data.node.metafields;
      const items = flattenEdges(metafields);
      return formatListResponse(items, formatPageInfo(metafields.pageInfo));
    },
  },
  {
    name: "set_metafields",
    description:
      "Set up to 25 metafields atomically. Can span multiple resources. Each metafield needs ownerId, namespace, key, value, and type.",
    inputSchema: {
      type: "object",
      properties: {
        metafields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ownerId: {
                type: "string",
                description: "Shopify resource GID that owns this metafield",
              },
              namespace: {
                type: "string",
                description: "Metafield namespace",
              },
              key: {
                type: "string",
                description: "Metafield key",
              },
              value: {
                type: "string",
                description: "Metafield value",
              },
              type: {
                type: "string",
                description:
                  "Metafield type (e.g. single_line_text_field, number_integer, json, boolean)",
              },
            },
            required: ["ownerId", "namespace", "key", "value", "type"],
          },
          description: "Array of metafields to set (max 25)",
        },
      },
      required: ["metafields"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const metafields = args.metafields as any[];
      if (!metafields || metafields.length === 0) {
        return formatErrorResponse("metafields array is required and must not be empty");
      }
      if (metafields.length > 25) {
        return formatErrorResponse(
          "Maximum 25 metafields can be set at once, received " + metafields.length
        );
      }

      const result = await client.query<{ metafieldsSet: any }>(
        SET_METAFIELDS_MUTATION,
        { metafields }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(result.data!.metafieldsSet.userErrors);
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.metafieldsSet.metafields);
    },
  },
  {
    name: "delete_metafields",
    description: "Delete a metafield by its Shopify GID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify metafield GID (e.g. gid://shopify/Metafield/123)",
        },
      },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const result = await client.query<{ metafieldDelete: any }>(
        DELETE_METAFIELD_MUTATION,
        { input: { id: args.id } }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(
        result.data!.metafieldDelete.userErrors
      );
      if (userError) return formatErrorResponse(userError);

      return formatSuccess({
        deletedId: result.data!.metafieldDelete.deletedId,
      });
    },
  },
  {
    name: "get_metafield_definitions",
    description:
      "Get metafield definitions (schema) for a resource type. Returns field names, types, validations, and descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        owner_type: {
          type: "string",
          enum: [
            "PRODUCT",
            "PRODUCTVARIANT",
            "COLLECTION",
            "CUSTOMER",
            "ORDER",
            "SHOP",
            "LOCATION",
          ],
          description: "The resource type to get metafield definitions for",
        },
        first: {
          type: "number",
          description:
            "Number of definitions to return (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
      },
      required: ["owner_type"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const pagination = buildPaginationArgs(args as any);
      const variables: Record<string, unknown> = {
        ownerType: args.owner_type,
        ...pagination,
      };

      const result = await client.query<{ metafieldDefinitions: any }>(
        GET_METAFIELD_DEFINITIONS_QUERY,
        variables
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const definitions = result.data!.metafieldDefinitions;
      const items = flattenEdges(definitions);
      return formatListResponse(items, formatPageInfo(definitions.pageInfo));
    },
  },
];

export const metafieldsModule: DomainModule = { tools };
registerDomain(metafieldsModule);
