export const LIST_DISCOUNTS_QUERY = `
  query listDiscounts($first: Int!, $after: String, $query: String, $sortKey: DiscountSortKeys, $reverse: Boolean) {
    discountNodes(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          discount {
            ... on DiscountCodeBasic {
              title status startsAt endsAt
              summary
              codes(first: 5) { edges { node { code } } }
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
              }
            }
            ... on DiscountCodeBxgy {
              title status startsAt endsAt summary
              codes(first: 5) { edges { node { code } } }
            }
            ... on DiscountCodeFreeShipping {
              title status startsAt endsAt summary
              codes(first: 5) { edges { node { code } } }
            }
            ... on DiscountAutomaticBasic {
              title status startsAt endsAt summary
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
              }
            }
            ... on DiscountAutomaticBxgy {
              title status startsAt endsAt summary
            }
            ... on DiscountAutomaticFreeShipping {
              title status startsAt endsAt summary
            }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const CREATE_DISCOUNT_CODE_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title status summary
            codes(first: 5) { edges { node { code } } }
          }
        }
      }
      userErrors { field message code }
    }
  }
`;

export const UPDATE_DISCOUNT_CODE_MUTATION = `
  mutation discountCodeBasicUpdate($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title status summary
            codes(first: 5) { edges { node { code } } }
          }
        }
      }
      userErrors { field message code }
    }
  }
`;

export const DELETE_DISCOUNT_CODE_MUTATION = `
  mutation discountCodeDelete($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field message }
    }
  }
`;

export const DELETE_DISCOUNT_AUTOMATIC_MUTATION = `
  mutation discountAutomaticDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;
