export const GET_INVENTORY_LEVELS_QUERY = `
  query getInventoryLevels($first: Int!, $after: String, $query: String) {
    inventoryItems(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          sku
          tracked
          inventoryLevels(first: 10) {
            edges {
              node {
                id
                quantities(names: ["available", "incoming", "committed", "damaged", "on_hand"]) {
                  name
                  quantity
                }
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const SET_INVENTORY_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        reason
        changes {
          name
          delta
          quantityAfterChange
        }
      }
      userErrors { field message }
    }
  }
`;

export const ADJUST_INVENTORY_MUTATION = `
  mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        reason
        changes {
          name
          delta
          quantityAfterChange
        }
      }
      userErrors { field message }
    }
  }
`;

export const GET_LOCATIONS_QUERY = `
  query getLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after) {
      edges {
        node {
          id
          name
          isActive
          fulfillsOnlineOrders
          address {
            address1 address2 city
            province country zip phone
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;
