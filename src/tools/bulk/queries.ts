function productsArgs(filter?: string): string {
  if (!filter) return "";
  const escaped = filter.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `(query: "${escaped}")`;
}

export function productsCoreVariantsQuery(filter?: string): string {
  return `
    {
      products${productsArgs(filter)} {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            vendor
            productType
            status
            tags
            createdAt
            updatedAt
            publishedAt
            onlineStoreUrl
            totalInventory
            seo { title description }
            category { name }
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            options { id name values }
            variants {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity
                  selectedOptions { name value }
                  inventoryItem {
                    unitCost { amount currencyCode }
                    measurement { weight { value unit } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

export function productsMediaMetaCollectionsQuery(filter?: string): string {
  return `
    {
      products${productsArgs(filter)} {
        edges {
          node {
            id
            media {
              edges {
                node {
                  mediaContentType
                  ... on MediaImage {
                    id
                    image { url altText width height }
                  }
                }
              }
            }
            metafields {
              edges {
                node { id namespace key value type }
              }
            }
            collections {
              edges {
                node { id title handle }
              }
            }
          }
        }
      }
    }
  `;
}

export const BULK_EXPORT_QUERY_1 = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

export const GET_BULK_OPERATION_QUERY = `
  query getBulkOperation($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        objectCount
        url
        partialDataUrl
        createdAt
        completedAt
      }
    }
  }
`;

export const STAGED_UPLOADS_CREATE_MUTATION = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

export const BULK_MUTATION_RUN = `
  mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!) {
    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_SET_BULK_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(synchronous: false, input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;
