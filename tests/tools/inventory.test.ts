import { vi, describe, it, expect, beforeEach } from "vitest";
import { inventoryModule } from "../../src/tools/inventory/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = inventoryModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("inventory", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_inventory_levels", () => {
    it("returns flattened inventory levels", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          inventoryItems: {
            edges: [{
              node: {
                id: "ii1", sku: "SKU1", tracked: true,
                inventoryLevels: { edges: [{ node: { id: "il1", quantities: [{ name: "available", quantity: 10 }], location: { id: "loc1", name: "Warehouse" } } }] },
              },
            }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_inventory_levels").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].inventoryLevels).toHaveLength(1);
      expect(data.items[0].inventoryLevels[0].quantities[0].quantity).toBe(10);
    });
  });

  describe("set_inventory", () => {
    it("calls inventorySetQuantities with correct structure", async () => {
      mockClient.query.mockResolvedValue({
        data: { inventorySetQuantities: { inventoryAdjustmentGroup: { reason: "correction", changes: [] }, userErrors: [] } },
      });
      const result = await findTool("set_inventory").handler(mockClient, {
        inventory_item_id: "gid://shopify/InventoryItem/1", location_id: "gid://shopify/Location/1", quantity: 50,
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), {
        input: expect.objectContaining({ reason: "correction", ignoreCompareQuantity: true, quantities: [{ inventoryItemId: "gid://shopify/InventoryItem/1", locationId: "gid://shopify/Location/1", quantity: 50 }] }),
      });
    });

    it("returns user errors", async () => {
      mockClient.query.mockResolvedValue({
        data: { inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [{ field: ["quantity"], message: "Invalid quantity" }] } },
      });
      const result = await findTool("set_inventory").handler(mockClient, {
        inventory_item_id: "ii1", location_id: "loc1", quantity: -1,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("adjust_inventory", () => {
    it("calls inventoryAdjustQuantities with delta", async () => {
      mockClient.query.mockResolvedValue({
        data: { inventoryAdjustQuantities: { inventoryAdjustmentGroup: { reason: "correction", changes: [{ delta: 5 }] }, userErrors: [] } },
      });
      const result = await findTool("adjust_inventory").handler(mockClient, {
        inventory_item_id: "ii1", location_id: "loc1", delta: 5,
      });
      expect(result.isError).toBeUndefined();
    });

    it("uses custom reason when provided", async () => {
      mockClient.query.mockResolvedValue({
        data: { inventoryAdjustQuantities: { inventoryAdjustmentGroup: { reason: "damaged", changes: [] }, userErrors: [] } },
      });
      await findTool("adjust_inventory").handler(mockClient, {
        inventory_item_id: "ii1", location_id: "loc1", delta: -3, reason: "damaged",
      });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), {
        input: expect.objectContaining({ reason: "damaged" }),
      });
    });
  });

  describe("get_locations", () => {
    it("returns location list", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          locations: {
            edges: [{ node: { id: "loc1", name: "Main Warehouse", isActive: true, fulfillsOnlineOrders: true, address: { city: "NYC" } } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_locations").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].name).toBe("Main Warehouse");
    });
  });
});
