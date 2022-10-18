import {defer, type LoaderArgs} from '@hydrogen/remix';
import {Await, Form, useLoaderData} from '@remix-run/react';
import type {Collection} from '@shopify/hydrogen-ui-alpha/storefront-api-types';
import {Suspense} from 'react';
import {
  Heading,
  Input,
  PageHeader,
  ProductGrid,
  ProductSwimlane,
  FeaturedCollections,
  Section,
  Text,
} from '~/components';
import {getNoResultRecommendations, searchProducts} from '~/data';
import {PAGINATION_SIZE} from '~/lib/const';

export default function () {
  const {searchTerm, products, noResultRecommendations} = useLoaderData();
  const noResults = products?.nodes?.length === 0;

  return (
    <>
      <PageHeader>
        <Heading as="h1" size="copy">
          Search
        </Heading>
        <Form method="get" className="relative flex w-full text-heading">
          <Input
            defaultValue={searchTerm}
            placeholder="Search…"
            type="search"
            variant="search"
            name="q"
          />
          <button className="absolute right-0 py-2" type="submit">
            Go
          </button>
        </Form>
      </PageHeader>
      {!searchTerm || noResults ? (
        <>
          {noResults && (
            <Section padding="x">
              <Text className="opacity-50">
                No results, try something else.
              </Text>
            </Section>
          )}
          <Suspense>
            <Await
              errorElement="There was a problem loading related products"
              resolve={noResultRecommendations}
            >
              {(data) => (
                <>
                  <FeaturedCollections
                    title="Trending Collections"
                    collections={data.featuredCollections.nodes}
                  />
                  <ProductSwimlane
                    title="Trending Products"
                    products={data.featuredProducts.nodes}
                  />
                </>
              )}
            </Await>
          </Suspense>
        </>
      ) : (
        <Section>
          <ProductGrid
            key="search"
            url={`/search?q=${searchTerm}`}
            collection={{products} as Collection}
          />
        </Section>
      )}
    </>
  );
}

export async function loader({request, context, params}: LoaderArgs) {
  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get('cursor')!;
  const searchTerm = searchParams.get('q')!;

  const products = await searchProducts(params, {
    cursor,
    searchTerm,
    pageBy: PAGINATION_SIZE,
  });

  const getRecommendations = !searchTerm || products?.nodes?.length === 0;

  return defer({
    searchTerm,
    products,
    noResultRecommendations: getRecommendations
      ? getNoResultRecommendations(params)
      : null,
  });
}
