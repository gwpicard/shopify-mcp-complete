export const GET_PRODUCT_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
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
      compareAtPriceRange {
        minVariantCompareAtPrice { amount currencyCode }
        maxVariantCompareAtPrice { amount currencyCode }
      }
      options { id name values }
      sellingPlanGroups(first: 10) {
        edges {
          node { id name summary }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id title sku barcode price compareAtPrice
            weight weightUnit inventoryQuantity
            selectedOptions { name value }
            inventoryItem {
              unitCost { amount currencyCode }
            }
          }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
      media(first: 50) {
        edges {
          node {
            mediaContentType
            ... on MediaImage {
              id
              image { url altText width height }
            }
            ... on Video {
              id
              sources { url mimeType }
            }
            ... on ExternalVideo {
              id
              originUrl
            }
            ... on Model3d {
              id
              sources { url mimeType }
            }
          }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
      metafields(first: 50) {
        edges {
          node { id namespace key value type }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
      collections(first: 50) {
        edges {
          node { id title handle }
        }
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      }
    }
  }
`;

export const LIST_PRODUCTS_QUERY = `
  query listProducts($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          title
          handle
          status
          vendor
          productType
          tags
          createdAt
          updatedAt
          totalInventory
          variantsCount: variantsCount { count }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
    }
  }
`;

export const COUNT_PRODUCTS_QUERY = `
  query countProducts($query: String) {
    productsCount(query: $query) {
      count
    }
  }
`;

export const PRODUCT_SET_MUTATION = `
  mutation productSet($synchronous: Boolean!, $input: ProductSetInput!) {
    productSet(synchronous: $synchronous, input: $input) {
      product {
        id title handle status
      }
      userErrors { field message code }
    }
  }
`;

export const DELETE_PRODUCT_MUTATION = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

export const CREATE_MEDIA_MUTATION = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage { id image { url altText } }
      }
      mediaUserErrors { field message }
    }
  }
`;

export const DELETE_MEDIA_MUTATION = `
  mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message }
    }
  }
`;

export const VARIANT_BULK_CREATE_MUTATION = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title sku price }
      userErrors { field message }
    }
  }
`;

export const VARIANT_BULK_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id title sku price }
      userErrors { field message }
    }
  }
`;

export const VARIANT_BULK_DELETE_MUTATION = `
  mutation productVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      productVariants { id title }
      userErrors { field message }
    }
  }
`;
