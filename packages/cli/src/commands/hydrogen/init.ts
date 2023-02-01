import Command from '@shopify/cli-kit/node/base-command';
import {
  installNodeModules,
  packageManagerUsedForCreating,
} from '@shopify/cli-kit/node/node-package-manager';
import Flags from '@oclif/core/lib/flags.js';
import {path} from '@shopify/cli-kit';
import fs from 'fs-extra';
import {transpileProject} from '../../utils/transpile-ts.js';

export default class Init extends Command {
  static description = 'Creates a new Hydrogen storefront project';
  static flags = {
    language: Flags.string({
      description: 'Language to use for the project',
      choices: ['js', 'ts'],
      default: 'js',
      env: 'SHOPIFY_HYDROGEN_FLAG_LANGUAGE',
    }),
    path: Flags.string({
      description: 'The path to create the project in',
      env: 'SHOPIFY_HYDROGEN_FLAG_PATH',
    }),
    template: Flags.string({
      description: 'The template to use',
      env: 'SHOPIFY_HYDROGEN_FLAG_TEMPLATE',
    }),
    token: Flags.string({
      description:
        'A GitHub token used to access access private repository templates',
      env: 'SHOPIFY_HYDROGEN_FLAG_TOKEN',
    }),
    force: Flags.boolean({
      description: 'Overwrite the destination directory if it already exists',
      env: 'SHOPIFY_HYDROGEN_FLAG_FORCE',
      char: 'f',
    }),
  };

  async run(): Promise<void> {
    // @ts-ignore
    const {flags} = await this.parse(Init);

    await runInit({...flags});
  }
}

type Writable<T> = {-readonly [P in keyof T]: T[P]};

export async function runInit(
  options: {
    path?: string;
    template?: string;
    language?: string;
    token?: string;
    force?: boolean;
  } = getProcessFlags(),
) {
  const {createApp} = await import('@remix-run/dev/dist/cli/create.js');

  const {ui} = await import('@shopify/cli-kit');
  const {renderSuccess, renderInfo} = await import('@shopify/cli-kit/node/ui');
  const prompts: Writable<Parameters<typeof ui.prompt>[0]> = [];

  if (!options.template) {
    prompts.push({
      type: 'select',
      name: 'template',
      message: 'Choose a template',
      choices: ['hello-world', 'demo-store'].map((t) => ({
        name: t.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        value: new URL(`../../templates/${t}`, import.meta.url).pathname,
      })),
    });
  }

  if (!options.language) {
    prompts.push({
      type: 'select',
      name: 'language',
      message: 'Choose a language',
      choices: [
        {name: 'JavaScript', value: 'js'},
        {name: 'TypeScript', value: 'ts'},
      ],
      default: 'js',
    });
  }

  if (!options.path) {
    prompts.push({
      type: 'input',
      name: 'path',
      message: 'Where would you like to create your app?',
      default: 'hydrogen-storefront',
    });
  }

  const {
    path: location = options.path!,
    template: appTemplate = options.template!,
    language = options.language ?? 'js',
  } = prompts.length > 0 ? await ui.prompt(prompts) : options;

  const projectName = path.basename(location);
  const projectDir = path.resolve(process.cwd(), location);

  if (await projectExists(projectDir)) {
    if (!options.force) {
      const {deleteFiles} = await ui.prompt([
        {
          type: 'select',
          name: 'deleteFiles',
          message: `${location} is not an empty directory. Do you want to delete the existing files and continue?`,
          choices: [
            {name: 'Yes, delete the files', value: 'true'},
            {name: 'No, do not delete the files', value: 'false'},
          ],
          default: 'false',
        },
      ]);

      if (deleteFiles === 'false') {
        renderInfo({
          headline: `Destination path ${location} already exists and is not an empty directory. You may use \`--force\` or \`-f\` to override it.`,
        });

        return;
      }
    }

    await fs.remove(projectDir);
  }

  await createApp({
    projectDir,
    appTemplate,
    useTypeScript: true, // Transpile to JS later to avoid default logging
    installDeps: false,
    githubToken: options.token || undefined,
    debug: !!process.env.DEBUG,
  });

  if (language === 'js') {
    try {
      await transpileProject(projectDir);
    } catch (error) {
      await fs.rmdir(projectDir);
      throw error;
    }
  }

  let depsInstalled = false;
  let packageManager = await packageManagerUsedForCreating();

  if (packageManager !== 'unknown') {
    const {installDeps} = await ui.prompt([
      {
        type: 'select',
        name: 'installDeps',
        message: `Do you want to install dependencies with ${packageManager} for ${projectName}?`,
        choices: [
          {name: 'Yes, install the dependencies', value: 'true'},
          {name: "No, I'll do it myself", value: 'false'},
        ],
        default: 'true',
      },
    ]);

    if (installDeps === 'true') {
      await installNodeModules({
        directory: projectDir,
        packageManager,
        args: [],
        stdout: process.stdout,
        stderr: process.stderr,
      });

      depsInstalled = true;
    }
  } else {
    // Assume npm for showing next steps
    packageManager = 'npm';
  }

  renderSuccess({
    headline: `${projectName} is ready to build.`,
    nextSteps: [
      `Run \`cd ${location}\`${
        depsInstalled ? '' : `, \`${packageManager} install\`,`
      } and \`${
        packageManager + (packageManager === 'npm' ? ' run' : '')
      } dev\` to start your local development server and start building.`,
    ],
    reference: [
      'Building with Hydrogen: https://shopify.dev/custom-storefronts/hydrogen',
    ],
  });

  renderInfo({
    headline: `Your project will display inventory from the Hydrogen Demo Store.`,
    body: `To connect this project to your Shopify store’s inventory, update \`${projectName}/.env\` with your store ID and Storefront API key.`,
  });
}

async function projectExists(projectDir: string) {
  return (
    (await fs.pathExists(projectDir)) &&
    (await fs.stat(projectDir)).isDirectory() &&
    (await fs.readdir(projectDir)).length > 0
  );
}

// When calling runInit from @shopify/create-hydrogen,
// parse the flags from the process arguments:
function getProcessFlags() {
  const flagMap = {f: 'force'} as Record<string, string>;
  const [, , ...flags] = process.argv;

  return flags.reduce((acc, flag) => {
    const [key, value = true] = flag.replace(/^\-+/, '').split('=');
    const mappedKey = flagMap[key!] || key!;
    return {...acc, [mappedKey]: value};
  }, {});
}
