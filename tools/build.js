import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {parseArgs} from 'node:util';

import {globSync} from 'glob';
import webExt from 'web-ext';

// Get the directory name in ESM
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const srcDir = path.join(ROOT, 'src');
const testDir = path.join(ROOT, 'test');
const artifactsDir = path.join(ROOT, 'dist');

/**
 * Generate hardlink as needed.
 */
function hardlink(src, dst) {
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  if (fs.existsSync(dst)) {
    const srcSt = fs.statSync(src);
    const dstSt = fs.statSync(dst);
    if (srcSt.ino === dstSt.ino && srcSt.dev === dstSt.dev) {
      return;
    } else {
      fs.unlinkSync(dst);
    }
  }
  fs.linkSync(src, dst);
}

function build(target) {
  switch (target) {
    case 'firefox': {
      console.log('Building files for Firefox...');
      hardlink(path.join(srcDir, 'manifest.firefox.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    case 'chromium': {
      console.log('Building files for Chromium...');
      hardlink(path.join(srcDir, 'manifest.chromium.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    default: {
      throw new Error(`Unsupported target: ${target}`);
    }
  }
}

function buildTest(target) {
  switch (target) {
    case 'firefox': {
      console.log('Building test files for Firefox...');
      hardlink(path.join(testDir, 'manifest.firefox.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    case 'chromium': {
      console.log('Building test files for Chromium...');
      hardlink(path.join(testDir, 'manifest.chromium.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    default: {
      throw new Error(`Unsupported target: ${target}`);
    }
  }

  for (const src of globSync([
    path.join(srcDir, '{core,capturer}', 'common.js'),
    path.join(srcDir, 'lib', '**', '*.js'),
  ], {windowsPathsNoEscape: true})) {
    const subpath = path.relative(srcDir, src);
    const dst = path.join(testDir, 'shared', subpath);
    hardlink(src, dst);
  }
}

function dev(target) {
  build(target);
  buildTest(target);
}

function pack(target) {
  build(target);

  const filename = `webscrapbook.${target === 'firefox' ? 'xpi' : 'zip'}`;
  webExt.cmd.build({
    target,
    sourceDir: srcDir,
    artifactsDir,
    filename,
    overwriteDest: true,
    ignoreFiles: [
      'manifest.chromium.json',
      'manifest.firefox.json',
    ],
  });
}

function main() {
  const args = parseArgs({
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      target: {
        type: 'string',
        default: 'chromium',
        short: 't',
      },
      mode: {
        type: 'string',
        default: 'dev',
        short: 'm',
      },
    },
  });

  if (args.values.help) {
    const usage = `\
Usage: node build.js [options ...]

Options:
  -h, --help           Display usage help.
  -t, --target=TARGET  Target browser. {chromium,firefox}
  -m, --mode=MODE      Mode of action. {dev,build,pack}
`;
    process.stdout.write(usage);
    process.exit(0);
  }

  switch (args.values.mode) {
    case 'build': {
      build(args.values.target);
      break;
    }
    case 'dev': {
      dev(args.values.target);
      break;
    }
    case 'pack': {
      pack(args.values.target);
      break;
    }
    default: {
      throw new Error(`Unsupported mode: ${args.values.mode}`);
    }
  }
}

main();
