import type {
  StorefrontApiResponseError,
  StorefrontApiResponseOk,
} from "@shopify/hydrogen-ui-alpha/dist/types/storefront-api-response.types";
import type {
  Collection,
  CollectionConnection,
  Product,
  ProductConnection,
  ProductVariant,
  SelectedOptionInput,
  Shop,
} from "@shopify/hydrogen-ui-alpha/storefront-api-types";
import {
  getPublicTokenHeaders,
  getStorefrontApiUrl,
} from "~/lib/shopify-client";
import { type EnhancedMenu, parseMenu } from "~/lib/utils";
import invariant from "tiny-invariant";

export async function getStorefrontData<T>({
  query,
  variables,
}: {
  query: string;
  variables: Record<string, any>;
}): Promise<T> {
  const headers = getPublicTokenHeaders();
  // This needs to be application/json because we're sending JSON, not a graphql string
  headers["content-type"] = "application/json";

  const response = await fetch(getStorefrontApiUrl(), {
    body: JSON.stringify({
      query,
      variables,
    }),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    // 400 or 500 level error
    return (await response.text()) as StorefrontApiResponseError; // or apiResponse.json()
  }

  const json: StorefrontApiResponseOk<T> = await response.json();

  if (json.errors) {
    console.log(json.errors);
  }

  invariant(json && json.data, "No data returned from Shopify API");

  return json.data;
}

export interface LayoutData {
  headerMenu: EnhancedMenu;
  footerMenu: EnhancedMenu;
  shop: Shop;
}

export async function getLayoutData() {
  const languageCode = "EN";

  const HEADER_MENU_HANDLE = "main-menu";
  const FOOTER_MENU_HANDLE = "footer";

  const data = await getStorefrontData<LayoutData>({
    query: LAYOUT_QUERY,
    variables: {
      language: languageCode,
      headerMenuHandle: HEADER_MENU_HANDLE,
      footerMenuHandle: FOOTER_MENU_HANDLE,
    },
  });

  /*
    Modify specific links/routes (optional)
    @see: https://shopify.dev/api/storefront/unstable/enums/MenuItemType
    e.g here we map:
      - /blogs/news -> /news
      - /blog/news/blog-post -> /news/blog-post
      - /collections/all -> /products
  */
  const customPrefixes = { BLOG: "", CATALOG: "products" };

  const headerMenu = data?.headerMenu
    ? parseMenu(data.headerMenu, customPrefixes)
    : undefined;

  const footerMenu = data?.footerMenu
    ? parseMenu(data.footerMenu, customPrefixes)
    : undefined;

  return { shop: data.shop, headerMenu, footerMenu };
}

const LAYOUT_QUERY = `#graphql
  query layoutMenus(
    $language: LanguageCode
    $headerMenuHandle: String!
    $footerMenuHandle: String!
  ) @inContext(language: $language) {
    shop {
      name
    }
    headerMenu: menu(handle: $headerMenuHandle) {
      id
      items {
        ...MenuItem
        items {
          ...MenuItem
        }
      }
    }
    footerMenu: menu(handle: $footerMenuHandle) {
      id
      items {
        ...MenuItem
        items {
          ...MenuItem
        }
      }
    }
  }
  fragment MenuItem on MenuItem {
    id
    resourceId
    tags
    title
    type
    url
  }
`;

export async function getProductData(
  handle: string,
  searchParams: URLSearchParams
) {
  // TODO: Figure out localization stuff
  const languageCode = "EN";
  const countryCode = "US";

  let selectedOptions: SelectedOptionInput[] = [];
  searchParams.forEach((value, name) => {
    selectedOptions.push({ name, value });
  });

  const { product, shop } = await getStorefrontData<{
    product: Product & { selectedVariant?: ProductVariant };
    shop: Shop;
  }>({
    query: PRODUCT_QUERY,
    variables: {
      country: countryCode,
      language: languageCode,
      selectedOptions,
      handle,
    },
  });

  if (!product) {
    throw new Response("Uh ohhhhh", { status: 404 });
  }

  return { product, shop };
}

const MEDIA_FRAGMENT = `#graphql
  fragment Media on Media {
    mediaContentType
    alt
    previewImage {
      url
    }
    ... on MediaImage {
      id
      image {
        url
        width
        height
      }
    }
    ... on Video {
      id
      sources {
        mimeType
        url
      }
    }
    ... on Model3d {
      id
      sources {
        mimeType
        url
      }
    }
    ... on ExternalVideo {
      id
      embedUrl
      host
    }
  }
`;

const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCard on Product {
    id
    title
    publishedAt
    handle
    variants(first: 1) {
      nodes {
        id
        image {
          url
          altText
          width
          height
        }
        priceV2 {
          amount
          currencyCode
        }
        compareAtPriceV2 {
          amount
          currencyCode
        }
      }
    }
  }
`;

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariantFragment on ProductVariant {
    id
    availableForSale
    selectedOptions {
      name
      value
    }
    image {
      id
      url
      altText
      width
      height
    }
    priceV2 {
      amount
      currencyCode
    }
    compareAtPriceV2 {
      amount
      currencyCode
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  ${MEDIA_FRAGMENT}
  ${PRODUCT_VARIANT_FRAGMENT}
  query Product(
    $country: CountryCode
    $language: LanguageCode
    $handle: String!
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      vendor
      descriptionHtml
      options {
        name
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        ...ProductVariantFragment
      }
      media(first: 7) {
        nodes {
          ...Media
        }
      }
      variants(first: 100) {
        nodes {
          ...ProductVariantFragment
        }
      }
      seo {
        description
        title
      }
    }
    shop {
      shippingPolicy {
        body
        handle
      }
      refundPolicy {
        body
        handle
      }
    }
  }
`;

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query productRecommendations(
    $productId: ID!
    $count: Int
    $countryCode: CountryCode
    $languageCode: LanguageCode
  ) @inContext(country: $countryCode, language: $languageCode) {
    recommended: productRecommendations(productId: $productId) {
      ...ProductCard
    }
    additional: products(first: $count, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
`;

export async function getRecommendedProducts(productId: string, count = 12) {
  // TODO: You know what to do
  const languageCode = "EN";
  const countryCode = "US";

  const products = await getStorefrontData<{
    recommended: Product[];
    additional: ProductConnection;
  }>({
    query: RECOMMENDED_PRODUCTS_QUERY,
    variables: {
      productId,
      count,
      language: languageCode,
      country: countryCode,
    },
  });

  const mergedProducts = products.recommended
    .concat(products.additional.nodes)
    .filter(
      (value, index, array) =>
        array.findIndex((value2) => value2.id === value.id) === index
    );

  const originalProduct = mergedProducts
    .map((item) => item.id)
    .indexOf(productId);

  mergedProducts.splice(originalProduct, 1);

  return mergedProducts;
}

const COLLECTIONS_QUERY = `#graphql
  query Collections(
    $country: CountryCode
    $language: LanguageCode
    $pageBy: Int!
  ) @inContext(country: $country, language: $language) {
    collections(first: $pageBy) {
      nodes {
        id
        title
        description
        handle
        seo {
          description
          title
        }
        image {
          id
          url
          width
          height
          altText
        }
      }
    }
  }
`;

export async function getCollections(
  { paginationSize } = { paginationSize: 8 }
) {
  // TODO: You know what to do
  const languageCode = "EN";
  const countryCode = "US";

  const data = await getStorefrontData<{
    collections: CollectionConnection;
  }>({
    query: COLLECTIONS_QUERY,
    variables: {
      pageBy: paginationSize,
      country: countryCode,
      language: languageCode,
    },
  });

  return data.collections.nodes;
}

const COLLECTION_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query CollectionDetails(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $pageBy: Int!
    $cursor: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      seo {
        description
        title
      }
      image {
        id
        url
        width
        height
        altText
      }
      products(first: $pageBy, after: $cursor) {
        nodes {
          ...ProductCard
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export async function getCollection({
  handle,
  paginationSize = 8,
  cursor,
}: {
  handle: string;
  paginationSize?: number;
  cursor?: string;
}) {
  console.log({ cursor });
  // TODO: You know what to do
  const languageCode = "EN";
  const countryCode = "US";

  const data = await getStorefrontData<{
    collection: Collection;
  }>({
    query: COLLECTION_QUERY,
    variables: {
      handle,
      cursor,
      language: languageCode,
      country: countryCode,
      pageBy: paginationSize,
    },
  });

  if (!data.collection) {
    throw new Response("Collection not found", { status: 404 });
  }

  return data.collection;
}
