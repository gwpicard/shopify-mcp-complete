import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveAuth } from "../../src/auth/index.js";

describe("resolveAuth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws if SHOPIFY_STORE_DOMAIN is not set", async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    await expect(resolveAuth()).rejects.toThrow("SHOPIFY_STORE_DOMAIN is required");
  });

  it("resolves token auth when SHOPIFY_ACCESS_TOKEN is set", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test123";
    const config = await resolveAuth();
    expect(config.storeDomain).toBe("test.myshopify.com");
    expect(config.accessToken).toBe("shpat_test123");
    expect(config.apiVersion).toBe("2026-04");
  });

  it("uses custom API version when set", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test123";
    process.env.SHOPIFY_API_VERSION = "2025-10";
    const config = await resolveAuth();
    expect(config.apiVersion).toBe("2025-10");
  });

  it("throws if no credentials are provided", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    delete process.env.SHOPIFY_ACCESS_TOKEN;
    await expect(resolveAuth()).rejects.toThrow("Set SHOPIFY_ACCESS_TOKEN");
  });
});
