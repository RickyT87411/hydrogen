import miniOxygen from '@shopify/mini-oxygen';
import {readEnv} from './env.js';

const miniOxygenPreview =
  miniOxygen.default ?? (miniOxygen as unknown as typeof miniOxygen.default);

type MiniOxygenOptions = {
  root: string;
  port?: number;
  buildPathClient: string;
  buildPathWorkerFile: string;
  buildCommand?: string;
  buildWatchPaths?: string[];
};

export async function startMiniOxygen({
  root,
  port = 3000,
  buildPathWorkerFile,
  buildPathClient,
  buildCommand,
  buildWatchPaths,
}: MiniOxygenOptions) {
  const watch = !!buildWatchPaths;

  miniOxygenPreview({
    workerFile: buildPathWorkerFile,
    assetsDir: buildPathClient,
    publicPath: '',
    port,
    watch,
    autoReload: watch,
    buildCommand: watch ? buildCommand : undefined,
    buildWatchPaths,
    modules: true,
    env: await readEnv(root),
  });
}
