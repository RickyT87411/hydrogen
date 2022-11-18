import {readConfig, type RemixConfig} from '@remix-run/dev/dist/config.js';
import type {ServerMode} from '@remix-run/dev/dist/config/serverModes.js';
import path from 'path';

const BUILD_DIR = 'build';
const CLIENT_SUBDIR = 'client';
const WORKER_SUBDIR = 'worker';
const SERVER_SUBDIR = 'server';

export function getProjectPaths(appPath?: string, entry?: string) {
  const root = appPath ?? process.cwd();
  const publicPath = path.join(root, 'public');
  const buildPath = path.join(root, BUILD_DIR);
  const buildPathClient = path.join(buildPath, CLIENT_SUBDIR);
  const buildPathWorkerFile = path.join(buildPath, WORKER_SUBDIR, 'index.js');
  const entryFile = entry ? path.join(root, entry) : '';

  return {
    root,
    entryFile,
    buildPath,
    buildPathClient,
    buildPathWorkerFile,
    publicPath,
  };
}

let cachedConfig: RemixConfig;
export async function getRemixConfig(
  root: string,
  mode = process.env.NODE_ENV as ServerMode,
) {
  if (!cachedConfig) {
    const config = await readConfig(root, mode);

    const hydrogenAssetBase = process.env.HYDROGEN_ASSET_BASE_URL;
    if (hydrogenAssetBase) {
      const suffix = config.publicPath?.replace(/\\/g, '/').replace(/^\//, '');
      config.publicPath = hydrogenAssetBase + suffix;
    }

    config.serverBuildTarget = undefined; // Avoid bundling 3p deps
    config.serverModuleFormat = 'esm';
    config.serverPlatform = 'neutral';

    config.serverBuildPath = path.resolve(
      root,
      path.join(BUILD_DIR, SERVER_SUBDIR, 'index.js'),
    );
    config.relativeAssetsBuildDirectory = path.join(
      BUILD_DIR,
      CLIENT_SUBDIR,
      'build',
    );
    config.assetsBuildDirectory = path.resolve(
      root,
      config.relativeAssetsBuildDirectory,
    );

    cachedConfig = config;
  }

  return cachedConfig;
}
