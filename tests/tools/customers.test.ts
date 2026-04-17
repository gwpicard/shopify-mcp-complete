import { vi, describe, it, expect, beforeEach } from "vitest";
import { customersModule } from "../../src/tools/customers/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = customersModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("customers", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_customers", () => {
    it("returns paginated customer list", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          customers: {
            edges: [{ node: { id: "c1", displayName: "John Doe", email: "john@example.com" } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_customers").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].displayName).toBe("John Doe");
    });

    it("passes query and sort_key", async () => {
      mockClient.query.mockResolvedValue({ data: { customers: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("get_customers").handler(mockClient, { query: "state:enabled", sort_key: "TOTAL_SPENT" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "state:enabled", sortKey: "TOTAL_SPENT" }));
    });
  });

  describe("get_customer", () => {
    it("returns full detail with metafields flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          customer: {
            id: "c1", displayName: "John Doe", email: "john@example.com",
            metafields: { edges: [{ node: { id: "mf1", key: "loyalty" } }] },
            addresses: [{ id: "a1", city: "NYC" }],
          },
        },
      });
      const result = await findTool("get_customer").handler(mockClient, { id: "gid://shopify/Customer/1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.metafields).toHaveLength(1);
      expect(data.addresses).toHaveLength(1);
    });

    it("returns error if not found", async () => {
      mockClient.query.mockResolvedValue({ data: { customer: null } });
      const result = await findTool("get_customer").handler(mockClient, { id: "gid://shopify/Customer/999" });
      expect(result.isError).toBe(true);
    });
  });
});
