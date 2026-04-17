export const LIST_COLLECTIONS_QUERY = `
  query listCollections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          sortOrder
          updatedAt
          productsCount { count }
          ruleSet {
            appliedDisjunctively
            rules { column relation condition }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const GET_COLLECTION_QUERY = `
  query getCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      handle
      descriptionHtml
      sortOrder
      updatedAt
      seo { title description }
      productsCount { count }
      ruleSet {
        appliedDisjunctively
        rules { column relation condition }
      }
      products(first: 50) {
        edges {
          node {
            id title handle status vendor totalInventory
          }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
      metafields(first: 25) {
        edges {
          node { id namespace key value type }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
    }
  }
`;
