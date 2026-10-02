import * as assert from 'assert';
import * as sinon from 'sinon';
import { createRecordingTransport } from '@bitgo/sdk-transport';
import { getTxRequest, sendSignatureShareV2, sendTxRequest } from '../../../../src/bitgo/tss/common';
import { BitGoBase, RequestType, TxRequest, MPCAlgorithm } from '../../../../src';

describe('sendSignatureShareV2 request type dispatch', function () {
  afterEach(function () {
    sinon.restore();
  });

  async function captureRequestType(
    mpcAlgorithm: MPCAlgorithm,
    multisigTypeVersion: 'MPCv2' | undefined
  ): Promise<string> {
    let capturedBody: { type: string } | undefined;
    const send = sinon.stub().callsFake((body) => {
      capturedBody = body;
      return { result: sinon.stub().resolves({} as TxRequest) };
    });
    const mockBitGo = {
      url: sinon.stub().returns('/mock/url'),
      post: sinon.stub().returns({ send }),
      setRequestTracer: sinon.stub(),
    } as unknown as BitGoBase;

    await sendSignatureShareV2(
      mockBitGo,
      'walletId',
      'txRequestId',
      [],
      RequestType.tx,
      mpcAlgorithm,
      'signerGpgPublicKey',
      undefined,
      multisigTypeVersion
    );

    if (!capturedBody) {
      throw new Error('request body should have been captured');
    }
    return capturedBody.type;
  }

  it('resolves ecdsaMpcV2 for MPCv2 + ecdsa', async function () {
    assert.strictEqual(await captureRequestType('ecdsa', 'MPCv2'), 'ecdsaMpcV2');
  });

  it('resolves eddsaMpcV2 for MPCv2 + eddsa', async function () {
    assert.strictEqual(await captureRequestType('eddsa', 'MPCv2'), 'eddsaMpcV2');
  });

  it('resolves redpallasMpcV2 for MPCv2 + redpallas', async function () {
    assert.strictEqual(await captureRequestType('redpallas', 'MPCv2'), 'redpallasMpcV2');
  });

  it('resolves eddsaMpcV1 for undefined multisigTypeVersion + eddsa', async function () {
    assert.strictEqual(await captureRequestType('eddsa', undefined), 'eddsaMpcV1');
  });

  it('resolves an empty type for redpallas without MPCv2 (no MPCv1 variant exists)', async function () {
    assert.strictEqual(await captureRequestType('redpallas', undefined), '');
  });
});

describe('tss common helpers over a WalletTransport', function () {
  const tracer = { inc: () => undefined, toString: () => 'req-1' };

  it('getTxRequest asks for the latest txRequest with retries', async function () {
    const txRequest = { txRequestId: 'tx-1' } as TxRequest;
    const transport = createRecordingTransport(() => ({ txRequests: [txRequest] }));

    const result = await getTxRequest(transport, 'wallet-1', 'tx-1', tracer);

    assert.strictEqual(result, txRequest);
    assert.deepStrictEqual(transport.requests, [
      {
        method: 'GET',
        path: '/wallet/wallet-1/txrequests',
        query: { txRequestIds: 'tx-1', latest: 'true' },
        retries: 3,
        tracer,
      },
    ]);
  });

  it('getTxRequest throws when no txRequest matches', async function () {
    const transport = createRecordingTransport(() => ({ txRequests: [] }));
    await assert.rejects(getTxRequest(transport, 'wallet-1', 'tx-1'), /Unable to find TxRequest with id tx-1/);
  });

  it('sendSignatureShareV2 posts to the sign route', async function () {
    const transport = createRecordingTransport(() => ({}));

    await sendSignatureShareV2(
      transport,
      'wallet-1',
      'tx-1',
      [],
      RequestType.message,
      'ecdsa',
      'gpg-pub',
      undefined,
      'MPCv2',
      tracer
    );

    assert.deepStrictEqual(transport.requests, [
      {
        method: 'POST',
        path: '/wallet/wallet-1/txrequests/tx-1/messages/0/sign',
        body: { type: 'ecdsaMpcV2', signatureShares: [], signerShare: undefined, signerGpgPublicKey: 'gpg-pub' },
        tracer,
      },
    ]);
  });

  it('sendSignatureShareV2 retries on 429', async function () {
    // Skip the backoff sleep.
    sinon.stub(global, 'setTimeout').callsFake(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
    let calls = 0;
    const transport = createRecordingTransport(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      }
      return { txRequestId: 'tx-1' };
    });

    const result = await sendSignatureShareV2(transport, 'wallet-1', 'tx-1', [], RequestType.tx, 'eddsa', 'gpg-pub');
    sinon.restore();

    assert.deepStrictEqual(result, { txRequestId: 'tx-1' });
    assert.strictEqual(transport.requests.length, 2);
  });

  it('sendTxRequest posts without a body', async function () {
    const transport = createRecordingTransport(() => ({}));
    await sendTxRequest(transport, 'wallet-1', 'tx-1', RequestType.tx, tracer);
    assert.deepStrictEqual(transport.requests, [
      { method: 'POST', path: '/wallet/wallet-1/txrequests/tx-1/transactions/0/send', tracer },
    ]);
  });
});
