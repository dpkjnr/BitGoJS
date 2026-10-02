import 'should';
import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { BaseCoin, BitGoBase, UnsupportedCoinError } from '@bitgo/sdk-core';
import { register as registerSol, Tsol } from '@bitgo/sdk-coin-sol';
import { BitGo as LeanBitGo } from '../../src/lean';
import { BitGo } from '../../src/bitgo';

describe('bitgo/lean', function () {
  it('starts with no coins registered', function () {
    const bitgo = new LeanBitGo({ env: 'test' });
    assert.throws(() => bitgo.coin('tsol'), UnsupportedCoinError);
  });

  it('registers coins through use()', function () {
    const bitgo = new LeanBitGo({ env: 'test' }).use(registerSol);
    const coin = bitgo.coin('tsol');
    coin.should.be.instanceOf(Tsol);
    coin.getChain().should.equal('tsol');
    assert.throws(() => bitgo.coin('tbtc'), UnsupportedCoinError);
  });

  it('keeps registrations per instance', function () {
    const withSol = new LeanBitGo({ env: 'test' }).use(registerSol);
    const empty = new LeanBitGo({ env: 'test' });
    withSol.coin('tsol').should.be.instanceOf(Tsol);
    assert.throws(() => empty.coin('tsol'), UnsupportedCoinError);
  });

  it('accepts several registrars and custom constructors', function () {
    let called = 0;
    const custom = (sdk: BitGoBase) =>
      sdk.register('tsol', (bitgo, staticsCoin) => {
        called++;
        return Tsol.createInstance(bitgo, staticsCoin);
      });
    const bitgo = new LeanBitGo({ env: 'test' }).use(registerSol, custom);
    bitgo.coin('tsol');
    called.should.equal(1);
  });

  it('does not load any coin package', function () {
    // Run in a fresh process so modules loaded by other tests don't count.
    const script = `
      require(${JSON.stringify(path.resolve(__dirname, '../../dist/src/lean.js'))});
      const loaded = Object.keys(require.cache).filter((f) => /[\\\\/](sdk-coin-|abstract-)[^\\\\/]+[\\\\/]/.test(f));
      process.stdout.write(JSON.stringify(loaded));
    `;
    const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, res.stderr);
    JSON.parse(res.stdout).should.deepEqual([]);
  });

  it('is exposed as bitgo/lean', function () {
    const pkg = require('../../package.json');
    pkg.files.should.containEql('lean.js');
    pkg.files.should.containEql('lean.d.ts');
    const res = spawnSync(
      process.execPath,
      ['-e', `process.stdout.write(typeof require(${JSON.stringify(path.resolve(__dirname, '../../lean'))}).BitGo)`],
      { encoding: 'utf8' }
    );
    assert.strictEqual(res.status, 0, res.stderr);
    res.stdout.should.equal('function');
  });
});

describe('BitGo.register', function () {
  afterEach(function () {
    new BitGo({ env: 'test' }).register('tsol', Tsol.createInstance);
  });

  it('registers on the factory that coin() reads', function () {
    let called = 0;
    const bitgo = new BitGo({ env: 'test' });
    bitgo.register('tsol', (sdk, staticsCoin): BaseCoin => {
      called++;
      return Tsol.createInstance(sdk, staticsCoin);
    });
    bitgo.coin('tsol').should.be.instanceOf(Tsol);
    called.should.equal(1);
  });

  it('registers on the instance factory when useAms is set', function () {
    let called = 0;
    const bitgo = new BitGo({ env: 'test', useAms: true });
    bitgo.register('tsol', (sdk, staticsCoin): BaseCoin => {
      called++;
      return Tsol.createInstance(sdk, staticsCoin);
    });
    bitgo.coin('tsol');
    called.should.equal(1);
  });
});
