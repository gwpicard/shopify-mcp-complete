import { vi, describe, it, expect, beforeEach } from "vitest";
import { productsModule } from "../../src/tools/products/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = productsModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("products", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_product", () => {
    it("returns flattened product data", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          product: {
            id: "gid://shopify/Product/1",
            title: "T-Shirt",
            variants: { edges: [{ node: { id: "v1", title: "S" } }], pageInfo: PAGE_INFO },
            media: { edges: [{ node: { mediaContentType: "IMAGE", id: "m1" } }], pageInfo: PAGE_INFO },
            metafields: { edges: [{ node: { id: "mf1", key: "color" } }], pageInfo: PAGE_INFO },
            collections: { edges: [{ node: { id: "c1", title: "Sale" } }], pageInfo: PAGE_INFO },
            sellingPlanGroups: { edges: [], pageInfo: PAGE_INFO },
          },
        },
      });

      const result = await findTool("get_product").handler(mockClient, { id: "gid://shopify/Product/1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.variants).toEqual([{ id: "v1", title: "S" }]);
      expect(data.media).toEqual([{ mediaContentType: "IMAGE", id: "m1" }]);
      expect(data.metafields).toEqual([{ id: "mf1", key: "color" }]);
      expect(data.collections).toEqual([{ id: "c1", title: "Sale" }]);
    });

    it("returns error when product not found", async () => {
      mockClient.query.mockResolvedValue({ data: { product: null } });
      const result = await findTool("get_product").handler(mockClient, { id: "gid://shopify/Product/999" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Product not found");
    });
  });

  describe("get_products", () => {
    it("returns paginated list with variantsCount flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          products: {
            edges: [{ node: { id: "p1", title: "A", variantsCount: { count: 3 } } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_products").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].variantsCount).toBe(3);
      expect(data.pagination.hasNextPage).toBe(false);
    });

    it("passes query, sort_key, and reverse", async () => {
      mockClient.query.mockResolvedValue({ data: { products: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("get_products").handler(mockClient, { query: "status:ACTIVE", sort_key: "TITLE", reverse: true });
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ query: "status:ACTIVE", sortKey: "TITLE", reverse: true })
      );
    });
  });

  describe("search_products", () => {
    it("builds title query", async () => {
      mockClient.query.mockResolvedValue({ data: { products: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("search_products").handler(mockClient, { search_type: "title", search_value: "shirt" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "title:*shirt*" }));
    });

    it("builds sku query", async () => {
      mockClient.query.mockResolvedValue({ data: { products: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("search_products").handler(mockClient, { search_type: "sku", search_value: "ABC" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "sku:ABC" }));
    });

    it("builds tag query", async () => {
      mockClient.query.mockResolvedValue({ data: { products: { edges: [], pageInfo: PAGE_INFO } } });
      await findTool("search_products").handler(mockClient, { search_type: "tag", search_value: "sale" });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: "tag:sale" }));
    });
  });

  describe("count_products", () => {
    it("returns count", async () => {
      mockClient.query.mockResolvedValue({ data: { productsCount: { count: 42 } } });
      const result = await findTool("count_products").handler(mockClient, {});
      expect(JSON.parse(result.content[0].text).count).toBe(42);
    });
  });

  describe("create_product", () => {
    it("calls productSet with synchronous:true", async () => {
      mockClient.query.mockResolvedValue({
        data: { productSet: { product: { id: "p1", title: "New", handle: "new", status: "DRAFT" }, userErrors: [] } },
      });
      const result = await findTool("create_product").handler(mockClient, { title: "New" });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ synchronous: true, input: expect.objectContaining({ title: "New" }) })
      );
    });

    it("returns user errors", async () => {
      mockClient.query.mockResolvedValue({
        data: { productSet: { product: null, userErrors: [{ field: ["title"], message: "Title required" }] } },
      });
      const result = await findTool("create_product").handler(mockClient, { title: "" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Title required");
    });
  });

  describe("update_product", () => {
    it("passes id and fields to productSet", async () => {
      mockClient.query.mockResolvedValue({
        data: { productSet: { product: { id: "p1", title: "Updated", handle: "u", status: "ACTIVE" }, userErrors: [] } },
      });
      await findTool("update_product").handler(mockClient, { id: "gid://shopify/Product/1", title: "Updated" });
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ input: expect.objectContaining({ id: "gid://shopify/Product/1", title: "Updated" }) })
      );
    });
  });

  describe("delete_product", () => {
    it("calls productDelete", async () => {
      mockClient.query.mockResolvedValue({
        data: { productDelete: { deletedProductId: "gid://shopify/Product/1", userErrors: [] } },
      });
      const result = await findTool("delete_product").handler(mockClient, { id: "gid://shopify/Product/1" });
      expect(JSON.parse(result.content[0].text).deletedProductId).toBe("gid://shopify/Product/1");
    });
  });

  describe("manage_product_media", () => {
    it("add action calls productCreateMedia", async () => {
      mockClient.query.mockResolvedValue({ data: { productCreateMedia: { media: [], mediaUserErrors: [] } } });
      const result = await findTool("manage_product_media").handler(mockClient, {
        product_id: "gid://shopify/Product/1", action: "add",
        media: [{ originalSource: "https://example.com/img.jpg", mediaContentType: "IMAGE" }],
      });
      expect(result.isError).toBeUndefined();
    });

    it("returns error if media missing for add", async () => {
      const result = await findTool("manage_product_media").handler(mockClient, { product_id: "p1", action: "add" });
      expect(result.isError).toBe(true);
    });

    it("delete action calls productDeleteMedia", async () => {
      mockClient.query.mockResolvedValue({ data: { productDeleteMedia: { deletedMediaIds: ["m1"], mediaUserErrors: [] } } });
      const result = await findTool("manage_product_media").handler(mockClient, {
        product_id: "gid://shopify/Product/1", action: "delete", media_ids: ["m1"],
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("manage_product_variants", () => {
    it("create action calls productVariantsBulkCreate", async () => {
      mockClient.query.mockResolvedValue({ data: { productVariantsBulkCreate: { productVariants: [{ id: "v1" }], userErrors: [] } } });
      const result = await findTool("manage_product_variants").handler(mockClient, {
        product_id: "gid://shopify/Product/1", action: "create", variants: [{ price: "10.00" }],
      });
      expect(result.isError).toBeUndefined();
    });

    it("returns error if variants missing for create", async () => {
      const result = await findTool("manage_product_variants").handler(mockClient, { product_id: "p1", action: "create" });
      expect(result.isError).toBe(true);
    });

    it("delete action calls productVariantsBulkDelete", async () => {
      mockClient.query.mockResolvedValue({ data: { productVariantsBulkDelete: { productVariants: [], userErrors: [] } } });
      const result = await findTool("manage_product_variants").handler(mockClient, {
        product_id: "gid://shopify/Product/1", action: "delete", variant_ids: ["v1"],
      });
      expect(result.isError).toBeUndefined();
    });
  });
});
