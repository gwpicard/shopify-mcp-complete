import { vi, describe, it, expect, beforeEach } from "vitest";
import { collectionsModule } from "../../src/tools/collections/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = collectionsModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("collections", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_collections", () => {
    it("returns list with productsCount flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          collections: {
            edges: [{ node: { id: "c1", title: "Sale", handle: "sale", productsCount: { count: 15 }, ruleSet: null } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_collections").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].productsCount).toBe(15);
    });

    it("passes query filter", async () => {
      mockClient.query.mockResolvedValue({ data: { collections: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("get_collections").handler(mockClient, { query: "title:Summer" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "title:Summer" }));
    });
  });

  describe("get_collection", () => {
    it("returns full detail with products and metafields flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          collection: {
            id: "c1", title: "Sale", handle: "sale", productsCount: { count: 2 },
            products: { edges: [{ node: { id: "p1", title: "Shirt" } }, { node: { id: "p2", title: "Pants" } }], pageInfo: PAGE_INFO },
            metafields: { edges: [{ node: { id: "mf1", key: "banner" } }], pageInfo: PAGE_INFO },
          },
        },
      });
      const result = await findTool("get_collection").handler(mockClient, { id: "gid://shopify/Collection/1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.products).toHaveLength(2);
      expect(data.metafields).toHaveLength(1);
      expect(data.productsCount).toBe(2);
    });

    it("returns error if not found", async () => {
      mockClient.query.mockResolvedValue({ data: { collection: null } });
      const result = await findTool("get_collection").handler(mockClient, { id: "gid://shopify/Collection/999" });
      expect(result.isError).toBe(true);
    });
  });
});
