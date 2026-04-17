import type { ShopifyConfig } from "../types/index.js";
import type { ShopifyGraphQLResponse } from "../types/shopify.js";
import { RateLimiter } from "./rate-limiter.js";

export class ShopifyClient {
  private url: string;
  private headers: Record<string, string>;
  private rateLimiter: RateLimiter;

  constructor(config: ShopifyConfig) {
    this.url = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;
    this.headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.accessToken!,
    };
    this.rateLimiter = new RateLimiter();
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<ShopifyGraphQLResponse<T>> {
    await this.rateLimiter.waitIfNeeded();

    const body: Record<string, unknown> = { query };
    if (variables) body.variables = variables;

    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error (${response.status}): ${text}`);
    }

    const result = (await response.json()) as ShopifyGraphQLResponse<T>;

    if (result.extensions?.cost?.throttleStatus) {
      this.rateLimiter.update(result.extensions.cost.throttleStatus);
    }

    return result;
  }
}
