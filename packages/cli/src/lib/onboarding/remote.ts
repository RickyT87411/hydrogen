import {readdir} from 'node:fs/promises';
import {AbortError} from '@shopify/cli-kit/node/error';
import {AbortController} from '@shopify/cli-kit/node/abort';
import {copyFile, fileExists} from '@shopify/cli-kit/node/fs';
import {readAndParsePackageJson} from '@shopify/cli-kit/node/node-package-manager';
import {joinPath} from '@shopify/cli-kit/node/path';
import {renderInfo, renderTasks} from '@shopify/cli-kit/node/ui';
import {getLatestTemplates} from '../template-downloader.js';
import {applyTemplateDiff} from '../template-diff.js';
import {getCliCommand} from '../shell.js';
import {
  commitAll,
  createAbortHandler,
  createInitialCommit,
  handleDependencies,
  handleLanguage,
  handleProjectLocation,
  renderProjectReady,
  SetupSummary,
  type InitOptions,
} from './common.js';

/**
 * Flow for creating a project starting from a remote template (e.g. demo-store).
 */
export async function setupRemoteTemplate(
  options: InitOptions,
  controller: AbortController,
) {
  // TODO: support GitHub repos as templates
  const appTemplate = options.template!;
  let abort = createAbortHandler(controller);

  // Start downloading templates early.
  const backgroundDownloadPromise = getLatestTemplates({
    signal: controller.signal,
  })
    .then(async ({templatesDir, examplesDir}) => {
      const templatePath = joinPath(templatesDir, appTemplate);
      const examplePath = joinPath(examplesDir, appTemplate);

      if (await fileExists(templatePath)) {
        return {templatesDir, sourcePath: templatePath};
      }

      if (await fileExists(examplePath)) {
        return {templatesDir, sourcePath: examplePath};
      }

      const availableTemplates = (
        await Promise.all([readdir(examplesDir), readdir(templatesDir)]).catch(
          () => [],
        )
      )
        .flat()
        .filter((name) => name !== 'skeleton' && !name.endsWith('.md'))
        .sort();

      throw new AbortError(
        `Unknown value in \`--template\` flag "${appTemplate}".\nSkip the flag or provide the name of a template or example in the Hydrogen repository.`,
        availableTemplates.length === 0
          ? ''
          : {list: {title: 'Available templates:', items: availableTemplates}},
      );
    })
    .catch(abort);

  const project = await handleProjectLocation({...options, controller});

  if (!project) return;

  abort = createAbortHandler(controller, project);

  const downloaded = await backgroundDownloadPromise;
  if (controller.signal.aborted) return;

  let backgroundWorkPromise = Promise.resolve()
    .then(async () => {
      // Result is undefined in certain tests,
      // do not continue if it's already aborted
      if (controller.signal.aborted) return;

      const {sourcePath, templatesDir} = downloaded;

      const pkgJson = await readAndParsePackageJson(
        joinPath(sourcePath, 'package.json'),
      );

      if (pkgJson.scripts?.dev?.includes('--diff')) {
        return applyTemplateDiff(
          project.directory,
          sourcePath,
          joinPath(templatesDir, 'skeleton'),
        );
      }

      return copyFile(sourcePath, project.directory);
    })
    .catch(abort);

  const supportsTranspilation = await fileExists(
    joinPath(downloaded.sourcePath, 'tsconfig.json'),
  );

  const {language, transpileProject} = supportsTranspilation
    ? await handleLanguage(project.directory, controller, options.language)
    : {language: 'js' as const, transpileProject: () => Promise.resolve()};

  backgroundWorkPromise = backgroundWorkPromise
    .then(() => transpileProject().catch(abort))
    .then(() =>
      options.git ? createInitialCommit(project.directory) : undefined,
    );

  const {packageManager, shouldInstallDeps, installDeps} =
    await handleDependencies(
      project.directory,
      controller,
      options.installDeps,
    );

  const setupSummary: SetupSummary = {
    language,
    packageManager,
    depsInstalled: false,
    cliCommand: await getCliCommand('', packageManager),
  };

  const tasks = [
    {
      title: 'Downloading template',
      task: async () => {
        await backgroundDownloadPromise;
      },
    },
    {
      title: 'Setting up project',
      task: async () => {
        await backgroundWorkPromise;
      },
    },
  ];

  if (shouldInstallDeps) {
    tasks.push({
      title: 'Installing dependencies. This could take a few minutes',
      task: async () => {
        try {
          await installDeps();
          setupSummary.depsInstalled = true;
        } catch (error) {
          setupSummary.depsError = error as AbortError;
        }
      },
    });
  }

  if (controller.signal.aborted) return;

  await renderTasks(tasks);

  if (options.git) {
    await commitAll(project.directory, 'Lockfile');
  }

  await renderProjectReady(project, setupSummary);

  renderInfo({
    headline: `Your project will display inventory from ${
      options.template === 'demo-store'
        ? 'the Hydrogen Demo Store'
        : 'Mock.shop'
    }.`,
    body: `To connect this project to your Shopify store’s inventory, update \`${project.name}/.env\` with your store ID and Storefront API key.`,
  });

  return {
    ...project,
    ...setupSummary,
  };
}
