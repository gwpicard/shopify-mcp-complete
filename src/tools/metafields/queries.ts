export const GET_METAFIELDS_QUERY = `
  query getMetafields($id: ID!, $first: Int!, $after: String, $namespace: String) {
    node(id: $id) {
      ... on HasMetafields {
        metafields(first: $first, after: $after, namespace: $namespace) {
          edges {
            node {
              id namespace key value type
              createdAt updatedAt
            }
          }
          pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
        }
      }
    }
  }
`;

export const SET_METAFIELDS_MUTATION = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message }
    }
  }
`;

export const DELETE_METAFIELD_MUTATION = `
  mutation metafieldDelete($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

export const GET_METAFIELD_DEFINITIONS_QUERY = `
  query getMetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after) {
      edges {
        node {
          id name namespace key
          type { name }
          description
          validations { name type value }
          pinnedPosition
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;
