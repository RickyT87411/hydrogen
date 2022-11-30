import {useFetcher, useLocation, useMatches} from '@remix-run/react';
import {Heading, Button, IconCheck} from '~/components';
import {useCallback, useEffect, useRef} from 'react';
import {useInView} from 'react-intersection-observer';
import {CartBuyerIdentityUpdateForm} from '~/routes/__resources/cart/CartBuyerIdentityUpdate';
import type {Localizations, Locale} from '~/lib/type';
import clsx from 'clsx';

export function CountrySelector() {
  const [root] = useMatches();
  const fetcher = useFetcher();
  const closeRef = useRef<HTMLDetailsElement>(null);
  const selectedLocale = root.data.selectedLocale;
  const {pathname, search} = useLocation();
  const pathWithoutLocale = `${pathname.replace(
    selectedLocale.pathPrefix,
    '',
  )}${search}`;

  const countries = (fetcher.data ?? {}) as Localizations;
  const defaultLocale = countries?.['default'];
  const defaultLocalePrefix = defaultLocale
    ? `${defaultLocale?.language}-${defaultLocale?.country}`
    : '';

  const {ref, inView} = useInView({
    threshold: 0,
    triggerOnce: true,
  });

  // Get available countries list when in view
  useEffect(() => {
    if (!inView || fetcher.data || fetcher.state === 'loading') return;
    fetcher.load('/api/countries');
  }, [inView, fetcher]);

  const closeDropdown = useCallback(() => {
    closeRef.current?.removeAttribute('open');
  }, []);

  return (
    <section
      ref={ref}
      className="grid gap-4 w-full md:max-w-[335px] md:ml-auto"
      onMouseLeave={closeDropdown}
    >
      <Heading size="lead" className="cursor-default" as="h3">
        Country
      </Heading>
      <div className="relative">
        <details
          className="border rounded border-contrast/30 dark:border-white open:round-b-none"
          ref={closeRef}
        >
          <summary className="flex items-center justify-between w-full py-3 px-4 cursor-pointer">
            {selectedLocale.label}
          </summary>
          <div className="overflow-auto border-t py-2 bg-contrast w-full max-h-36">
            {countries &&
              Object.keys(countries).map((countryPath) => {
                const countryLocale = countries[countryPath];
                const isSelected =
                  countryLocale.language === selectedLocale.language &&
                  countryLocale.country === selectedLocale.country;

                const countryUrlPath = getCountryUrlPath({
                  countryLocale,
                  defaultLocalePrefix,
                  pathWithoutLocale,
                });

                return (
                  <Country
                    key={countryPath}
                    closeDropdown={closeDropdown}
                    countryUrlPath={countryUrlPath}
                    isSelected={isSelected}
                    countryLocale={countryLocale}
                  />
                );
              })}
          </div>
        </details>
      </div>
    </section>
  );
}

function Country({
  closeDropdown,
  countryLocale,
  countryUrlPath,
  isSelected,
}: {
  closeDropdown: () => void;
  countryLocale: Locale;
  countryUrlPath: string;
  isSelected: boolean;
}) {
  return (
    <CartBuyerIdentityUpdateForm
      key={countryLocale.country}
      redirectTo={countryUrlPath}
      buyerIdentity={{
        countryCode: countryLocale.country,
      }}
    >
      {() => (
        <Button
          className={clsx([
            'text-contrast dark:text-primary',
            'bg-primary dark:bg-contrast w-full p-2 transition rounded flex justify-start',
            'items-center text-left cursor-pointer py-2 px-4',
          ])}
          type="submit"
          variant="primary"
          onClick={closeDropdown}
        >
          {countryLocale.label}
          {isSelected ? (
            <span className="ml-2">
              <IconCheck />
            </span>
          ) : null}
        </Button>
      )}
    </CartBuyerIdentityUpdateForm>
  );
}

function getCountryUrlPath({
  countryLocale,
  defaultLocalePrefix,
  pathWithoutLocale,
}: {
  countryLocale: Locale;
  pathWithoutLocale: string;
  defaultLocalePrefix: string;
}) {
  let countryPrefixPath = '';
  const countryLocalePrefix = `${countryLocale.language}-${countryLocale.country}`;

  if (countryLocalePrefix !== defaultLocalePrefix) {
    countryPrefixPath = `/${countryLocalePrefix.toLowerCase()}`;
  }
  return `${countryPrefixPath}${pathWithoutLocale}`;
}
