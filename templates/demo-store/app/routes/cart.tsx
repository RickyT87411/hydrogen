import {
  type LoaderArgs,
  type ActionFunction,
  json,
  defer,
} from '@shopify/hydrogen-remix';
import invariant from 'tiny-invariant';
import {getTopProducts, updateLineItem} from '~/data';

export async function loader({context}: LoaderArgs) {
  return defer(
    {
      topProducts: getTopProducts(context, {}),
    },
    {
      headers: {
        'Cache-Control': 'max-age=600',
      },
    },
  );
}

export const action: ActionFunction = async ({request, context}) => {
  let cart;

  const formData = new URLSearchParams(await request.text());

  const redirectTo = formData.get('redirectTo');
  const intent = formData.get('intent');
  invariant(intent, 'Missing cart intent');

  // 1. Grab the cart ID from the session
  const cartId = await context.session.get('cartId');

  switch (intent) {
    case 'set-quantity': {
      const lineId = formData.get('lineId');
      invariant(lineId, 'Missing lineId');
      invariant(cartId, 'Missing cartId');
      const quantity = Number(formData.get('quantity'));
      cart = await updateLineItem(context, {
        cartId,
        lineItem: {id: lineId, quantity},
      });
      return json({cart});
    }

    default: {
      throw new Error(`Cart intent ${intent} not supported`);
    }
  }
};

export default function Cart() {
  return <h1>Todo: Build a cart here</h1>;
}
