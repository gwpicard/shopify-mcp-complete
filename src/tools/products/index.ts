import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  GET_PRODUCT_QUERY,
  LIST_PRODUCTS_QUERY,
  COUNT_PRODUCTS_QUERY,
  PRODUCT_SET_MUTATION,
  DELETE_PRODUCT_MUTATION,
  CREATE_MEDIA_MUTATION,
  DELETE_MEDIA_MUTATION,
  VARIANT_BULK_CREATE_MUTATION,
  VARIANT_BULK_UPDATE_MUTATION,
  VARIANT_BULK_DELETE_MUTATION,
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
    name: "get_product",
    description:
      "Get comprehensive details of a single product by Shopify GID. Returns SEO, metafields, all media types, variants with cost/SKU/barcode/weight, collections, category, selling plans, price ranges, and options.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Shopify product GID (e.g. gid://shopify/Product/123)",
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
      const result = await client.query<{ product: any }>(GET_PRODUCT_QUERY, {
        id: args.id,
      });
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);
      if (!result.data?.product) return formatErrorResponse("Product not found");

      const p = result.data.product;
      return formatSuccess({
        ...p,
        variants: flattenEdges(p.variants),
        media: flattenEdges(p.media),
        metafields: flattenEdges(p.metafields),
        collections: flattenEdges(p.collections),
        sellingPlanGroups: flattenEdges(p.sellingPlanGroups),
      });
    },
  },
  {
    name: "get_products",
    description:
      "List products with optional filtering using Shopify query syntax (e.g. status:ACTIVE, vendor:\"Nike\"). Returns summary fields: id, title, handle, status, vendor, productType, tags, dates, totalInventory, variantsCount, priceRange. Supports sort keys.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of products to return (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
        query: {
          type: "string",
          description:
            'Shopify query syntax filter (e.g. "status:ACTIVE AND vendor:Nike")',
        },
        sort_key: {
          type: "string",
          enum: [
            "TITLE",
            "PRODUCT_TYPE",
            "VENDOR",
            "INVENTORY_TOTAL",
            "UPDATED_AT",
            "CREATED_AT",
            "PUBLISHED_AT",
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
      const variables: Record<string, unknown> = {
        ...pagination,
        query: args.query || undefined,
        sortKey: args.sort_key || undefined,
        reverse: args.reverse || undefined,
      };

      const result = await client.query<{ products: any }>(
        LIST_PRODUCTS_QUERY,
        variables
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const products = result.data!.products;
      const items = products.edges.map((e: any) => ({
        ...e.node,
        variantsCount: e.node.variantsCount?.count,
      }));
      return formatListResponse(items, formatPageInfo(products.pageInfo));
    },
  },
  {
    name: "search_products",
    description:
      "Convenience search for products by title, SKU, tag, or free text. Builds the appropriate Shopify query automatically.",
    inputSchema: {
      type: "object",
      properties: {
        search_type: {
          type: "string",
          enum: ["title", "sku", "tag", "text"],
          description: "What to search by",
        },
        search_value: {
          type: "string",
          description: "The value to search for",
        },
        first: {
          type: "number",
          description: "Number of results (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
        },
      },
      required: ["search_type", "search_value"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const pagination = buildPaginationArgs(args as any);
      let query: string;

      switch (args.search_type) {
        case "title":
          query = `title:*${args.search_value}*`;
          break;
        case "sku":
          query = `sku:${args.search_value}`;
          break;
        case "tag":
          query = `tag:${args.search_value}`;
          break;
        case "text":
        default:
          query = String(args.search_value);
          break;
      }

      const result = await client.query<{ products: any }>(
        LIST_PRODUCTS_QUERY,
        { ...pagination, query }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const products = result.data!.products;
      const items = products.edges.map((e: any) => ({
        ...e.node,
        variantsCount: e.node.variantsCount?.count,
      }));
      return formatListResponse(items, formatPageInfo(products.pageInfo));
    },
  },
  {
    name: "count_products",
    description:
      "Count products with optional Shopify query filter. Returns total count.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Optional Shopify query filter (e.g. "status:ACTIVE")',
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
      const result = await client.query<{ productsCount: { count: number } }>(
        COUNT_PRODUCTS_QUERY,
        { query: args.query || undefined }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      return formatSuccess({ count: result.data!.productsCount.count });
    },
  },
  {
    name: "create_product",
    description:
      "Create a new product using productSet mutation with synchronous mode. Supports title, description, variants (with prices, SKUs, inventory), options, media (by URL), metafields, SEO, tags, vendor, productType, status, and category.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Product title" },
        descriptionHtml: {
          type: "string",
          description: "Product description (HTML)",
        },
        vendor: { type: "string", description: "Product vendor" },
        productType: { type: "string", description: "Product type" },
        status: {
          type: "string",
          enum: ["ACTIVE", "ARCHIVED", "DRAFT"],
          description: "Product status (default DRAFT)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Product tags",
        },
        seo: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          description: "SEO title and description",
        },
        category: {
          type: "string",
          description: "Product category (Shopify standard taxonomy ID)",
        },
        variants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              optionValues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    optionName: { type: "string" },
                  },
                },
              },
              price: { type: "string" },
              compareAtPrice: { type: "string" },
              sku: { type: "string" },
              barcode: { type: "string" },
              weight: { type: "number" },
              weightUnit: { type: "string" },
              inventoryQuantities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    locationId: { type: "string" },
                    name: { type: "string" },
                    quantity: { type: "number" },
                  },
                },
              },
            },
          },
          description: "Product variants with options, prices, and inventory",
        },
        metafields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              namespace: { type: "string" },
              key: { type: "string" },
              value: { type: "string" },
              type: { type: "string" },
            },
          },
          description: "Product metafields",
        },
      },
      required: ["title"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const input: Record<string, unknown> = { title: args.title };
      if (args.descriptionHtml) input.descriptionHtml = args.descriptionHtml;
      if (args.vendor) input.vendor = args.vendor;
      if (args.productType) input.productType = args.productType;
      if (args.status) input.status = args.status;
      if (args.tags) input.tags = args.tags;
      if (args.seo) input.seo = args.seo;
      if (args.category) input.category = args.category;
      if (args.variants) input.variants = args.variants;
      if (args.metafields) input.metafields = args.metafields;

      const result = await client.query<{ productSet: any }>(
        PRODUCT_SET_MUTATION,
        { synchronous: true, input }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(result.data!.productSet.userErrors);
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.productSet.product);
    },
  },
  {
    name: "update_product",
    description:
      "Update an existing product using productSet mutation. Provide the product ID and any fields to change. List fields (variants, metafields) use SET semantics — the provided list represents the complete desired state.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Shopify product GID" },
        title: { type: "string", description: "New title" },
        descriptionHtml: {
          type: "string",
          description: "New description (HTML)",
        },
        vendor: { type: "string", description: "New vendor" },
        productType: { type: "string", description: "New product type" },
        status: {
          type: "string",
          enum: ["ACTIVE", "ARCHIVED", "DRAFT"],
          description: "New status",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags (replaces all)",
        },
        seo: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          description: "SEO title and description",
        },
        category: {
          type: "string",
          description: "Product category (Shopify standard taxonomy ID)",
        },
        variants: {
          type: "array",
          items: { type: "object" },
          description:
            "Variants (SET semantics — complete desired state). Include existing variant IDs to keep them.",
        },
        metafields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              namespace: { type: "string" },
              key: { type: "string" },
              value: { type: "string" },
              type: { type: "string" },
            },
          },
          description: "Metafields to set on this product",
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
      const { id, ...fields } = args;
      const input: Record<string, unknown> = { id, ...fields };

      const result = await client.query<{ productSet: any }>(
        PRODUCT_SET_MUTATION,
        { synchronous: true, input }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(result.data!.productSet.userErrors);
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.productSet.product);
    },
  },
  {
    name: "delete_product",
    description:
      "Permanently delete a product by Shopify GID. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Shopify product GID to delete" },
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
      const result = await client.query<{ productDelete: any }>(
        DELETE_PRODUCT_MUTATION,
        { input: { id: args.id } }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(result.data!.productDelete.userErrors);
      if (userError) return formatErrorResponse(userError);

      return formatSuccess({
        deletedProductId: result.data!.productDelete.deletedProductId,
      });
    },
  },
  {
    name: "manage_product_media",
    description:
      "Add or delete media on a product. Use action 'add' with media URLs, or 'delete' with media GIDs.",
    inputSchema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Shopify product GID",
        },
        action: {
          type: "string",
          enum: ["add", "delete"],
          description: "Action to perform",
        },
        media: {
          type: "array",
          items: {
            type: "object",
            properties: {
              originalSource: {
                type: "string",
                description: "Media URL (for add action)",
              },
              alt: { type: "string", description: "Alt text (for add action)" },
              mediaContentType: {
                type: "string",
                enum: ["IMAGE", "VIDEO", "EXTERNAL_VIDEO", "MODEL_3D"],
                description: "Media type (for add action)",
              },
            },
          },
          description: "Media items to add (for add action)",
        },
        media_ids: {
          type: "array",
          items: { type: "string" },
          description: "Media GIDs to delete (for delete action)",
        },
      },
      required: ["product_id", "action"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      if (args.action === "add") {
        if (!args.media || !(args.media as any[]).length) {
          return formatErrorResponse("media array is required for add action");
        }
        const result = await client.query<{ productCreateMedia: any }>(
          CREATE_MEDIA_MUTATION,
          { productId: args.product_id, media: args.media }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.productCreateMedia.mediaUserErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess(result.data!.productCreateMedia);
      } else if (args.action === "delete") {
        if (!args.media_ids || !(args.media_ids as any[]).length) {
          return formatErrorResponse(
            "media_ids array is required for delete action"
          );
        }
        const result = await client.query<{ productDeleteMedia: any }>(
          DELETE_MEDIA_MUTATION,
          { productId: args.product_id, mediaIds: args.media_ids }
        );
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.productDeleteMedia.mediaUserErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess(result.data!.productDeleteMedia);
      }

      return formatErrorResponse('Invalid action. Use "add" or "delete".');
    },
  },
  {
    name: "manage_product_variants",
    description:
      "Bulk create, update, or delete variants on a product. Use action 'create' with variant data, 'update' with variant IDs and fields, or 'delete' with variant GIDs.",
    inputSchema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Shopify product GID",
        },
        action: {
          type: "string",
          enum: ["create", "update", "delete"],
          description: "Action to perform",
        },
        variants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Variant GID (required for update)",
              },
              price: { type: "string" },
              compareAtPrice: { type: "string" },
              sku: { type: "string" },
              barcode: { type: "string" },
              weight: { type: "number" },
              weightUnit: { type: "string" },
              optionValues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    optionName: { type: "string" },
                  },
                },
              },
            },
          },
          description: "Variant data (for create/update actions)",
        },
        variant_ids: {
          type: "array",
          items: { type: "string" },
          description: "Variant GIDs to delete (for delete action)",
        },
      },
      required: ["product_id", "action"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      if (args.action === "create") {
        if (!args.variants || !(args.variants as any[]).length) {
          return formatErrorResponse(
            "variants array is required for create action"
          );
        }
        const result = await client.query<{
          productVariantsBulkCreate: any;
        }>(VARIANT_BULK_CREATE_MUTATION, {
          productId: args.product_id,
          variants: args.variants,
        });
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.productVariantsBulkCreate.userErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess(result.data!.productVariantsBulkCreate);
      } else if (args.action === "update") {
        if (!args.variants || !(args.variants as any[]).length) {
          return formatErrorResponse(
            "variants array is required for update action"
          );
        }
        const result = await client.query<{
          productVariantsBulkUpdate: any;
        }>(VARIANT_BULK_UPDATE_MUTATION, {
          productId: args.product_id,
          variants: args.variants,
        });
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.productVariantsBulkUpdate.userErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess(result.data!.productVariantsBulkUpdate);
      } else if (args.action === "delete") {
        if (!args.variant_ids || !(args.variant_ids as any[]).length) {
          return formatErrorResponse(
            "variant_ids array is required for delete action"
          );
        }
        const result = await client.query<{
          productVariantsBulkDelete: any;
        }>(VARIANT_BULK_DELETE_MUTATION, {
          productId: args.product_id,
          variantsIds: args.variant_ids,
        });
        const error = extractGraphQLErrors(result);
        if (error) return formatErrorResponse(error);

        const userError = formatUserErrors(
          result.data!.productVariantsBulkDelete.userErrors
        );
        if (userError) return formatErrorResponse(userError);

        return formatSuccess(result.data!.productVariantsBulkDelete);
      }

      return formatErrorResponse(
        'Invalid action. Use "create", "update", or "delete".'
      );
    },
  },
];

export const productsModule: DomainModule = { tools };
registerDomain(productsModule);
