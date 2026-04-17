import { vi, describe, it, expect, beforeEach } from "vitest";
import { storeModule } from "../../src/tools/store/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = storeModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("store", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("get_shop", () => {
    it("returns formatted shop info", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          shop: {
            name: "My Store",
            email: "store@example.com",
            myshopifyDomain: "my-store.myshopify.com",
            plan: { displayName: "Basic" },
            primaryDomain: { url: "https://mystore.com" },
            contactEmail: "owner@example.com",
            billingAddress: { city: "NYC", country: "US" },
            timezoneAbbreviation: "EST",
            currencyCode: "USD",
            weightUnit: "KILOGRAMS",
          },
        },
      });
      const result = await findTool("get_shop").handler(mockClient, {});
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("My Store");
      expect(data.plan).toBe("Basic");
      expect(data.currency).toBe("USD");
      expect(data.timezone).toBe("EST");
    });
  });

  describe("manage_tags", () => {
    it("add action calls tagsAdd", async () => {
      mockClient.query.mockResolvedValue({
        data: { tagsAdd: { node: { id: "p1" }, userErrors: [] } },
      });
      const result = await findTool("manage_tags").handler(mockClient, {
        id: "gid://shopify/Product/1", action: "add", tags: ["sale", "new"],
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), { id: "gid://shopify/Product/1", tags: ["sale", "new"] });
    });

    it("remove action calls tagsRemove", async () => {
      mockClient.query.mockResolvedValue({
        data: { tagsRemove: { node: { id: "p1" }, userErrors: [] } },
      });
      const result = await findTool("manage_tags").handler(mockClient, {
        id: "gid://shopify/Product/1", action: "remove", tags: ["old"],
      });
      expect(result.isError).toBeUndefined();
    });

    it("returns error for invalid action", async () => {
      const result = await findTool("manage_tags").handler(mockClient, {
        id: "p1", action: "invalid", tags: ["tag"],
      });
      expect(result.isError).toBe(true);
    });
  });
});
