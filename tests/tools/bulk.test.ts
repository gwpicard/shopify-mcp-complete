import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { bulkModule } from "../../src/tools/bulk/index.js";

const mockClient = { query: vi.fn() } as any;

function findTool(name: string) {
  const tool = bulkModule.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("bulk operations", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe("bulk_export_products", () => {
    it("calls client.query twice for two sequential operations", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          data: { bulkOperationRunQuery: { bulkOperation: { id: "op1", status: "CREATED" }, userErrors: [] } },
        })
        .mockResolvedValueOnce({
          data: { bulkOperationRunQuery: { bulkOperation: { id: "op2", status: "CREATED" }, userErrors: [] } },
        });

      const result = await findTool("bulk_export_products").handler(mockClient, {});
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const data = JSON.parse(result.content[0].text);
      expect(data.coreVariantsOperation.id).toBe("op1");
      expect(data.mediaMetaCollectionsOperation.id).toBe("op2");
    });

    it("returns error if first operation fails", async () => {
      mockClient.query.mockResolvedValue({ errors: [{ message: "Rate limited" }] });
      const result = await findTool("bulk_export_products").handler(mockClient, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Rate limited");
    });
  });

  describe("get_bulk_operation_status", () => {
    it("returns operation status", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          node: { id: "op1", status: "COMPLETED", errorCode: null, objectCount: "100", url: "https://storage.shopify.com/file.jsonl", createdAt: "2024-01-01", completedAt: "2024-01-01" },
        },
      });
      const result = await findTool("get_bulk_operation_status").handler(mockClient, { id: "op1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe("COMPLETED");
      expect(data.url).toBe("https://storage.shopify.com/file.jsonl");
    });

    it("returns error if operation not found", async () => {
      mockClient.query.mockResolvedValue({ data: { node: null } });
      const result = await findTool("get_bulk_operation_status").handler(mockClient, { id: "op999" });
      expect(result.isError).toBe(true);
    });
  });

  describe("bulk_update_products", () => {
    it("calls staged upload and then bulk mutation", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('{"input":{"id":"p1"}}') })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      mockClient.query
        .mockResolvedValueOnce({
          data: {
            stagedUploadsCreate: {
              stagedTargets: [{ url: "https://upload.shopify.com", resourceUrl: "https://res.shopify.com", parameters: [{ name: "key", value: "tmp/bulk.jsonl" }] }],
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: { bulkOperationRunMutation: { bulkOperation: { id: "op1", status: "CREATED" }, userErrors: [] } },
        });

      const result = await findTool("bulk_update_products").handler(mockClient, { jsonl_url: "https://example.com/data.jsonl" });
      expect(result.isError).toBeUndefined();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const data = JSON.parse(result.content[0].text);
      expect(data.bulkOperation.id).toBe("op1");
    });
  });
});
