---
'@shopify/hydrogen-react': major
'@shopify/hydrogen': major
---

The Storefront API types included are now generated using `@graphql-codegen/typescript@4` ([changelog](https://github.com/dotansimha/graphql-code-generator/blob/master/packages/plugins/typescript/typescript/CHANGELOG.md#400)). This results in a breaking change if you were importing `Scalars` directly from `@shopify/hydrogen-react` or `@shopify/hydrogen`:

```diff
 import type {Scalars} from '@shopify/hydrogen/storefront-api-types';

 type Props = {
-  id: Scalars['ID']; // This was a string
+  id: Scalars['ID']['input']; // Need to access 'input' or 'output' to get the string
 };
```
