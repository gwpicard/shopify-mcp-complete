import { describe, it, expect } from "vitest";
import { getAllTools } from "../../src/tools/index.js";

// Import all domain modules to trigger registration
import "../../src/tools/products/index.js";
import "../../src/tools/bulk/index.js";
import "../../src/tools/metafields/index.js";
import "../../src/tools/collections/index.js";
import "../../src/tools/inventory/index.js";
import "../../src/tools/orders/index.js";
import "../../src/tools/customers/index.js";
import "../../src/tools/discounts/index.js";
import "../../src/tools/store/index.js";

describe("Tool Registry Integration", () => {
  const tools = getAllTools();

  it("registers exactly 33 tools", () => {
    expect(tools).toHaveLength(33);
  });

  it("has no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("all tool names use snake_case", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(
        /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)*$/
      );
    }
  });

  it("all tools have descriptions", () => {
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("all tools have annotations", () => {
    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
      expect(typeof tool.annotations.openWorldHint).toBe("boolean");
    }
  });

  it("all tools have inputSchema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("all tools have handler functions", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("contains the expected tool names", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "adjust_inventory",
      "bulk_export_products",
      "bulk_update_products",
      "count_products",
      "create_discount",
      "create_product",
      "delete_discount",
      "delete_metafields",
      "delete_product",
      "get_bulk_operation_results",
      "get_bulk_operation_status",
      "get_collection",
      "get_collections",
      "get_customer",
      "get_customers",
      "get_discounts",
      "get_inventory_levels",
      "get_locations",
      "get_metafield_definitions",
      "get_metafields",
      "get_order",
      "get_orders",
      "get_product",
      "get_products",
      "get_shop",
      "manage_product_media",
      "manage_product_variants",
      "manage_tags",
      "search_products",
      "set_inventory",
      "set_metafields",
      "update_discount",
      "update_product",
    ]);
  });

  it("read-only tools have correct annotations", () => {
    const readOnlyTools = [
      "get_product",
      "get_products",
      "search_products",
      "count_products",
      "bulk_export_products",
      "get_bulk_operation_status",
      "get_bulk_operation_results",
      "get_metafields",
      "get_metafield_definitions",
      "get_collections",
      "get_collection",
      "get_inventory_levels",
      "get_locations",
      "get_orders",
      "get_order",
      "get_customers",
      "get_customer",
      "get_discounts",
      "get_shop",
    ];

    for (const name of readOnlyTools) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `Tool ${name} should exist`).toBeDefined();
      expect(tool!.annotations.readOnlyHint, `${name} should be readOnly`).toBe(
        true
      );
    }
  });

  it("destructive tools have correct annotations", () => {
    const destructiveTools = ["delete_product", "delete_metafields", "delete_discount"];

    for (const name of destructiveTools) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `Tool ${name} should exist`).toBeDefined();
      expect(
        tool!.annotations.destructiveHint,
        `${name} should be destructive`
      ).toBe(true);
    }
  });
});
