import { registerDomain } from "../index.js";
import type { ToolDefinition, DomainModule } from "../index.js";
import {
  GET_INVENTORY_LEVELS_QUERY,
  SET_INVENTORY_MUTATION,
  ADJUST_INVENTORY_MUTATION,
  GET_LOCATIONS_QUERY,
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
    name: "get_inventory_levels",
    description:
      "List inventory levels across locations. Shows available, incoming, committed, damaged, and on_hand quantities per item per location. Optionally filter by SKU.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of inventory items (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
        },
        query: {
          type: "string",
          description: 'Filter query (e.g. "sku:ABC-123")',
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
      const result = await client.query<{ inventoryItems: any }>(
        GET_INVENTORY_LEVELS_QUERY,
        { ...pagination, query: args.query || undefined }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const items = result.data!.inventoryItems;
      const flat = items.edges.map((e: any) => ({
        ...e.node,
        inventoryLevels: e.node.inventoryLevels.edges.map((l: any) => l.node),
      }));
      return formatListResponse(flat, formatPageInfo(items.pageInfo));
    },
  },
  {
    name: "set_inventory",
    description:
      "Set absolute inventory quantity at a location. Idempotent — sets to exact value regardless of current quantity. Use for physical counts.",
    inputSchema: {
      type: "object",
      properties: {
        inventory_item_id: {
          type: "string",
          description: "Inventory item GID",
        },
        location_id: {
          type: "string",
          description: "Location GID",
        },
        quantity: {
          type: "number",
          description: "New absolute quantity",
        },
      },
      required: ["inventory_item_id", "location_id", "quantity"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const input = {
        reason: "correction",
        name: "available",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId: args.inventory_item_id,
            locationId: args.location_id,
            quantity: args.quantity,
          },
        ],
      };

      const result = await client.query<{ inventorySetQuantities: any }>(
        SET_INVENTORY_MUTATION,
        { input }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(
        result.data!.inventorySetQuantities.userErrors
      );
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.inventorySetQuantities);
    },
  },
  {
    name: "adjust_inventory",
    description:
      "Adjust inventory quantity by a delta (positive to add, negative to subtract). NOT idempotent — calling twice doubles the adjustment. Use for corrections and adjustments.",
    inputSchema: {
      type: "object",
      properties: {
        inventory_item_id: {
          type: "string",
          description: "Inventory item GID",
        },
        location_id: {
          type: "string",
          description: "Location GID",
        },
        delta: {
          type: "number",
          description:
            "Quantity change (positive to add, negative to subtract)",
        },
        reason: {
          type: "string",
          enum: [
            "correction",
            "cycle_count_available",
            "damaged",
            "movement_created",
            "movement_received",
            "movement_canceled",
            "other",
            "promotion",
            "quality_control",
            "received",
            "reservation_created",
            "reservation_deleted",
            "reservation_updated",
            "restock",
            "safety_stock",
            "shrinkage",
          ],
          description: 'Reason for adjustment (default: "correction")',
        },
      },
      required: ["inventory_item_id", "location_id", "delta"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (client, args) => {
      const input = {
        reason: args.reason || "correction",
        name: "available",
        changes: [
          {
            inventoryItemId: args.inventory_item_id,
            locationId: args.location_id,
            delta: args.delta,
          },
        ],
      };

      const result = await client.query<{ inventoryAdjustQuantities: any }>(
        ADJUST_INVENTORY_MUTATION,
        { input }
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const userError = formatUserErrors(
        result.data!.inventoryAdjustQuantities.userErrors
      );
      if (userError) return formatErrorResponse(userError);

      return formatSuccess(result.data!.inventoryAdjustQuantities);
    },
  },
  {
    name: "get_locations",
    description:
      "List store locations with address, active status, and whether they fulfill online orders.",
    inputSchema: {
      type: "object",
      properties: {
        first: {
          type: "number",
          description: "Number of locations (1-250, default 50)",
        },
        after: {
          type: "string",
          description: "Pagination cursor",
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
      const result = await client.query<{ locations: any }>(
        GET_LOCATIONS_QUERY,
        pagination
      );
      const error = extractGraphQLErrors(result);
      if (error) return formatErrorResponse(error);

      const locations = result.data!.locations;
      const items = locations.edges.map((e: any) => e.node);
      return formatListResponse(items, formatPageInfo(locations.pageInfo));
    },
  },
];

export const inventoryModule: DomainModule = { tools };
registerDomain(inventoryModule);
