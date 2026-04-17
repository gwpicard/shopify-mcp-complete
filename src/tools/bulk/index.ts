import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  BULK_EXPORT_QUERY_1,
  PRODUCTS_CORE_VARIANTS_QUERY,
  PRODUCTS_MEDIA_META_COLLECTIONS_QUERY,
  GET_BULK_OPERATION_QUERY,
  STAGED_UPLOADS_CREATE_MUTATION,
  BULK_MUTATION_RUN,
  PRODUCT_SET_BULK_MUTATION,
} from "./queries.js";
import { formatSuccess } from "../../utils/formatters.js";
import {
  formatErrorResponse,
  extractGraphQLErrors,
  formatUserErrors,
} from "../../utils/errors.js";

const tools: ToolDefinition[] = [
  {
    name: "bulk_export_products",
    description:
      "Start two sequential bulk export operations for all products. The first exports core product data and variants, the second exports media, metafields, and collections. Returns both bulk operation IDs for polling.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client) => {
      // First bulk operation: core product data + variants
      const result1 = await client.query<{ bulkOperationRunQuery: any }>(
        BULK_EXPORT_QUERY_1,
        { query: PRODUCTS_CORE_VARIANTS_QUERY }
      );
      const error1 = extractGraphQLErrors(result1);
      if (error1) return formatErrorResponse(error1);

      const userError1 = formatUserErrors(
        result1.data!.bulkOperationRunQuery.userErrors
      );
      if (userError1) return formatErrorResponse(userError1);

      const op1 = result1.data!.bulkOperationRunQuery.bulkOperation;

      // Second bulk operation: media + metafields + collections
      const result2 = await client.query<{ bulkOperationRunQuery: any }>(
        BULK_EXPORT_QUERY_1,
        { query: PRODUCTS_MEDIA_META_COLLECTIONS_QUERY }
      );
      const error2 = extractGraphQLErrors(result2);
      if (error2) return formatErrorResponse(error2);

      const userError2 = formatUserErrors(
        result2.data!.bulkOperationRunQuery.userErrors
      );
      if (userError2) return formatErrorResponse(userError2);

      const op2 = result2.data!.bulkOperationRunQuery.bulkOperation;

      return formatSuccess({
        coreVariantsOperation: { id: op1.id, status: op1.status },
        mediaMetaCollectionsOperation: { id: op2.id, status: op2.status },
      });
    },
  },
  {
    name: "get_bulk_operation_status",
    description:
      "Check the status of a bulk operation by its GID. Returns the current status, object count, and download URL when complete.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify bulk operation GID (e.g. gid://shopify/BulkOperation/123)",
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
      const result = await client.query<{ node: any }>(
        GET_BULK_OPERATION_QUERY,
        { id: args.id }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.node)
        return formatErrorResponse("Bulk operation not found");

      return formatSuccess(result.data.node);
    },
  },
  {
    name: "get_bulk_operation_results",
    description:
      "Download and parse the results of a completed bulk operation. Fetches the JSONL file from the bulk operation's URL and returns structured data inline, reconstructing parent-child relationships. Use this instead of manually downloading the URL, especially in sandboxed environments.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify bulk operation GID (e.g. gid://shopify/BulkOperation/123)",
        },
        limit: {
          type: "number",
          description:
            "Max number of root objects to return (optional, for large catalogs)",
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
      const result = await client.query<{ node: any }>(
        GET_BULK_OPERATION_QUERY,
        { id: args.id }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.node)
        return formatErrorResponse("Bulk operation not found");

      const node = result.data.node;

      if (node.status !== "COMPLETED") {
        return formatSuccess({
          status: node.status,
          message: `Operation is ${node.status}. Poll again later.`,
          objectCount: node.objectCount,
        });
      }

      if (!node.url) {
        return formatSuccess({
          status: "COMPLETED",
          message: "Operation completed with no results.",
          objectCount: "0",
        });
      }

      let text: string;
      try {
        const response = await fetch(node.url);
        if (!response.ok) {
          return formatErrorResponse(
            `Failed to download results: ${response.status} ${response.statusText}`
          );
        }
        text = await response.text();
      } catch (err: any) {
        return formatErrorResponse(
          `Failed to fetch results: ${err.message}`
        );
      }

      const lines = text.trim().split("\n").filter(Boolean);
      const objectMap = new Map<string, any>();
      const roots: any[] = [];

      for (const line of lines) {
        const obj = JSON.parse(line);
        if (obj.id) {
          obj._children = [];
          objectMap.set(obj.id, obj);
        }
        if (obj.__parentId) {
          const parent = objectMap.get(obj.__parentId);
          if (parent) {
            parent._children.push(obj);
          }
        } else {
          roots.push(obj);
        }
      }

      const limit = args.limit as number | undefined;
      const data = limit ? roots.slice(0, limit) : roots;

      return formatSuccess({
        status: "COMPLETED",
        objectCount: node.objectCount,
        rootObjectCount: roots.length,
        data,
      });
    },
  },
  {
    name: "bulk_update_products",
    description:
      "Run a bulk mutation to update products using a JSONL file. Creates a staged upload, then runs the bulkOperationRunMutation with the productSet mutation. The JSONL file should contain one ProductSetInput JSON object per line.",
    inputSchema: {
      type: "object",
      properties: {
        jsonl_url: {
          type: "string",
          description:
            "URL to a JSONL file where each line is a JSON object matching ProductSetInput",
        },
      },
      required: ["jsonl_url"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      // Step 1: Create a staged upload target
      const stagedResult = await client.query<{ stagedUploadsCreate: any }>(
        STAGED_UPLOADS_CREATE_MUTATION,
        {
          input: [
            {
              resource: "BULK_MUTATION_VARIABLES",
              filename: "bulk_update.jsonl",
              mimeType: "text/jsonl",
              httpMethod: "POST",
            },
          ],
        }
      );
      const stagedError = extractGraphQLErrors(stagedResult);
      if (stagedError) return formatErrorResponse(stagedError);

      const stagedUserError = formatUserErrors(
        stagedResult.data!.stagedUploadsCreate.userErrors
      );
      if (stagedUserError) return formatErrorResponse(stagedUserError);

      const target = stagedResult.data!.stagedUploadsCreate.stagedTargets[0];
      if (!target) {
        return formatErrorResponse("No staged upload target returned");
      }

      // Step 2: Upload the JSONL file to the staged target
      const jsonlResponse = await fetch(args.jsonl_url as string);
      if (!jsonlResponse.ok) {
        return formatErrorResponse(
          `Failed to fetch JSONL file: ${jsonlResponse.status} ${jsonlResponse.statusText}`
        );
      }
      const jsonlContent = await jsonlResponse.text();

      const formData = new FormData();
      for (const param of target.parameters) {
        formData.append(param.name, param.value);
      }
      formData.append("file", new Blob([jsonlContent], { type: "text/jsonl" }));

      const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        return formatErrorResponse(
          `Failed to upload JSONL to staged target: ${uploadResponse.status} ${uploadResponse.statusText}`
        );
      }

      // Step 3: Run the bulk mutation
      const stagedUploadPath = target.parameters.find(
        (p: { name: string; value: string }) => p.name === "key"
      )?.value;

      if (!stagedUploadPath) {
        return formatErrorResponse(
          "Could not determine staged upload path from parameters"
        );
      }

      const mutationResult = await client.query<{
        bulkOperationRunMutation: any;
      }>(BULK_MUTATION_RUN, {
        mutation: PRODUCT_SET_BULK_MUTATION,
        stagedUploadPath,
      });
      const mutationError = extractGraphQLErrors(mutationResult);
      if (mutationError) return formatErrorResponse(mutationError);

      const mutationUserError = formatUserErrors(
        mutationResult.data!.bulkOperationRunMutation.userErrors
      );
      if (mutationUserError) return formatErrorResponse(mutationUserError);

      const op = mutationResult.data!.bulkOperationRunMutation.bulkOperation;

      return formatSuccess({
        bulkOperation: { id: op.id, status: op.status },
        stagedUploadPath,
      });
    },
  },
];

export const bulkModule: DomainModule = { tools };
registerDomain(bulkModule);
