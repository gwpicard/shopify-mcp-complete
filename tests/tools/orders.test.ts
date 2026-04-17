import { vi, describe, it, expect, beforeEach } from "vitest";
import { ordersModule } from "../../src/tools/orders/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = ordersModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("orders", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_orders", () => {
    it("returns paginated order list", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          orders: {
            edges: [{ node: { id: "o1", name: "#1001", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED" } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_orders").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].name).toBe("#1001");
    });

    it("passes query and sort_key", async () => {
      mockClient.query.mockResolvedValue({ data: { orders: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("get_orders").handler(mockClient, { query: "fulfillment_status:unshipped", sort_key: "CREATED_AT" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "fulfillment_status:unshipped", sortKey: "CREATED_AT" }));
    });
  });

  describe("get_order", () => {
    it("returns full detail with lineItems and metafields flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          order: {
            id: "o1", name: "#1001",
            lineItems: { edges: [{ node: { id: "li1", title: "Shirt", quantity: 2 } }], pageInfo: PAGE_INFO },
            metafields: { edges: [{ node: { id: "mf1", key: "note" } }] },
            fulfillments: [],
          },
        },
      });
      const result = await findTool("get_order").handler(mockClient, { id: "gid://shopify/Order/1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.lineItems).toHaveLength(1);
      expect(data.metafields).toHaveLength(1);
    });

    it("returns error if not found", async () => {
      mockClient.query.mockResolvedValue({ data: { order: null } });
      const result = await findTool("get_order").handler(mockClient, { id: "gid://shopify/Order/999" });
      expect(result.isError).toBe(true);
    });
  });
});
