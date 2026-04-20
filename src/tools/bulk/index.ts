import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  BULK_EXPORT_QUERY_1,
  productsCoreVariantsQuery,
  productsMediaMetaCollectionsQuery,
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

function pickFields(obj: any, paths: string[]): any {
  const out: any = {};
  for (const path of paths) {
    const parts = path.split(".");
    let src = obj;
    let dst = out;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (src == null || typeof src !== "object") {
        src = undefined;
        break;
      }
      if (i === parts.length - 1) {
        if (key in src) dst[key] = src[key];
      } else {
        if (!(key in src)) break;
        if (dst[key] == null || typeof dst[key] !== "object") dst[key] = {};
        src = src[key];
        dst = dst[key];
      }
    }
  }
  return out;
}

const tools: ToolDefinition[] = [
  {
    name: "bulk_export_products",
    description:
      "Start two sequential bulk export operations for all products. The first exports core product data and variants, the second exports media, metafields, and collections. Accepts an optional Shopify query filter (same syntax as get_products, e.g. `status:ACTIVE`) to scope the export. Returns both bulk operation IDs for polling.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Optional Shopify query filter applied at the source (e.g. `status:ACTIVE`, `updated_at:>=2024-01-01`). When omitted, exports all products.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const filter = args?.query as string | undefined;

      // First bulk operation: core product data + variants
      const result1 = await client.query<{ bulkOperationRunQuery: any }>(
        BULK_EXPORT_QUERY_1,
        { query: productsCoreVariantsQuery(filter) }
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
        { query: productsMediaMetaCollectionsQuery(filter) }
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
      "Download and parse the results of a completed bulk operation. Fetches the JSONL file from the bulk operation's URL and returns structured data, reconstructing parent-child relationships. Supports pagination (`offset`, `limit`), dotted-path field projection (`fields`), and writing to a local file (`output_file`) to keep large payloads out of the context window. Use this instead of manually downloading the URL, especially in sandboxed environments.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify bulk operation GID (e.g. gid://shopify/BulkOperation/123)",
        },
        offset: {
          type: "number",
          description:
            "Skip this many root objects before returning (default 0).",
        },
        limit: {
          type: "number",
          description:
            "Return at most this many root objects (after offset).",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Dotted field paths to keep on each root object (e.g. [\"id\", \"title\", \"seo.title\"]). Applied after parent-child reconstruction. When omitted, all fields are kept.",
        },
        output_file: {
          type: "string",
          description:
            "If set, writes the parsed/projected array as JSON to this local path and omits `data` from the response. Parent directories are created if needed.",
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

      const offset = Math.max(0, (args.offset as number | undefined) ?? 0);
      const limit = args.limit as number | undefined;
      const end = limit != null ? offset + limit : roots.length;
      let slice = roots.slice(offset, end);

      const fields = args.fields as string[] | undefined;
      if (fields && fields.length > 0) {
        slice = slice.map((r) => pickFields(r, fields));
      }

      const outputFile = args.output_file as string | undefined;
      if (outputFile) {
        try {
          await mkdir(dirname(outputFile), { recursive: true });
          const json = JSON.stringify(slice);
          await writeFile(outputFile, json, "utf8");
          return formatSuccess({
            status: "COMPLETED",
            objectCount: node.objectCount,
            rootObjectCount: roots.length,
            offset,
            limit: limit ?? null,
            returnedCount: slice.length,
            outputFile,
            byteSize: Buffer.byteLength(json, "utf8"),
          });
        } catch (err: any) {
          return formatErrorResponse(
            `Failed to write output file: ${err.message}`
          );
        }
      }

      return formatSuccess({
        status: "COMPLETED",
        objectCount: node.objectCount,
        rootObjectCount: roots.length,
        offset,
        limit: limit ?? null,
        returnedCount: slice.length,
        data: slice,
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
