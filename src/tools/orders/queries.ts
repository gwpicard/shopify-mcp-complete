export const LIST_ORDERS_QUERY = `
  query listOrders($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys, $reverse: Boolean) {
    orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          name
          email
          phone
          createdAt
          updatedAt
          cancelledAt
          closedAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          note
          tags
          customer {
            id displayName email
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const GET_ORDER_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      phone
      createdAt
      updatedAt
      cancelledAt
      closedAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      note
      tags
      customer {
        id displayName email phone
      }
      shippingAddress {
        address1 address2 city province country zip phone
        firstName lastName company
      }
      billingAddress {
        address1 address2 city province country zip phone
        firstName lastName company
      }
      lineItems(first: 100) {
        edges {
          node {
            id title quantity
            variant {
              id title sku
            }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
      fulfillments {
        id status trackingInfo { number url company }
        createdAt updatedAt
      }
      metafields(first: 25) {
        edges {
          node { id namespace key value type }
        }
      }
    }
  }
`;
