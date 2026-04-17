import { vi, describe, it, expect, beforeEach } from "vitest";
import { discountsModule } from "../../src/tools/discounts/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = discountsModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const PAGE_INFO = { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null };

describe("discounts", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_discounts", () => {
    it("returns list with codes flattened", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          discountNodes: {
            edges: [{ node: { id: "d1", discount: { title: "Summer Sale", status: "ACTIVE", codes: { edges: [{ node: { code: "SUMMER20" } }] } } } }],
            pageInfo: PAGE_INFO,
          },
        },
      });
      const result = await findTool("get_discounts").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.items[0].codes).toEqual(["SUMMER20"]);
    });
  });

  describe("create_discount", () => {
    it("calls with percentage value", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountCodeBasicCreate: { codeDiscountNode: { id: "d1" }, userErrors: [] } },
      });
      const result = await findTool("create_discount").handler(mockClient, {
        title: "20% Off", code: "SAVE20", value_type: "percentage", value: 0.2,
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), {
        basicCodeDiscount: expect.objectContaining({
          title: "20% Off", code: "SAVE20",
          customerGets: expect.objectContaining({ value: { percentage: 0.2 } }),
        }),
      });
    });

    it("calls with fixed_amount value", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountCodeBasicCreate: { codeDiscountNode: { id: "d1" }, userErrors: [] } },
      });
      await findTool("create_discount").handler(mockClient, {
        title: "$10 Off", code: "SAVE10", value_type: "fixed_amount", value: 10,
      });
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), {
        basicCodeDiscount: expect.objectContaining({
          customerGets: expect.objectContaining({ value: { discountAmount: { amount: 10, appliesOnEachItem: false } } }),
        }),
      });
    });

    it("returns user errors", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [{ field: ["code"], message: "Code already exists" }] } },
      });
      const result = await findTool("create_discount").handler(mockClient, {
        title: "Dup", code: "DUP", value_type: "percentage", value: 0.1,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Code already exists");
    });
  });

  describe("update_discount", () => {
    it("calls discountCodeBasicUpdate", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountCodeBasicUpdate: { codeDiscountNode: { id: "d1" }, userErrors: [] } },
      });
      const result = await findTool("update_discount").handler(mockClient, { id: "gid://shopify/DiscountCodeNode/1", title: "New Title" });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("delete_discount", () => {
    it("routes to discountCodeDelete for code type", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountCodeDelete: { deletedCodeDiscountId: "d1", userErrors: [] } },
      });
      const result = await findTool("delete_discount").handler(mockClient, { id: "d1", type: "code" });
      expect(result.isError).toBeUndefined();
    });

    it("routes to discountAutomaticDelete for automatic type", async () => {
      mockClient.query.mockResolvedValue({
        data: { discountAutomaticDelete: { deletedAutomaticDiscountId: "d1", userErrors: [] } },
      });
      const result = await findTool("delete_discount").handler(mockClient, { id: "d1", type: "automatic" });
      expect(result.isError).toBeUndefined();
    });

    it("returns error for invalid type", async () => {
      const result = await findTool("delete_discount").handler(mockClient, { id: "d1", type: "invalid" });
      expect(result.isError).toBe(true);
    });
  });
});
