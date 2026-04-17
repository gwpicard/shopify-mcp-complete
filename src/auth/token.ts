import type { ShopifyConfig } from "../types/index.js";

export function resolveTokenAuth(): ShopifyConfig {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("SHOPIFY_ACCESS_TOKEN is not set");
  }

  return {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN!,
    accessToken,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-04",
  };
}
