export const SHOP_INFO_QUERY = `
  query shopInfo {
    shop {
      name
      email
      myshopifyDomain
      plan { displayName }
      primaryDomain { url }
      contactEmail
      billingAddress {
        address1 address2 city
        province country zip phone company
      }
      timezoneAbbreviation
      currencyCode
      weightUnit
    }
  }
`;

export const TAGS_ADD_MUTATION = `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

export const TAGS_REMOVE_MUTATION = `
  mutation tagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;
