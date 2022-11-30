import clsx from 'clsx';
import {
  flattenConnection,
  Image,
  Money,
  useMoney,
} from '@shopify/hydrogen-react';
import {Text, Link} from '~/components';
import {isDiscounted, isNewArrival, variantToCartLine} from '~/lib/utils';
import {getProductPlaceholder} from '~/lib/placeholders';
import type {
  MoneyV2,
  Product,
  ProductVariant,
  ProductVariantConnection,
} from '@shopify/hydrogen-react/storefront-api-types';
import {SerializeFrom} from '@remix-run/server-runtime';
import {CartLinesAddForm} from '.hydrogen/cart';

export function ProductCard({
  product,
  label,
  className,
  loading,
  onClick,
}: {
  product: SerializeFrom<Product>;
  label?: string;
  className?: string;
  loading?: HTMLImageElement['loading'];
  onClick?: () => void;
}) {
  let cardLabel;

  const cartProduct = product?.variants ? product : getProductPlaceholder();
  if (!cartProduct?.variants?.nodes?.length) return null;

  const firstVariant = flattenConnection<ProductVariant>(
    cartProduct?.variants as ProductVariantConnection,
  )[0];

  if (!firstVariant) return null;
  const {image, price, compareAtPrice} = firstVariant;

  if (label) {
    cardLabel = label;
  } else if (isDiscounted(price as MoneyV2, compareAtPrice as MoneyV2)) {
    cardLabel = 'Sale';
  } else if (isNewArrival(product.publishedAt)) {
    cardLabel = 'New';
  }

  return (
    <div className="flex flex-col">
      <Link
        onClick={onClick}
        to={`/products/${product.handle}`}
        prefetch="intent"
      >
        <div className={clsx('grid gap-6', className)}>
          <div className="card-image aspect-[4/5] bg-primary/5">
            {image && (
              <Image
                className="aspect-[4/5] w-full object-cover fadeIn"
                widths={[320]}
                sizes="320px"
                loaderOptions={{
                  crop: 'center',
                  scale: 2,
                  width: 320,
                  height: 400,
                }}
                data={image}
                alt={image.altText || `Picture of ${product.title}`}
                loading={loading}
              />
            )}
            <Text
              as="label"
              size="fine"
              className="absolute top-0 right-0 m-4 text-right text-notice"
            >
              {cardLabel}
            </Text>
          </div>
          <div className="grid gap-1">
            <Text
              className="w-full overflow-hidden whitespace-nowrap text-ellipsis "
              as="h3"
            >
              {product.title}
            </Text>
            <div className="flex gap-4">
              <Text className="flex gap-4">
                <Money withoutTrailingZeros data={price!} />
                {isDiscounted(price as MoneyV2, compareAtPrice as MoneyV2) && (
                  <CompareAtPrice
                    className={'opacity-50'}
                    data={compareAtPrice as MoneyV2}
                  />
                )}
              </Text>
            </div>
          </div>
        </div>
      </Link>
      {firstVariant?.id && (
        <CartLinesAddForm
          lines={[
            {
              quantity: 1,
              merchandiseId: firstVariant.id,
            },
          ]}
          optimisticLines={[
            variantToCartLine({
              variant: firstVariant,
              quantity: 1,
            }),
          ]}
        >
          {() => <button type="submit">Add to Cart</button>}
        </CartLinesAddForm>
      )}
    </div>
  );
}

function CompareAtPrice({
  data,
  className,
}: {
  data: MoneyV2;
  className?: string;
}) {
  const {currencyNarrowSymbol, withoutTrailingZerosAndCurrency} =
    useMoney(data);

  const styles = clsx('strike', className);

  return (
    <span className={styles}>
      {currencyNarrowSymbol}
      {withoutTrailingZerosAndCurrency}
    </span>
  );
}
