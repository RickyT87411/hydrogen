import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {AdminSession} from '@shopify/cli-kit/node/session';
import {mockAndCaptureOutput} from '@shopify/cli-kit/node/testing/output';
import {getStorefrontsWithDeployment} from '../../lib/graphql/admin/list-storefronts.js';
import {formatDeployment, listStorefronts} from './list.js';

const SHOP_NAME = 'my-shop';
vi.mock('../../lib/graphql/admin/list-storefronts.js', async () => {
  return {getStorefrontsWithDeployment: vi.fn()};
});
vi.mock('../../lib/shop.js', () => ({
  getHydrogenShop: () => SHOP_NAME,
}));

describe('list', () => {
  const ADMIN_SESSION: AdminSession = {
    token: 'abc123',
    storeFqdn: SHOP_NAME,
  };

  beforeEach(async () => {
    vi.mocked(getStorefrontsWithDeployment).mockResolvedValue({
      adminSession: ADMIN_SESSION,
      storefronts: [],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockAndCaptureOutput().clear();
  });

  it('makes a GraphQL call to fetch the storefronts', async () => {
    await listStorefronts({});

    expect(getStorefrontsWithDeployment).toHaveBeenCalledWith(SHOP_NAME);
  });

  describe('and there are storefronts', () => {
    beforeEach(() => {
      vi.mocked(getStorefrontsWithDeployment).mockResolvedValue({
        adminSession: ADMIN_SESSION,
        storefronts: [
          {
            id: 'gid://shopify/HydrogenStorefront/1',
            parsedId: '1',
            title: 'Hydrogen',
            productionUrl: 'https://example.com',
            currentProductionDeployment: null,
          },
          {
            id: 'gid://shopify/HydrogenStorefront/2',
            parsedId: '2',
            title: 'Demo Store',
            productionUrl: 'https://demo.example.com',
            currentProductionDeployment: {
              id: 'gid://shopify/HydrogenStorefrontDeployment/1',
              createdAt: '2023-03-22T22:28:38Z',
              commitMessage: 'Update README.md',
            },
          },
        ],
      });
    });

    it('renders a list of storefronts', async () => {
      const outputMock = mockAndCaptureOutput();

      await listStorefronts({});

      expect(outputMock.info()).toMatch(
        /Showing 2 Hydrogen storefronts for the store my-shop/g,
      );
      expect(outputMock.info()).toMatch(/Hydrogen \(id: 1\)/g);
      expect(outputMock.info()).toMatch(/https:\/\/example.com/g);
      expect(outputMock.info()).toMatch(/Demo Store \(id: 2\)/g);
      expect(outputMock.info()).toMatch(/https:\/\/demo.example.com/g);
      expect(outputMock.info()).toMatch(/3\/22\/2023, Update README.md/g);
    });
  });

  describe('and there are no storefronts', () => {
    it('prompts the user to create a storefront', async () => {
      const outputMock = mockAndCaptureOutput();

      await listStorefronts({});

      expect(outputMock.info()).toMatch(
        /There are no Hydrogen storefronts on your Shop\./g,
      );
      expect(outputMock.info()).toMatch(/Create a new Hydrogen storefront/g);
      expect(outputMock.info()).toMatch(
        /https:\/\/my\-shop\/admin\/custom_storefronts\/new/g,
      );
    });
  });
});

describe('formatDeployment', () => {
  const createdAt = '2023-03-22T22:28:38Z';

  it('returns a string combined with a date and commit message', () => {
    const deployment = {
      id: 'gid://shopify/HydrogenStorefrontDeployment/1',
      createdAt,
      commitMessage:
        'Update README.md\n\nThis is a description of why the change was made.',
    };

    expect(formatDeployment(deployment)).toStrictEqual(
      '3/22/2023, Update README.md',
    );
  });

  describe('when there is no commit message', () => {
    it('only returns the date', () => {
      const deployment = {
        id: 'gid://shopify/HydrogenStorefrontDeployment/1',
        parsedId: '1',
        createdAt,
        commitMessage: null,
      };

      expect(formatDeployment(deployment)).toStrictEqual('3/22/2023');
    });
  });
});
