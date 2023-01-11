// Virtual entry point for the app
import * as remixBuild from '@remix-run/dev/server-build';
import {createRequestHandler, getBuyerIp} from '@shopify/remix-oxygen';
import {createStorefrontClient, maybeRedirect} from '@shopify/hydrogen';
import {HydrogenSession} from '~/lib/session.server';
import {getLocaleFromRequest} from '~/lib/utils';

/**
 * A global `process` object is only available during build to access NODE_ENV.
 */
declare const process: {env: {NODE_ENV: string}};

/**
 * Export a fetch handler in module format.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    try {
      /**
       * Open a cache instance in the worker and a custom session instance.
       */
      if (!env?.SESSION_SECRET) {
        throw new Error('SESSION_SECRET environment variable is not set');
      }

      const waitUntil = (p: Promise<any>) => executionContext.waitUntil(p);
      const [cache, session] = await Promise.all([
        caches.open('hydrogen'),
        HydrogenSession.init(request, [env.SESSION_SECRET]),
      ]);

      /**
       * Create Hydrogen's Storefront client
       */
      const {storefront} = createStorefrontClient({
        cache,
        waitUntil,
        buyerIp: getBuyerIp(request),
        i18n: getLocaleFromRequest(request),
        publicStorefrontToken: env.PUBLIC_STOREFRONT_API_TOKEN,
        privateStorefrontToken: env.PRIVATE_STOREFRONT_API_TOKEN,
        storeDomain: env.PUBLIC_STORE_DOMAIN,
        storefrontApiVersion: env.PUBLIC_STOREFRONT_API_VERSION || '2022-10',
      });

      /**
       * Create a Remix request handler and pass
       * Hydrogen's Storefront client to the loader context.
       */
      const handleRequest = createRequestHandler({
        build: remixBuild,
        mode: process.env.NODE_ENV,
        getLoadContext: () => ({cache, session, waitUntil, storefront, env}),
      });

      const response = await handleRequest(request);

      if (response.status === 404) {
        return await maybeRedirect({request, response, storefront});
      }

      return response;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return new Response('An unexpected error occurred', {status: 500});
    }
  },
};
