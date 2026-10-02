import * as sinon from 'sinon';
import 'should';
import { inspect } from 'util';
import { CoreWallet, Wallet } from '../../../../src';

describe('Wallet - CoreWallet base', function () {
  const walletData = {
    id: 'test-wallet-id',
    coin: 'tbtc',
    label: 'test',
    keys: ['user-key', 'backup-key', 'bitgo-key'],
    multisigType: 'onchain',
  };
  let mockBitGo: any;
  let mockBaseCoin: any;

  beforeEach(function () {
    mockBitGo = {
      _token: 'secret-access-token',
      url: sinon.stub().callsFake((path: string, version = 2) => `https://test.bitgo.com/api/v${version}${path}`),
      get: sinon.stub(),
      decrypt: sinon.stub().resolves('decrypted'),
    };
    mockBaseCoin = {
      getChain: sinon.stub().returns('tbtc'),
      supportsTss: sinon.stub().returns(false),
    };
  });

  afterEach(function () {
    sinon.restore();
  });

  it('is a CoreWallet and inherits its accessors', function () {
    const wallet = new Wallet(mockBitGo, mockBaseCoin, walletData);
    wallet.should.be.instanceOf(CoreWallet);
    wallet.id().should.equal('test-wallet-id');
    wallet.type().should.equal('hot');
    wallet.keyIds().should.deepEqual(walletData.keys);
    wallet.baseCoin.should.equal(mockBaseCoin);
  });

  it('refreshes through the BitGo client', async function () {
    const result = sinon.stub().resolves({ ...walletData, label: 'renamed' });
    mockBitGo.get.returns({ result });
    const wallet = new Wallet(mockBitGo, mockBaseCoin, walletData);

    (await wallet.refresh()).should.equal(wallet);

    wallet.label().should.equal('renamed');
    sinon.assert.calledWith(mockBitGo.get, 'https://test.bitgo.com/api/v2/tbtc/wallet/test-wallet-id');
  });

  it('does not expose the client token through the wallet context', function () {
    const wallet = new Wallet(mockBitGo, mockBaseCoin, walletData);
    // Error paths log `{ ...wallet, bitgo: <client without _token> }`.
    const sanitized = { ...wallet, bitgo: undefined };
    inspect(sanitized, { depth: 10 }).should.not.containEql('secret-access-token');
    JSON.stringify(sanitized).should.not.containEql('secret-access-token');
  });
});
