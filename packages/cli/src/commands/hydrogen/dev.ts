import path from 'path';
import fs from 'fs/promises';
import {output} from '@shopify/cli-kit';
import {copyPublicFiles} from './build.js';
import {getProjectPaths, getRemixConfig} from '../../utils/config.js';
import {muteDevLogs} from '../../utils/log.js';
import {commonFlags} from '../../utils/flags.js';
import Command from '@shopify/cli-kit/node/base-command';
import Flags from '@oclif/core/lib/flags.js';
import {startMiniOxygen} from '../../utils/mini-oxygen.js';

const LOG_INITIAL_BUILD = '\n🏁 Initial build';
const LOG_REBUILDING = '🧱 Rebuilding...';
const LOG_REBUILT = '🚀 Rebuilt';

// @ts-ignore
export default class Dev extends Command {
  static description =
    'Runs Hydrogen storefront in a MiniOxygen worker in development';
  static flags = {
    ...commonFlags,
    port: Flags.integer({
      description: 'Port to run the preview server on',
      env: 'SHOPIFY_HYDROGEN_FLAG_PORT',
      default: 3000,
    }),
    entry: Flags.string({
      env: 'SHOPIFY_HYDROGEN_FLAG_ENTRY',
      required: true,
    }),
  };

  async run(): Promise<void> {
    // @ts-ignore
    const {flags} = await this.parse(Dev);
    const directory = flags.path ? path.resolve(flags.path) : process.cwd();

    await runDev({...flags, path: directory});
  }
}

export async function runDev({
  entry,
  port,
  path: appPath,
}: {
  entry: string;
  port?: number;
  path?: string;
}) {
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

  muteDevLogs();

  await compileAndWatch(entry, appPath, port);
}

async function compileAndWatch(entry: string, appPath?: string, port?: number) {
  console.time(LOG_INITIAL_BUILD);

  const {root, entryFile, publicPath, buildPathClient, buildPathWorkerFile} =
    getProjectPaths(appPath, entry);

  const remixConfigGetter = () => getRemixConfig(root, entryFile, publicPath);
  const copyingFiles = copyPublicFiles(publicPath, buildPathClient);

  const {watch} = await import('@remix-run/dev/dist/compiler/watch.js');
  await watch(remixConfigGetter, {
    mode: process.env.NODE_ENV as any,
    async onInitialBuild() {
      await copyingFiles;

      console.timeEnd(LOG_INITIAL_BUILD);

      await startMiniOxygen({
        root,
        port,
        watch: true,
        buildPathWorkerFile,
        buildPathClient,
      });
    },
    async onFileCreated(file: string) {
      output.info(`\n📄 File created: ${path.relative(root, file)}`);
      if (file.startsWith(publicPath)) {
        await copyPublicFiles(file, file.replace(publicPath, buildPathClient));
      }
    },
    async onFileChanged(file: string) {
      output.info(`\n📄 File changed: ${path.relative(root, file)}`);
      if (file.startsWith(publicPath)) {
        await copyPublicFiles(file, file.replace(publicPath, buildPathClient));
      }
    },
    async onFileDeleted(file: string) {
      output.info(`\n📄 File deleted: ${path.relative(root, file)}`);
      if (file.startsWith(publicPath)) {
        await fs.unlink(file.replace(publicPath, buildPathClient));
      }
    },
    onRebuildStart() {
      output.info(LOG_REBUILDING);
      console.time(LOG_REBUILT);
    },
    async onRebuildFinish() {
      console.timeEnd(LOG_REBUILT);
    },
  });
}
