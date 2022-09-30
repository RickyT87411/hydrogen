import type { StorefrontApiResponseOk } from "@shopify/hydrogen-ui-alpha/dist/types/storefront-api-response.types";
import type {
  Cart,
  CartInput,
  CartLineInput,
  CartLineUpdateInput,
  Collection,
  CollectionConnection,
  Product,
  ProductConnection,
  ProductVariant,
  SelectedOptionInput,
  LanguageCode,
  Blog,
  PageConnection,
  Shop,
  CustomerAccessTokenCreatePayload,
  Customer,
  CustomerUpdateInput,
  CustomerUpdatePayload,
  UserError,
} from "@shopify/hydrogen-ui-alpha/storefront-api-types";
import {
  getPublicTokenHeaders,
  getStorefrontApiUrl,
} from "~/lib/shopify-client";
import { type EnhancedMenu, parseMenu, getApiErrorMessage } from "~/lib/utils";
import invariant from "tiny-invariant";
import { logout } from "~/routes/account.logout";
import type { AppLoadContext } from "@remix-run/cloudflare";

type StorefrontApiResponse<T> = StorefrontApiResponseOk<T>;

export async function getStorefrontData<T>({
  query,
  variables,
}: {
  query: string;
  variables: Record<string, any>;
}): Promise<StorefrontApiResponse<T>> {
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
    const error = await response.text();

    /**
     * The Storefront API might return a string error, or a JSON-formatted {error: string}.
     * We try both and conform them to a single {errors} format.
     */
    try {
      return JSON.parse(error);
    } catch (_e) {
      return { errors: [{ message: error }] };
    }
  }

  return response.json() as StorefrontApiResponseOk<T>;
}

export interface LayoutData {
  headerMenu: EnhancedMenu;
  footerMenu: EnhancedMenu;
  shop: Shop;
  cart?: Promise<Cart>;
}

export async function getLayoutData() {
  const languageCode = "EN";

  const HEADER_MENU_HANDLE = "main-menu";
  const FOOTER_MENU_HANDLE = "footer";

  const { data } = await getStorefrontData<LayoutData>({
    query: LAYOUT_QUERY,
    variables: {
      language: languageCode,
      headerMenuHandle: HEADER_MENU_HANDLE,
      footerMenuHandle: FOOTER_MENU_HANDLE,
    },
  });

  invariant(data, "No data returned from Shopify API");

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

  const { data } = await getStorefrontData<{
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

  invariant(data, "No data returned from Shopify API");

  const { product, shop } = data;

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
      variants(first: 1) {
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

  const { data: products } = await getStorefrontData<{
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

  invariant(products, "No data returned from Shopify API");

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

  const { data } = await getStorefrontData<{
    collections: CollectionConnection;
  }>({
    query: COLLECTIONS_QUERY,
    variables: {
      pageBy: paginationSize,
      country: countryCode,
      language: languageCode,
    },
  });

  invariant(data, "No data returned from Shopify API");

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
  paginationSize = 48,
  cursor,
}: {
  handle: string;
  paginationSize?: number;
  cursor?: string;
}) {
  // TODO: You know what to do
  const languageCode = "EN";
  const countryCode = "US";

  const { data } = await getStorefrontData<{
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

  invariant(data, "No data returned from Shopify API");

  if (!data.collection) {
    throw new Response("Collection not found", { status: 404 });
  }

  return data.collection;
}

const ALL_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query AllProducts(
    $country: CountryCode
    $language: LanguageCode
    $pageBy: Int!
    $cursor: String
  ) @inContext(country: $country, language: $language) {
    products(first: $pageBy, after: $cursor) {
      nodes {
        ...ProductCard
      }
      pageInfo {
        hasNextPage
        startCursor
        endCursor
      }
    }
  }
`;

export async function getAllProducts({
  paginationSize = 48,
  cursor,
}: {
  paginationSize?: number;
  cursor?: string;
}) {
  // TODO: You know what to do
  const languageCode = "EN";
  const countryCode = "US";

  const { data } = await getStorefrontData<{
    products: ProductConnection;
  }>({
    query: ALL_PRODUCTS_QUERY,
    variables: {
      cursor,
      language: languageCode,
      country: countryCode,
      pageBy: paginationSize,
    },
  });

  invariant(data, "No data returned from Shopify API");

  return data.products;
}

const CART_FRAGMENT = `#graphql
fragment CartFragment on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
    customer {
      id
      email
      firstName
      lastName
      displayName
    }
    email
    phone
  }
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        attributes {
          key
          value
        }
        cost {
          totalAmount {
            amount
            currencyCode
          }
          compareAtAmountPerQuantity {
            amount
            currencyCode
          }
        }
        merchandise {
          ... on ProductVariant {
            id
            availableForSale
            compareAtPriceV2 {
              ...MoneyFragment
            }
            priceV2 {
              ...MoneyFragment
            }
            requiresShipping
            title
            image {
              ...ImageFragment
            }
            product {
              handle
              title
              id
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
  cost {
    subtotalAmount {
      ...MoneyFragment
    }
    totalAmount {
      ...MoneyFragment
    }
    totalDutyAmount {
      ...MoneyFragment
    }
    totalTaxAmount {
      ...MoneyFragment
    }
  }
  note
  attributes {
    key
    value
  }
  discountCodes {
    code
  }
}

fragment MoneyFragment on MoneyV2 {
  currencyCode
  amount
}
fragment ImageFragment on Image {
  id
  url
  altText
  width
  height
}
`;

const CREATE_CART_MUTATION = `#graphql
mutation CartCreate($input: CartInput!, $country: CountryCode = ZZ) @inContext(country: $country) {
  cartCreate(input: $input) {
    cart {
      id
    }
  }
}
`;

export async function createCart({ cart }: { cart: CartInput }) {
  // TODO: You know what to do
  const countryCode = "US";

  const { data } = await getStorefrontData<{
    cartCreate: {
      cart: Cart;
    };
  }>({
    query: CREATE_CART_MUTATION,
    variables: {
      input: cart,
      country: countryCode,
    },
  });

  invariant(data, "No data returned from Shopify API");

  return data.cartCreate.cart;
}

const ADD_LINE_ITEM_QUERY = `#graphql
  mutation CartLineAdd($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode = ZZ) @inContext(country: $country) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
      }
    }
  }
`;

export async function addLineItem({
  cartId,
  lines,
}: {
  cartId: string;
  lines: CartLineInput[];
}) {
  // TODO: You know what to do
  const countryCode = "US";

  const { data } = await getStorefrontData<{
    cartLinesAdd: {
      cart: Cart;
    };
  }>({
    query: ADD_LINE_ITEM_QUERY,
    variables: { cartId, lines, country: countryCode },
  });

  invariant(data, "No data returned from Shopify API");

  return data.cartLinesAdd.cart;
}

const CART_QUERY = `#graphql
  query CartQuery($cartId: ID!, $country: CountryCode = ZZ) @inContext(country: $country) {
    cart(id: $cartId) {
      ...CartFragment
    }
  }

  ${CART_FRAGMENT}
`;

export async function getCart({ cartId }: { cartId: string }) {
  // TODO: Yes
  const countryCode = "US";

  const { data } = await getStorefrontData<{ cart: Cart }>({
    query: CART_QUERY,
    variables: {
      cartId,
      country: countryCode,
    },
  });

  invariant(data, "No data returned from Shopify API");

  return data.cart;
}

const UPDATE_LINE_ITEM_QUERY = `#graphql
  mutation CartLineUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!, $country: CountryCode = ZZ) @inContext(country: $country) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFragment
      }
    }
  }

  ${CART_FRAGMENT}
`;

export async function updateLineItem({
  cartId,
  lineItem,
}: {
  cartId: string;
  lineItem: CartLineUpdateInput;
}) {
  const countryCode = "US";

  const { data } = await getStorefrontData<{ cartLinesUpdate: { cart: Cart } }>(
    {
      query: UPDATE_LINE_ITEM_QUERY,
      variables: {
        cartId,
        lines: [lineItem],
        country: countryCode,
      },
    }
  );

  invariant(data, "No data returned from Shopify API");

  return data.cartLinesUpdate.cart;
}

const TOP_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query topProducts(
    $count: Int
    $countryCode: CountryCode
    $languageCode: LanguageCode
  ) @inContext(country: $countryCode, language: $languageCode) {
    products(first: $count, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
`;

export async function getTopProducts({ count = 4 }: { count?: number } = {}) {
  const countryCode = "US";
  const languageCode = "EN";

  const { data } = await getStorefrontData<{
    products: ProductConnection;
  }>({
    query: TOP_PRODUCTS_QUERY,
    variables: {
      count,
      countryCode,
      languageCode,
    },
  });

  invariant(data, "No data returned from Shopify API");

  return data.products;
}

const SITEMAP_QUERY = `#graphql
  query sitemaps($urlLimits: Int, $language: LanguageCode)
  @inContext(language: $language) {
    products(
      first: $urlLimits
      query: "published_status:'online_store:visible'"
    ) {
      edges {
        node {
          updatedAt
          handle
          onlineStoreUrl
          title
          featuredImage {
            url
            altText
          }
        }
      }
    }
    collections(
      first: $urlLimits
      query: "published_status:'online_store:visible'"
    ) {
      edges {
        node {
          updatedAt
          handle
          onlineStoreUrl
        }
      }
    }
    pages(first: $urlLimits, query: "published_status:'published'") {
      edges {
        node {
          updatedAt
          handle
          onlineStoreUrl
        }
      }
    }
  }
`;

interface SitemapQueryData {
  products: ProductConnection;
  collections: CollectionConnection;
  pages: PageConnection;
}

export async function getSitemap(variables: {
  language: string;
  urlLimits: number;
}) {
  const { data } = await getStorefrontData<SitemapQueryData>({
    query: SITEMAP_QUERY,
    variables,
  });

  invariant(data, "Sitemap data is missing");

  return data;
}

const BLOG_QUERY = `#graphql
query Blog(
  $language: LanguageCode
  $blogHandle: String!
  $pageBy: Int!
  $cursor: String
) @inContext(language: $language) {
  blog(handle: $blogHandle) {
    articles(first: $pageBy, after: $cursor) {
      edges {
        node {
          author: authorV2 {
            name
          }
          contentHtml
          handle
          id
          image {
            id
            altText
            url
            width
            height
          }
          publishedAt
          title
        }
      }
    }
  }
}
`;

export async function getBlog({
  language,
  paginationSize,
  blogHandle,
}: {
  language: LanguageCode;
  blogHandle: string;
  paginationSize: number;
}) {
  const { data } = await getStorefrontData<{
    blog: Blog;
  }>({
    query: BLOG_QUERY,
    variables: {
      language,
      blogHandle,
      pageBy: paginationSize,
    },
  });

  invariant(data, "No data returned from Shopify API");

  return data.blog.articles;
}

const ARTICLE_QUERY = `#graphql
  query ArticleDetails(
    $language: LanguageCode
    $blogHandle: String!
    $articleHandle: String!
  ) @inContext(language: $language) {
    blog(handle: $blogHandle) {
      articleByHandle(handle: $articleHandle) {
        title
        contentHtml
        publishedAt
        author: authorV2 {
          name
        }
        image {
          id
          altText
          url
          width
          height
        }
      }
    }
  }
`;

export async function getArticle(variables: {
  language: LanguageCode;
  blogHandle: string;
  articleHandle: string;
}) {
  const { data } = await getStorefrontData<{
    blog: Blog;
  }>({
    query: ARTICLE_QUERY,
    variables,
  });

  invariant(data, "No data returned from Shopify API");

  return data.blog.articleByHandle;
}

const LOGIN_MUTATION = `#graphql
  mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
    customerAccessTokenCreate(input: $input) {
      customerUserErrors {
        code
        field
        message
      }
      customerAccessToken {
        accessToken
        expiresAt
      }
    }
  }
`;

export class StorefrontApiError extends Error {}

export async function login({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const { data, errors } = await getStorefrontData<{
    customerAccessTokenCreate: CustomerAccessTokenCreatePayload;
  }>({
    query: LOGIN_MUTATION,
    variables: {
      input: {
        email,
        password,
      },
    },
  });

  /**
   * Something is wrong with the API.
   */
  if (errors) {
    throw new StorefrontApiError(errors.map((e) => e.message).join(", "));
  }

  if (data?.customerAccessTokenCreate?.customerAccessToken?.accessToken) {
    return data.customerAccessTokenCreate.customerAccessToken.accessToken;
  }

  /**
   * Something is wrong with the user's input.
   */
  throw new Error(
    data?.customerAccessTokenCreate?.customerUserErrors.join(", ")
  );
}

const CUSTOMER_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query CustomerDetails(
    $customerAccessToken: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    customer(customerAccessToken: $customerAccessToken) {
      firstName
      lastName
      phone
      email
      defaultAddress {
        id
        formatted
      }
      addresses(first: 6) {
        edges {
          node {
            id
            formatted
            firstName
            lastName
            company
            address1
            address2
            country
            province
            city
            zip
            phone
          }
        }
      }
      orders(first: 250, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            id
            orderNumber
            processedAt
            financialStatus
            fulfillmentStatus
            currentTotalPrice {
              amount
              currencyCode
            }
            lineItems(first: 2) {
              edges {
                node {
                  variant {
                    image {
                      url
                      altText
                      height
                      width
                    }
                  }
                  title
                }
              }
            }
          }
        }
      }
    }
    featuredProducts: products(first: 12) {
      nodes {
        ...ProductCard
      }
    }
    featuredCollections: collections(first: 3, sortKey: UPDATED_AT) {
      nodes {
        id
        title
        handle
        image {
          altText
          width
          height
          url
        }
      }
    }
  }
`;

export async function getCustomer({
  request,
  context,
  customerAccessToken,
}: {
  request: Request;
  context: AppLoadContext;
  customerAccessToken: string;
}) {
  const countryCode = "US";
  const languageCode = "EN";

  const { data } = await getStorefrontData<{
    customer: Customer;
  }>({
    query: CUSTOMER_QUERY,
    variables: {
      customerAccessToken,
      country: countryCode,
      language: languageCode,
    },
  });

  /**
   * If the customer failed to load, we assume their access token is invalid.
   */
  if (!data) {
    throw logout(request, context);
  }

  return data.customer;
}

const CUSTOMER_UPDATE_MUTATION = `#graphql
  mutation customerUpdate($customerAccessToken: String!, $customer: CustomerUpdateInput!) {
    customerUpdate(customerAccessToken: $customerAccessToken, customer: $customer) {
      customerUserErrors {
        code
        field
        message
      }
    }
  }
  `;

export async function updateCustomer({
  customerAccessToken,
  customer,
}: {
  customerAccessToken: string;
  customer: CustomerUpdateInput;
}): Promise<void> {
  const { data, errors } = await getStorefrontData<{
    customerUpdate: CustomerUpdatePayload;
  }>({
    query: CUSTOMER_UPDATE_MUTATION,
    variables: {
      customerAccessToken,
      customer,
    },
  });

  console.log(JSON.stringify({ customer, data }));

  const error = getApiErrorMessage(
    "customerUpdate",
    data,
    errors as UserError[]
  );

  if (error) {
    throw new Error(error);
  }
}
