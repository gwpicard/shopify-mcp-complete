import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShopifyClient } from "../../src/client/graphql.js";

describe("ShopifyClient", () => {
  const config = {
    storeDomain: "test.myshopify.com",
    accessToken: "shpat_test123",
    apiVersion: "2026-04",
  };

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs correct API URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { shop: { name: "Test" } } }),
    });

    const client = new ShopifyClient(config);
    await client.query("{ shop { name } }");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.myshopify.com/admin/api/2026-04/graphql.json",
      expect.anything()
    );
  });

  it("sends correct headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    const client = new ShopifyClient(config);
    await client.query("{ shop { name } }");

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers).toEqual({
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": "shpat_test123",
    });
  });

  it("sends query and variables in body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    const client = new ShopifyClient(config);
    await client.query("query($id: ID!) { product(id: $id) { title } }", {
      id: "gid://shopify/Product/123",
    });

    const callArgs = mockFetch.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.query).toBe("query($id: ID!) { product(id: $id) { title } }");
    expect(body.variables).toEqual({ id: "gid://shopify/Product/123" });
  });

  it("returns parsed response", async () => {
    const mockData = { shop: { name: "My Store" } };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockData }),
    });

    const client = new ShopifyClient(config);
    const result = await client.query("{ shop { name } }");
    expect(result.data).toEqual(mockData);
  });

  it("throws on HTTP errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const client = new ShopifyClient(config);
    await expect(client.query("{ shop { name } }")).rejects.toThrow(
      "Shopify API error (401): Unauthorized"
    );
  });

  it("updates rate limiter from extensions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {},
          extensions: {
            cost: {
              requestedQueryCost: 10,
              actualQueryCost: 5,
              throttleStatus: {
                maximumAvailable: 2000,
                currentlyAvailable: 1990,
                restoreRate: 100,
              },
            },
          },
        }),
    });

    const client = new ShopifyClient(config);
    // Should not throw
    const result = await client.query("{ shop { name } }");
    expect(result.extensions?.cost.throttleStatus.currentlyAvailable).toBe(1990);
  });

  it("does not include variables key when none provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    const client = new ShopifyClient(config);
    await client.query("{ shop { name } }");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("variables");
  });
});
