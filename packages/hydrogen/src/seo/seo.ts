import type {
  BaseSeo,
  Seo,
  HeadTag,
  SchemaType,
  LanguageAlternate,
  MobileAlternate,
} from './types';
import type {WithContext} from 'schema-dts';

export function generateSeoTags<T extends BaseSeo = Seo>(input: T) {
  const output: HeadTag[] = [];
  let ldJson: WithContext<any> = {
    '@context': 'https://schema.org',
    '@type': 'Thing',
  };

  for (const tag of Object.keys(input)) {
    const values = Array.isArray(input[tag as keyof T])
      ? (input[tag as keyof T] as [keyof T][])
      : [input[tag as keyof T]];

    const tags = values.map((value) => {
      const tagResults: any[] = [];

      if (!value) {
        return tagResults;
      }

      switch (tag) {
        case 'title':
          const title = renderTitle(input.titleTemplate, value as string);

          tagResults.push(
            generateTag('title', title),
            generateTag('meta', {property: 'og:title', content: title}),
            generateTag('meta', {name: 'twitter:title', content: title}),
          );

          ldJson.name = title;

          break;

        case 'description':
          tagResults.push(
            generateTag('meta', {name: 'description', content: value}),
            generateTag('meta', {property: 'og:description', content: value}),
            generateTag('meta', {name: 'twitter:description', content: value}),
          );

          ldJson.description = value;

          break;

        case 'url':
          tagResults.push(
            generateTag('meta', {property: 'og:url', content: value}),
            generateTag('link', {rel: 'canonical', href: value}),
          );

          ldJson.url = value;
          ldJson['@type'] = inferSchemaType(value as string);

          break;

        case 'handle':
          tagResults.push(
            generateTag('meta', {name: 'twitter:site', content: value}),
            generateTag('meta', {name: 'twitter:creator', content: value}),
          );

          break;

        case 'ldJson':
          ldJson = {...ldJson, ...value};
          break;

        case 'media':
          const values: any = Array.isArray(value) ? value : [value];

          for (const media of values) {
            if (typeof media === 'string') {
              tagResults.push(
                generateTag('meta', {name: 'og:image', content: value}),
              );

              ldJson.image = value;
            }

            if (media && typeof media === 'object') {
              const type = media.type || 'image';

              // Order matters here when adding multiple media tags
              // @see https://ogp.me/#array
              const normalizedMedia = media
                ? {
                    url: media?.url,
                    secure_url: media?.url,
                    type: inferMimeType(media?.url),
                    width: media?.width,
                    height: media?.height,
                    alt: media?.alt,
                  }
                : {};

              for (const key of Object.keys(normalizedMedia)) {
                if (normalizedMedia[key as keyof typeof normalizedMedia]) {
                  tagResults.push(
                    generateTag(
                      'meta',
                      {
                        property: `og:${type}:${key}`,
                        content:
                          normalizedMedia[key as keyof typeof normalizedMedia],
                      },
                      normalizedMedia.url,
                    ),
                  );
                }
              }
            }
          }
          break;

        case 'alternates':
          const alternates = Array.isArray(value) ? value : [value];

          for (const alternate of alternates) {
            const {
              // @ts-expect-error untyped
              language,
              // @ts-expect-error untyped
              media,
              url,
              // @ts-expect-error untyped
              default: defaultLang,
            } = alternate as Seo['alternates'][0];

            const hreflang = language
              ? `${language}${defaultLang ? '-default' : ''}`
              : undefined;

            tagResults.push(
              generateTag('link', {
                rel: 'alternate',
                hreflang,
                media,
                href: url,
              }),
            );
          }

          break;
      }

      return tagResults;
    });

    const entries = tags.flat();

    output.push(
      // @ts-expect-error untyped
      entries.filter((value) => !!value),
    );
  }

  const additionalTags = [
    generateTag('meta', {property: 'og:type', content: 'website'}),
    generateTag('meta', {
      name: 'twitter:card',
      content: 'summary_large_image',
    }),
  ];

  return [...output, ...additionalTags]
    .flat()
    .sort((a, b) => a.key.localeCompare(b.key))
    .concat(
      // move ld+json to the end
      generateTag('script', {
        type: 'application/ld+json',
        children: JSON.stringify(ldJson),
      }),
    )
    .flat();
}

function generateTag<T extends HeadTag>(
  tagName: T['tag'],
  input: any,
  group?: string,
): T | T[] {
  const tag = {tag: tagName, props: {}} as T;

  // title tags don't have props so move to children
  if (tagName === 'title') {
    tag.children = input;
    tag.key = generateKey(tag);

    return tag;
  }

  // also move the input children to children and delete it
  if (tagName === 'script') {
    tag.children = input.children;

    delete input.children;
  }

  // the rest goes on props
  tag.props = input;

  // remove empty props
  Object.keys(tag.props).forEach(
    (key) => !tag.props[key] && delete tag.props[key],
  );

  tag.key = generateKey(tag, group);

  return tag;
}

function generateKey(tag: HeadTag, group?: string) {
  const {tag: tagName, props} = tag;

  if (tagName === 'title') {
    // leading 0 moves title to the top when sorting
    return '0-title';
  }

  if (tagName === 'meta') {
    // leading 0 moves meta to the top when sorting
    // exclude secure_url from the logic because the content is the same as url
    const priority =
      props.content === group && !props.property.endsWith('secure_url') && '0';
    const groupName = [group, priority];

    return [tagName, ...groupName, props.property || props.name]
      .filter((x) => x)
      .join('-');
  }

  if (tagName === 'link') {
    const key = [tagName, props.rel, props.hreflang || props.media]
      .filter((x) => x)
      .join('-');

    // replace spaces with dashes, needed for media prop
    return key.replace(/\s+/g, '-');
  }

  return `${tagName}-${props.type}`;
}

function renderTitle<T extends HeadTag['children']>(
  template?: string | ((title?: string) => string | undefined),
  title?: T,
): string | undefined {
  if (!template) {
    return title;
  }

  if (typeof template === 'function') {
    return template(title);
  }

  return template.replace('%s', title ?? '');
}

function inferMimeType(url: string) {
  const ext = url.split('.').pop();

  if (ext === 'svg') {
    return 'image/svg+xml';
  }

  if (ext === 'png') {
    return 'image/png';
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }

  if (ext === 'gif') {
    return 'image/gif';
  }

  if (ext === 'swf') {
    return 'application/x-shockwave-flash';
  }

  if (ext === 'mp3') {
    return 'audio/mpeg';
  }

  return 'image/jpeg';
}

function inferSchemaType(url: string): SchemaType {
  const defaultType = 'Thing';
  const routes: {type: SchemaType; pattern: RegExp | string}[] = [
    {
      type: 'WebSite',
      pattern: '^/$',
    },

    {
      type: 'Product',
      pattern: '/products/.*',
    },
    {
      type: 'ItemList',
      pattern: /\/collections$/,
    },
    {
      type: 'ItemList',
      pattern: /\/collections\/([^\/]+)/,
    },
    {
      type: 'WebPage',
      pattern: /\/pages\/([^\/]+)/,
    },
    {
      type: 'WebSite',
      pattern: /\/blogs\/([^\/]+)/,
    },
    {
      type: 'BlogPosting',
      pattern: /\/blogs\/([^\/]+)\/([^\/]+)/,
    },
    {
      type: 'Organization',
      pattern: '/policies',
    },
    {
      type: 'Organization',
      pattern: /\/policies\/([^\/]+)/,
    },
  ];

  const typeMatches = routes.filter((route) => {
    const {pattern} = route;

    const regex = new RegExp(pattern);
    return regex.test(url);
  });

  return typeMatches.length > 0
    ? typeMatches[typeMatches.length - 1].type
    : defaultType;
}
