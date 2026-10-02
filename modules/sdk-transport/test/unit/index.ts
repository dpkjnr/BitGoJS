import 'should';
import { createRecordingTransport } from '../../src';

describe('createRecordingTransport', function () {
  it('records requests and returns the handler result', async function () {
    const transport = createRecordingTransport((req) => ({ path: req.path }));
    const res = await transport.request<{ path: string }>({ method: 'GET', path: '/tbtc/wallet', query: { limit: 1 } });
    res.should.deepEqual({ path: '/tbtc/wallet' });
    transport.requests.should.deepEqual([{ method: 'GET', path: '/tbtc/wallet', query: { limit: 1 } }]);
  });

  it('propagates handler errors', async function () {
    const transport = createRecordingTransport(() => {
      throw new Error('boom');
    });
    await transport.request({ method: 'POST', path: '/x' }).should.be.rejectedWith('boom');
    transport.requests.length.should.equal(1);
  });

  it('defaults to an empty object response', async function () {
    const transport = createRecordingTransport();
    (await transport.request({ method: 'DELETE', path: '/x' })).should.deepEqual({});
  });
});
