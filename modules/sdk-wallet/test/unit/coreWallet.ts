import 'should';
import * as assert from 'assert';
import { encrypt } from '@bitgo/sdk-keys';
import { createRecordingTransport, TransportRequest } from '@bitgo/sdk-transport';
import { CoreCoin, CoreWallet, CoreWalletData, CoreWallets } from '../../src';

const walletData: CoreWalletData = {
  id: 'w1',
  coin: 'tbtc',
  label: 'my wallet',
  keys: ['k-user', 'k-backup', 'k-bitgo'],
  multisigType: 'onchain',
  balanceString: '100',
  spendableBalanceString: '90',
  receiveAddress: { address: 'addr-root' },
};

const keychains: Record<string, { id: string; pub: string; encryptedPrv?: string }> = {
  'k-user': { id: 'k-user', pub: 'pub-user' },
  'k-backup': { id: 'k-backup', pub: 'pub-backup' },
  'k-bitgo': { id: 'k-bitgo', pub: 'pub-bitgo' },
};

function fakeCoin(overrides: Partial<CoreCoin> = {}): CoreCoin & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const record = (name: string, arg: unknown) => (calls[name] = [...(calls[name] ?? []), arg]);
  return {
    calls,
    getChain: () => 'tbtc',
    getFamily: () => 'btc',
    keyIdsForSigning: () => [0, 1, 2],
    valuelessTransferAllowed: () => false,
    transactionDataAllowed: () => false,
    checkRecipient: (r) => record('checkRecipient', r),
    preprocessBuildParams: (p) => p,
    getExtraPrebuildParams: async () => ({}),
    postProcessPrebuild: async (p) => p,
    verifyTransaction: async (p) => {
      record('verifyTransaction', p);
      return true;
    },
    presignTransaction: async (p) => p,
    signTransaction: async (p) => {
      record('signTransaction', p);
      const { txPrebuild, prv } = p as { txPrebuild: { txHex: string }; prv: string };
      return { txHex: `signed(${txPrebuild.txHex},${prv})` };
    },
    isWalletAddress: async (p) => {
      record('isWalletAddress', p);
      return true;
    },
    ...overrides,
  };
}

function bitgoHandler(req: TransportRequest): unknown {
  const keyMatch = req.path.match(/^\/tbtc\/key\/(.+)$/);
  if (keyMatch) {
    return keychains[decodeURIComponent(keyMatch[1])];
  }
  switch (`${req.method} ${req.path}`) {
    case 'GET /tbtc/wallet/w1':
      return { ...walletData, label: 'renamed' };
    case 'POST /tbtc/wallet/add':
      return { ...walletData, ...(req.body as Partial<CoreWalletData>) };
    case 'POST /tbtc/wallet/w1/address':
      return { address: 'addr-new', chain: 10, index: 3, coinSpecific: {} };
    case 'POST /tbtc/wallet/w1/tx/build':
      return { txHex: 'unsigned' };
    case 'POST /tbtc/wallet/w1/tx/send':
      return { txid: 'tx1', status: 'signed' };
  }
  throw new Error(`unexpected request ${req.method} ${req.path}`);
}

before(async function () {
  keychains['k-user'].encryptedPrv = await encrypt('pass', 'prv-user', { encryptionVersion: 1 });
});

describe('CoreWallet', function () {
  function setup(coin = fakeCoin(), data: CoreWalletData = walletData) {
    const transport = createRecordingTransport(bitgoHandler);
    const wallet = new CoreWallet({ transport, coin }, { ...data });
    return { transport, coin, wallet };
  }

  it('reads wallet data', function () {
    const { wallet } = setup();
    wallet.id().should.equal('w1');
    wallet.coin().should.equal('tbtc');
    wallet.label().should.equal('my wallet');
    wallet.keyIds().should.deepEqual(['k-user', 'k-backup', 'k-bitgo']);
    wallet.type().should.equal('hot');
    wallet.multisigType().should.equal('onchain');
    wallet.receiveAddress()!.should.equal('addr-root');
    wallet.spendableBalanceString()!.should.equal('90');
    wallet.toJSON().id.should.equal('w1');
  });

  it('refreshes the wallet document over the transport', async function () {
    const { wallet, transport } = setup();
    (await wallet.refresh()).should.equal(wallet);
    wallet.label().should.equal('renamed');
    transport.requests.should.deepEqual([{ method: 'GET', path: '/tbtc/wallet/w1' }]);
  });

  it('creates and verifies a receive address', async function () {
    const { wallet, transport, coin } = setup();
    const address = await wallet.createAddress({ chain: 10, label: 'deposit' });
    address.address!.should.equal('addr-new');
    transport.requests[0].should.deepEqual({
      method: 'POST',
      path: '/tbtc/wallet/w1/address',
      body: { chain: 10, label: 'deposit' },
      tracer: undefined,
    });
    const verified = coin.calls.isWalletAddress[0] as { keychains: { id: string }[]; rootAddress: string };
    verified.keychains.map((k) => k.id).should.deepEqual(['k-user', 'k-backup', 'k-bitgo']);
    verified.rootAddress.should.equal('addr-root');
  });

  it('rejects an address the coin does not recognise', async function () {
    const { wallet } = setup(fakeCoin({ isWalletAddress: async () => false }));
    await assert.rejects(() => wallet.createAddress(), /not a wallet address/);
  });

  it('decrypts the user key with the wallet passphrase', async function () {
    const { wallet } = setup();
    (await wallet.getPrv({ walletPassphrase: 'pass' })).should.equal('prv-user');
    (await wallet.getPrv({ prv: 'given' })).should.equal('given');
    await assert.rejects(() => wallet.getPrv({ walletPassphrase: 'wrong' }), /unable to decrypt/);
  });

  it('builds, verifies, signs and sends with sendMany', async function () {
    const { wallet, transport, coin } = setup();
    const recipients = [{ address: 'dest', amount: '10' }];
    const result = await wallet.sendMany({ recipients, walletPassphrase: 'pass', comment: 'hi' });
    result!.should.deepEqual({ txid: 'tx1', status: 'signed' });

    const build = transport.requests.find((r) => r.path === '/tbtc/wallet/w1/tx/build')!;
    // Secrets never leave the process: only whitelisted build params are sent.
    build.body!.should.deepEqual({ recipients, comment: 'hi' });

    coin.calls.verifyTransaction.should.have.length(1);
    const signParams = coin.calls.signTransaction[0] as { pubs: string[]; prv: string };
    signParams.pubs.should.deepEqual(['pub-user', 'pub-backup', 'pub-bitgo']);
    signParams.prv.should.equal('prv-user');

    const send = transport.requests.find((r) => r.path === '/tbtc/wallet/w1/tx/send')!;
    send.body!.should.deepEqual({ txHex: 'signed(unsigned,prv-user)', recipients, comment: 'hi' });
  });

  it('stops before signing when verification fails', async function () {
    const coin = fakeCoin({
      verifyTransaction: async () => {
        throw new Error('prebuild does not match');
      },
    });
    const { wallet, transport } = setup(coin);
    await assert.rejects(
      () => wallet.send({ address: 'dest', amount: '10', walletPassphrase: 'pass' }),
      /prebuild does not match/
    );
    (coin.calls.signTransaction === undefined).should.be.true();
    transport.requests.some((r) => r.path.endsWith('/tx/send')).should.be.false();
  });

  it('validates send amounts', async function () {
    const { wallet } = setup();
    await assert.rejects(() => wallet.send({ address: 'dest', amount: '-1' }), /invalid argument for amount/);
    await assert.rejects(() => wallet.send({ address: 'dest', amount: '0' }), /invalid argument for amount/);
    await assert.rejects(() => wallet.send({ address: 'dest', amount: 1.5 }), /invalid argument for amount/);
  });

  it('submits exactly one of txHex, halfSigned or txRequestId', async function () {
    const { wallet, transport } = setup();
    await assert.rejects(() => wallet.submitTransaction({}), /must supply either txHex or halfSigned/);
    await assert.rejects(
      () => wallet.submitTransaction({ txHex: 'a', txRequestId: 'r' }),
      /must supply exactly one of txRequestId/
    );
    await wallet.submitTransaction({ txHex: 'abc', otp: '000000' });
    transport.requests[0].body!.should.deepEqual({ txHex: 'abc', otp: '000000' });
  });

  it('points TSS signing at sdk-core', async function () {
    const { wallet } = setup(fakeCoin(), { ...walletData, multisigType: 'tss' });
    await assert.rejects(() => wallet.signTransaction({ txPrebuild: {} }), /needs Wallet from @bitgo\/sdk-core/);
  });
});

describe('CoreWallets', function () {
  it('gets and adds wallets over the transport', async function () {
    const transport = createRecordingTransport(bitgoHandler);
    const wallets = new CoreWallets({ transport, coin: fakeCoin() });

    const fetched = await wallets.get({ id: 'w1' });
    fetched.should.be.instanceOf(CoreWallet);
    fetched.label().should.equal('renamed');

    const added = await wallets.add({ label: 'new', keys: ['a', 'b', 'c'], m: 2, n: 3 });
    added.label().should.equal('new');
    transport.requests[1].should.deepEqual({
      method: 'POST',
      path: '/tbtc/wallet/add',
      body: { label: 'new', keys: ['a', 'b', 'c'], m: 2, n: 3 },
      tracer: undefined,
    });
  });
});
