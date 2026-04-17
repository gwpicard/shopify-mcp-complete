import { vi, describe, it, expect, beforeEach } from "vitest";
import { metafieldsModule } from "../../src/tools/metafields/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = metafieldsModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("metafields", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_metafields", () => {
    it("returns flattened metafields with pagination", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          node: {
            metafields: {
              edges: [{ node: { id: "mf1", namespace: "custom", key: "color", value: "red", type: "single_line_text_field" } }],
              pageInfo: PAGE_INFO,
            },
          },
        },
      });
      const result = await findTool("get_metafields").handler(mockClient, { id: "gid://shopify/Product/1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].key).toBe("color");
    });

    it("passes namespace filter", async () => {
      mockClient.query.mockResolvedValue({ data: { node: { metafields: { edges: [], pageInfo: PAGE_INFO } } } });
      await findTool("get_metafields").handler(mockClient, { id: "gid://shopify/Product/1", namespace: "custom" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ namespace: "custom" }));
    });

    it("returns error if resource not found", async () => {
      mockClient.query.mockResolvedValue({ data: { node: null } });
      const result = await findTool("get_metafields").handler(mockClient, { id: "gid://shopify/Product/999" });
      expect(result.isError).toBe(true);
    });
  });

  describe("set_metafields", () => {
    it("calls metafieldsSet mutation", async () => {
      mockClient.query.mockResolvedValue({ data: { metafieldsSet: { metafields: [{ id: "mf1" }], userErrors: [] } } });
      const result = await findTool("set_metafields").handler(mockClient, {
        metafields: [{ ownerId: "gid://shopify/Product/1", namespace: "custom", key: "color", value: "blue", type: "single_line_text_field" }],
      });
      expect(result.isError).toBeUndefined();
    });

    it("rejects empty array", async () => {
      const result = await findTool("set_metafields").handler(mockClient, { metafields: [] });
      expect(result.isError).toBe(true);
    });

    it("rejects more than 25 metafields", async () => {
      const metafields = Array.from({ length: 26 }, (_, i) => ({ ownerId: "p1", namespace: "ns", key: `k${i}`, value: "v", type: "single_line_text_field" }));
      const result = await findTool("set_metafields").handler(mockClient, { metafields });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("25");
    });
  });

  describe("delete_metafields", () => {
    it("calls metafieldDelete with correct input", async () => {
      mockClient.query.mockResolvedValue({ data: { metafieldDelete: { deletedId: "mf1", userErrors: [] } } });
      const result = await findTool("delete_metafields").handler(mockClient, { id: "gid://shopify/Metafield/1" });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), { input: { id: "gid://shopify/Metafield/1" } });
    });
  });

  describe("get_metafield_definitions", () => {
    it("returns definitions with pagination", async () => {
      mockClient.query.mockResolvedValue({
        data: { metafieldDefinitions: { edges: [{ node: { id: "d1", name: "Color", namespace: "custom", key: "color", type: { name: "single_line_text_field" } } }], pageInfo: PAGE_INFO } },
      });
      const result = await findTool("get_metafield_definitions").handler(mockClient, { owner_type: "PRODUCT" });
      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(1);
    });

    it("maps owner_type to ownerType", async () => {
      mockClient.query.mockResolvedValue({ data: { metafieldDefinitions: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("get_metafield_definitions").handler(mockClient, { owner_type: "PRODUCT" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ ownerType: "PRODUCT" }));
    });
  });
});
