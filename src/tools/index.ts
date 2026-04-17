import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ShopifyClient } from "../client/graphql.js";
import type { ToolResponse, ToolAnnotations } from "../types/index.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  handler: (
    client: ShopifyClient,
    args: Record<string, unknown>
  ) => Promise<ToolResponse>;
}

export interface DomainModule {
  tools: ToolDefinition[];
}

const domainModules: DomainModule[] = [];

export function registerDomain(module: DomainModule): void {
  domainModules.push(module);
}

export function getAllTools(): ToolDefinition[] {
  return domainModules.flatMap((m) => m.tools);
}

export function setupTools(server: Server, client: ShopifyClient): void {
  const allTools = getAllTools();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: "object" as const,
        ...t.inputSchema,
      },
      annotations: t.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = allTools.find((t) => t.name === toolName);

    if (!tool) {
      return {
        content: [
          { type: "text" as const, text: `Error: Unknown tool "${toolName}"` },
        ],
        isError: true,
      };
    }

    try {
      return await tool.handler(
        client,
        (request.params.arguments ?? {}) as Record<string, unknown>
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
