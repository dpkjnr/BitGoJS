import * as sinon from 'sinon';
import 'should';
import { transportFromBitGo } from '../../../src/bitgo/transport';

describe('transportFromBitGo', function () {
  function mockBitGo(result: unknown = { ok: true }) {
    const req = {
      query: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      result: sinon.stub().resolves(result),
    };
    const bitgo = {
      get: sinon.stub().returns(req),
      post: sinon.stub().returns(req),
      put: sinon.stub().returns(req),
      patch: sinon.stub().returns(req),
      del: sinon.stub().returns(req),
      url: sinon.stub().callsFake((path: string, version = 1) => `https://bitgo.test/api/v${version}${path}`),
      microservicesUrl: sinon.stub().callsFake((path: string) => `https://bitgo.test${path}`),
      setRequestTracer: sinon.stub(),
    };
    return { bitgo, req };
  }

  it('sends api requests to platform API v2 by default', async function () {
    const { bitgo, req } = mockBitGo({ id: 'w1' });
    const res = await transportFromBitGo(bitgo as any).request({
      method: 'POST',
      path: '/tbtc/wallet/add',
      body: { label: 'x' },
    });
    res.should.deepEqual({ id: 'w1' });
    bitgo.post.calledOnceWithExactly('https://bitgo.test/api/v2/tbtc/wallet/add').should.be.true();
    req.send.calledOnceWithExactly({ label: 'x' }).should.be.true();
    req.query.called.should.be.false();
    bitgo.setRequestTracer.called.should.be.false();
  });

  it('honours version, query and the microservice root', async function () {
    const { bitgo, req } = mockBitGo();
    const transport = transportFromBitGo(bitgo as any);
    await transport.request({ method: 'GET', path: '/enterprise/e1/user', version: 1 });
    bitgo.get.firstCall.args[0].should.equal('https://bitgo.test/api/v1/enterprise/e1/user');

    await transport.request({
      method: 'GET',
      service: 'microservice',
      path: '/api/v2/tss/settings',
      query: { enterprise: 'e1' },
    });
    bitgo.get.secondCall.args[0].should.equal('https://bitgo.test/api/v2/tss/settings');
    req.query.calledOnceWithExactly({ enterprise: 'e1' }).should.be.true();
    req.send.called.should.be.false();
  });

  it('maps every method and sets the tracer', async function () {
    const { bitgo } = mockBitGo();
    const transport = transportFromBitGo(bitgo as any);
    const tracer = { inc: () => undefined, toString: () => 'req-1' };
    await transport.request({ method: 'PUT', path: '/a', tracer });
    await transport.request({ method: 'PATCH', path: '/a' });
    await transport.request({ method: 'DELETE', path: '/a' });
    bitgo.put.calledOnce.should.be.true();
    bitgo.patch.calledOnce.should.be.true();
    bitgo.del.calledOnce.should.be.true();
    bitgo.setRequestTracer.calledOnceWithExactly(tracer).should.be.true();
  });

  it('propagates client errors', async function () {
    const { bitgo, req } = mockBitGo();
    req.result.rejects(Object.assign(new Error('not found'), { status: 404 }));
    await transportFromBitGo(bitgo as any)
      .request({ method: 'GET', path: '/x' })
      .should.be.rejectedWith({ status: 404 });
  });
});
