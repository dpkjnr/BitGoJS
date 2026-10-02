import 'should';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkPackage, checkSpecifier, findSpecifiers } = require('../../scripts/check-no-network');

describe('check-no-network', function () {
  const declared = new Set(['@bitgo/sdk-lib-mpc', 'io-ts']);

  it('passes on this package', function () {
    checkPackage(path.resolve(__dirname, '../..')).should.deepEqual([]);
  });

  it('finds import, export-from, require and dynamic import specifiers', function () {
    const source = [
      "import * as a from 'superagent';",
      "import type { B } from '@bitgo/sdk-core';",
      "import 'side-effect';",
      "export { c } from './local';",
      "const d = require('node:https');",
      "const e = await import('ws');",
    ].join('\n');
    findSpecifiers(source).should.containDeep([
      'superagent',
      '@bitgo/sdk-core',
      'side-effect',
      './local',
      'node:https',
      'ws',
    ]);
  });

  it('rejects network packages, BitGo API layers and networking built-ins', function () {
    for (const specifier of ['superagent', '@bitgo/sdk-api', '@bitgo/sdk-core/dist/src', 'http', 'node:https', 'net']) {
      (checkSpecifier(specifier, declared) !== undefined).should.be.true();
    }
  });

  it('rejects packages that are not declared dependencies', function () {
    (checkSpecifier('lodash', declared) !== undefined).should.be.true();
  });

  it('allows relative imports, crypto built-ins and declared dependencies', function () {
    for (const specifier of ['./x', '../y', 'crypto', 'node:crypto', 'assert', 'io-ts', '@bitgo/sdk-lib-mpc']) {
      (checkSpecifier(specifier, declared) === undefined).should.be.true();
    }
  });
});
