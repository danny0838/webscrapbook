import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {parseArgs} from 'node:util';

import {globSync} from 'glob';
import webExt from 'web-ext';
import {rollup} from 'rollup';

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

async function build(target) {
  switch (target) {
    case 'firefox-mv3': {
      console.log('Building files for Firefox (MV3)...');
      hardlink(path.join(srcDir, 'manifest.firefox.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    case 'chromium':
    case 'chromium-mv3': {
      console.log('Building files for Chromium (MV3)...');
      hardlink(path.join(srcDir, 'manifest.chromium.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    case 'firefox':
    case 'firefox-mv2': {
      console.log('Building files for Firefox (MV2)...');
      hardlink(path.join(srcDir, 'manifest.firefox-mv2.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    case 'chromium-mv2': {
      console.log('Building files for Chromium (MV2)...');
      hardlink(path.join(srcDir, 'manifest.chromium-mv2.json'), path.join(srcDir, 'manifest.json'));
      break;
    }
    default: {
      throw new Error(`Unsupported target: ${target}`);
    }
  }

  // sync version to manifest files
  {
    const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    for (const dst of globSync([
      path.join(srcDir, 'manifest.*.json'),
    ], {windowsPathsNoEscape: true})) {
      const data = JSON.parse(fs.readFileSync(dst, 'utf8'));
      if (data.version !== version) {
        console.log(`Updating version for "${dst}" ...`);
        data.version = version;
        fs.writeFileSync(dst, JSON.stringify(data, null, 2) + '\n');
      }
    }
  }

  {
    const bundle = await rollup({
      input: path.join(srcDir, "content/index.mjs"),
      external: [
        path.join(srcDir, "lib/browser-polyfill.js"),
        path.join(srcDir, "lib/polyfill.js"),
        path.join(srcDir, "lib/webext-polyfill.js"),
        path.join(srcDir, "lib/sha.js"),
      ],
    });
    await bundle.write({
      file: path.join(srcDir, "content/index.js"),
      format: 'iife',
      globals: {
        [path.join(srcDir, "lib/browser-polyfill.js")]: "browser",
        [path.join(srcDir, "lib/sha.js")]: "jsSHA",
      },
      sourcemap: true,
      sourcemapExcludeSources: true,
    });
  }
}

async function buildTest(target) {
  switch (target) {
    case 'firefox-mv3': {
      console.log('Building test files for Firefox (MV3)...');
      hardlink(path.join(testDir, 'manifest.firefox.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    case 'chromium':
    case 'chromium-mv3': {
      console.log('Building test files for Chromium (MV3)...');
      hardlink(path.join(testDir, 'manifest.chromium.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    case 'firefox':
    case 'firefox-mv2': {
      console.log('Building test files for Firefox (MV2)...');
      hardlink(path.join(testDir, 'manifest.firefox-mv2.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    case 'chromium-mv2': {
      console.log('Building test files for Chromium (MV2)...');
      hardlink(path.join(testDir, 'manifest.chromium-mv2.json'), path.join(testDir, 'manifest.json'));
      break;
    }
    default: {
      throw new Error(`Unsupported target: ${target}`);
    }
  }

  // sync version to manifest files
  {
    const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    for (const dst of globSync([
      path.join(testDir, 'manifest.*.json'),
    ], {windowsPathsNoEscape: true})) {
      const data = JSON.parse(fs.readFileSync(dst, 'utf8'));
      if (data.version !== version) {
        console.log(`Updating version for "${dst}" ...`);
        data.version = version;
        fs.writeFileSync(dst, JSON.stringify(data, null, 2) + '\n');
      }
    }
  }

  // mirror source files under the shared directory
  const testSharedDir = path.join(testDir, 'shared');

  for (const dst of globSync([
    path.join(testSharedDir, '**'),
  ], {windowsPathsNoEscape: true})) {
    const subpath = path.relative(testSharedDir, dst);
    const src = path.join(srcDir, subpath);
    if (!fs.existsSync(src)) {
      fs.rmSync(dst, {force: true, recursive: true});
    }
  }

  for (const src of globSync([
    path.join(srcDir, '**', '*.mjs'),
    path.join(srcDir, 'lib', '**', '*.js'),
  ], {windowsPathsNoEscape: true})) {
    const subpath = path.relative(srcDir, src);
    const dst = path.join(testSharedDir, subpath);
    hardlink(src, dst);
  }
}

async function dev(target) {
  await build(target);
  await buildTest(target);
}

async function pack(target) {
  await build(target);

  const filename = `webscrapbook.${target.startsWith('firefox') ? 'xpi' : 'zip'}`;
  webExt.cmd.build({
    target,
    sourceDir: srcDir,
    artifactsDir,
    filename,
    overwriteDest: true,
    ignoreFiles: [
      '**/*.map',
      'manifest.*.json',
    ],
  });
}

async function main() {
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
  -t, --target=TARGET  Target browser. {chromium,firefox}[-{mv3,mv2}]
  -m, --mode=MODE      Mode of action. {dev,build,pack}
`;
    process.stdout.write(usage);
    process.exit(0);
  }

  switch (args.values.mode) {
    case 'build': {
      await build(args.values.target);
      break;
    }
    case 'dev': {
      await dev(args.values.target);
      break;
    }
    case 'pack': {
      await pack(args.values.target);
      break;
    }
    default: {
      throw new Error(`Unsupported mode: ${args.values.mode}`);
    }
  }
}

main();
