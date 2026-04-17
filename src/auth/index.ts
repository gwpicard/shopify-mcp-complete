import type { ShopifyConfig } from "../types/index.js";
import { resolveTokenAuth } from "./token.js";

export async function resolveAuth(): Promise<ShopifyConfig> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN is required");
  }

  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (accessToken) {
    return resolveTokenAuth();
  }

  throw new Error(
    "Authentication required. Set SHOPIFY_ACCESS_TOKEN to your shpat_ token.\n" +
      "  Run: bash scripts/get-token.sh"
  );
}
