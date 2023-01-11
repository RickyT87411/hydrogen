import {redirect} from '@remix-run/server-runtime';
import type {Storefront} from '../storefront';

export async function notFoundMaybeRedirect(
  request: Request,
  context: {storefront: Storefront},
): Promise<Response> {
  const {pathname, search} = new URL(request.url);
  const {urlRedirects} = await context.storefront.query<{
    urlRedirects: {
      edges: Array<{node: {target: string}}>;
    };
  }>(REDIRECT_QUERY, {
    variables: {
      url: pathname + search,
    },
    storefrontApiVersion: '2023-01',
  });

  if (urlRedirects?.edges?.length) {
    return new Response(null, {
      status: 302,
      headers: {
        location: urlRedirects.edges[0]?.node?.target!,
      },
    });
  } else {
    const searchParams = new URLSearchParams(search);
    const redirectPath =
      searchParams.get('return_to') || searchParams.get('redirect');

    if (redirectPath && isLocalPath(redirectPath)) {
      return redirect(redirectPath);
    }

    return new Response('Not found', {status: 404});
  }
}

function isLocalPath(url: string) {
  try {
    // We don't want to redirect cross domain,
    // doing so could create fishing vulnerability
    // If `new URL()` succeeds, it's a fully qualified
    // url which is cross domain. If it fails, it's just
    // a path, which will be the current domain.
    new URL(url);
  } catch (e) {
    return true;
  }

  return false;
}

const REDIRECT_QUERY = `#graphql
  query redirects($url:String) {
    urlRedirects(first: 1, query: $url) {
      edges {
        node {
          target
        }
      }
    }
  }
`;
