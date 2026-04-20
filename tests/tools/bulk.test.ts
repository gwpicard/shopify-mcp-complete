import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    it("inlines the query filter into the products(...) clause", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          data: { bulkOperationRunQuery: { bulkOperation: { id: "op1", status: "CREATED" }, userErrors: [] } },
        })
        .mockResolvedValueOnce({
          data: { bulkOperationRunQuery: { bulkOperation: { id: "op2", status: "CREATED" }, userErrors: [] } },
        });

      await findTool("bulk_export_products").handler(mockClient, { query: "status:ACTIVE" });

      const firstCall = mockClient.query.mock.calls[0][1].query as string;
      const secondCall = mockClient.query.mock.calls[1][1].query as string;
      expect(firstCall).toContain('products(query: "status:ACTIVE")');
      expect(secondCall).toContain('products(query: "status:ACTIVE")');
    });

    it("escapes quotes and backslashes in the query filter", async () => {
      mockClient.query.mockResolvedValue({
        data: { bulkOperationRunQuery: { bulkOperation: { id: "op1", status: "CREATED" }, userErrors: [] } },
      });

      await findTool("bulk_export_products").handler(mockClient, { query: 'vendor:"Evil\\Corp"' });

      const firstCall = mockClient.query.mock.calls[0][1].query as string;
      expect(firstCall).toContain('products(query: "vendor:\\"Evil\\\\Corp\\"")');
    });

    it("omits the query arg when no filter is provided", async () => {
      mockClient.query.mockResolvedValue({
        data: { bulkOperationRunQuery: { bulkOperation: { id: "op1", status: "CREATED" }, userErrors: [] } },
      });

      await findTool("bulk_export_products").handler(mockClient, {});

      const firstCall = mockClient.query.mock.calls[0][1].query as string;
      expect(firstCall).not.toContain("products(query:");
      expect(firstCall).toMatch(/products\s*\{/);
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

  describe("get_bulk_operation_results", () => {
    it("returns status when operation is still running", async () => {
      mockClient.query.mockResolvedValue({
        data: { node: { id: "op1", status: "RUNNING", objectCount: "50", url: null } },
      });
      const result = await findTool("get_bulk_operation_results").handler(mockClient, { id: "op1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe("RUNNING");
      expect(data.message).toContain("RUNNING");
    });

    it("fetches JSONL and reconstructs parent-child relationships", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          node: { id: "op1", status: "COMPLETED", objectCount: "3", url: "https://storage.shopify.com/file.jsonl" },
        },
      });
      const jsonl = [
        '{"id":"gid://shopify/Product/1","title":"Shirt"}',
        '{"id":"gid://shopify/ProductVariant/10","title":"Small","__parentId":"gid://shopify/Product/1"}',
        '{"id":"gid://shopify/Product/2","title":"Hat"}',
      ].join("\n");
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(jsonl) });
      vi.stubGlobal("fetch", mockFetch);

      const result = await findTool("get_bulk_operation_results").handler(mockClient, { id: "op1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe("COMPLETED");
      expect(data.rootObjectCount).toBe(2);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]._children).toHaveLength(1);
      expect(data.data[0]._children[0].title).toBe("Small");
      expect(data.data[1]._children).toHaveLength(0);
    });

    it("handles null url (no results)", async () => {
      mockClient.query.mockResolvedValue({
        data: { node: { id: "op1", status: "COMPLETED", objectCount: "0", url: null } },
      });
      const result = await findTool("get_bulk_operation_results").handler(mockClient, { id: "op1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe("COMPLETED");
      expect(data.message).toContain("no results");
    });

    it("handles fetch failure", async () => {
      mockClient.query.mockResolvedValue({
        data: {
          node: { id: "op1", status: "COMPLETED", objectCount: "10", url: "https://storage.shopify.com/file.jsonl" },
        },
      });
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await findTool("get_bulk_operation_results").handler(mockClient, { id: "op1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });

    it("slices by offset and limit", async () => {
      mockClient.query.mockResolvedValue({
        data: { node: { id: "op1", status: "COMPLETED", objectCount: "5", url: "https://storage.shopify.com/file.jsonl" } },
      });
      const jsonl = [1, 2, 3, 4, 5]
        .map((i) => JSON.stringify({ id: `gid://shopify/Product/${i}`, title: `P${i}` }))
        .join("\n");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(jsonl) }));

      const result = await findTool("get_bulk_operation_results").handler(mockClient, { id: "op1", offset: 1, limit: 2 });
      const data = JSON.parse(result.content[0].text);
      expect(data.rootObjectCount).toBe(5);
      expect(data.offset).toBe(1);
      expect(data.limit).toBe(2);
      expect(data.returnedCount).toBe(2);
      expect(data.data.map((p: any) => p.title)).toEqual(["P2", "P3"]);
    });

    it("projects nested fields with dotted paths", async () => {
      mockClient.query.mockResolvedValue({
        data: { node: { id: "op1", status: "COMPLETED", objectCount: "1", url: "https://storage.shopify.com/file.jsonl" } },
      });
      const jsonl = JSON.stringify({
        id: "gid://shopify/Product/1",
        title: "Shirt",
        vendor: "Acme",
        seo: { title: "Buy Shirt", description: "Great shirt" },
        tags: ["blue"],
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(jsonl) }));

      const result = await findTool("get_bulk_operation_results").handler(mockClient, {
        id: "op1",
        fields: ["id", "title", "seo.title"],
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.data[0]).toEqual({
        id: "gid://shopify/Product/1",
        title: "Shirt",
        seo: { title: "Buy Shirt" },
      });
    });

    it("writes to output_file and omits data from response", async () => {
      const outFile = join(tmpdir(), `bulk-test-${Date.now()}.json`);
      mockClient.query.mockResolvedValue({
        data: { node: { id: "op1", status: "COMPLETED", objectCount: "2", url: "https://storage.shopify.com/file.jsonl" } },
      });
      const jsonl = [
        '{"id":"gid://shopify/Product/1","title":"Shirt"}',
        '{"id":"gid://shopify/Product/2","title":"Hat"}',
      ].join("\n");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(jsonl) }));

      try {
        const result = await findTool("get_bulk_operation_results").handler(mockClient, {
          id: "op1",
          output_file: outFile,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.outputFile).toBe(outFile);
        expect(body.returnedCount).toBe(2);
        expect(body.byteSize).toBeGreaterThan(0);
        expect(body.data).toBeUndefined();

        const onDisk = JSON.parse(await readFile(outFile, "utf8"));
        expect(onDisk).toHaveLength(2);
        expect(onDisk[0].title).toBe("Shirt");
      } finally {
        await rm(outFile, { force: true });
      }
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
