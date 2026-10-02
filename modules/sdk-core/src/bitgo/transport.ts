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
      if (req.retries) {
        call = call.retry(req.retries) as BitGoRequest;
      }
      if (req.body !== undefined) {
        call = call.send(req.body as string | Record<string, unknown>) as BitGoRequest;
      }
      return call.result();
    },
  };
}

/** Anything wallet and key code accepts where it needs to talk to BitGo: a client or a bare transport. */
export type TransportSource = BitGoBase | WalletTransport;

function isWalletTransport(source: TransportSource): source is WalletTransport {
  return typeof (source as WalletTransport).request === 'function' && typeof (source as BitGoBase).url !== 'function';
}

/**
 * Return `source` as a {@link WalletTransport}, adapting a BitGo client with {@link transportFromBitGo}.
 * Lets functions that used to take `BitGoBase` also accept a transport, without breaking existing callers.
 */
export function asTransport(source: TransportSource): WalletTransport {
  return isWalletTransport(source) ? source : transportFromBitGo(source);
}
