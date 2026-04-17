export const LIST_CUSTOMERS_QUERY = `
  query listCustomers($first: Int!, $after: String, $query: String, $sortKey: CustomerSortKeys, $reverse: Boolean) {
    customers(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          firstName
          lastName
          displayName
          email
          phone
          state
          tags
          createdAt
          updatedAt
          ordersCount
          amountSpent { amount currencyCode }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const GET_CUSTOMER_QUERY = `
  query getCustomer($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      displayName
      email
      phone
      state
      note
      tags
      createdAt
      updatedAt
      ordersCount
      amountSpent { amount currencyCode }
      taxExempt
      taxExemptions
      addresses {
        id address1 address2 city
        province country zip phone
        firstName lastName company
      }
      metafields(first: 25) {
        edges {
          node { id namespace key value type }
        }
      }
    }
  }
`;
