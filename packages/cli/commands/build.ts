import path from 'path';
import {cli} from '@remix-run/dev';
import fsExtra from 'fs-extra';
import esbuild from 'esbuild';
import {getProjectPaths} from '../utils/paths';

export async function runBuild({
  entry,
  devReload = false,
  sourcemap = true,
  minify = !devReload,
  path: appPath,
}: {
  entry: string;
  devReload?: boolean;
  sourcemap?: boolean;
  minify?: boolean;
  path?: string;
}) {
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

  const {
    root,
    entryFile,
    buildPath,
    buildPathClient,
    buildPathWorkerFile,
    publicPath,
  } = getProjectPaths(appPath, entry);

  if (!devReload) {
    await fsExtra.rm(buildPath, {force: true, recursive: true});
    await cli.run(['build', root]);
  }

  await fsExtra.copy(publicPath, buildPathClient, {
    recursive: true,
    overwrite: true,
  });

  await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    outfile: buildPathWorkerFile,
    format: 'esm',
    logOverride: {'this-is-undefined-in-esm': 'silent'},
    define: {'process.env.REMIX_DEV_SERVER_WS_PORT': '8002'},
    sourcemap,
    minify,
  });

  if (process.env.NODE_ENV === 'production') {
    const {size} = await fsExtra.stat(buildPathWorkerFile);
    const sizeMB = size / (1024 * 1024);

    // eslint-disable-next-line no-console
    console.log(
      '\n' + path.relative(root, buildPathWorkerFile),
      '  ',
      Number(sizeMB.toFixed(2)),
      'MB',
    );

    if (sizeMB >= 1) {
      // eslint-disable-next-line no-console
      console.warn(
        '\n-- Worker bundle exceeds 1 MB! This can delay your worker response.',
      );
    }
  }
}
