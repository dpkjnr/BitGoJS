/**
 * @prettier
 */
import { HttpMethod, TransportRequest, WalletTransport } from '@bitgo/sdk-transport';
import { BitGoRequest } from '../api';
import { BitGoBase } from './bitgoBase';

export type { HttpMethod, TransportRequest, WalletTransport } from '@bitgo/sdk-transport';

const methodMap: Record<HttpMethod, 'get' | 'post' | 'put' | 'patch' | 'del'> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'del',
};

/**
 * Resolve the absolute URL for a transport request against a BitGo client.
 */
export function transportUrl(bitgo: Pick<BitGoBase, 'url' | 'microservicesUrl'>, req: TransportRequest): string {
  const { service = 'api', version = 2, path } = req;
  return service === 'microservice' ? bitgo.microservicesUrl(path) : bitgo.url(path, version);
}

/**
 * Adapt an existing BitGo client (`BitGoAPI`, `BitGo`) to the {@link WalletTransport} interface.
 *
 * Requests go through the client's own `get`/`post`/... methods, so authentication, HMAC request
 * signing, proxies and error handling behave exactly as when wallet code called the client directly.
 */
export function transportFromBitGo(bitgo: BitGoBase): WalletTransport {
  return {
    async request(req: TransportRequest) {
      if (req.tracer) {
        bitgo.setRequestTracer(req.tracer);
      }
      let call: BitGoRequest = bitgo[methodMap[req.method]](transportUrl(bitgo, req));
      if (req.query) {
        call = call.query(req.query) as BitGoRequest;
      }
      if (req.body !== undefined) {
        call = call.send(req.body as string | Record<string, unknown>) as BitGoRequest;
      }
      return call.result();
    },
  };
}
