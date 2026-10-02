export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** BitGo service a request is sent to. */
export type TransportService = 'api' | 'microservice';

/**
 * Request tracer passed through to the client so related requests share an id.
 * Structurally the same as `IRequestTracer` in `@bitgo/sdk-core`.
 */
export interface TransportTracer {
  inc(): void;
  toString(): string;
}

export interface TransportRequest {
  method: HttpMethod;
  /**
   * Path relative to the service root, e.g. `/tbtc/wallet/add`.
   * For `service: 'microservice'` this is the full path, e.g. `/api/v2/tss/settings`.
   */
  path: string;
  /** 'api' resolves to the platform API (`/api/v{version}`), 'microservice' to the microservices root. Default 'api'. */
  service?: TransportService;
  /** Platform API version, only used for `service: 'api'`. Default 2. */
  version?: 1 | 2 | 3;
  /** Query string parameters, serialized by the transport. Accepts existing option interfaces as-is. */
  // eslint-disable-next-line @typescript-eslint/ban-types
  query?: object;
  body?: unknown;
  /** Request tracer for this call. */
  tracer?: TransportTracer;
  /** Number of times the transport may retry the request on network errors and 5xx responses. Default 0. */
  retries?: number;
}

/**
 * The only thing wallet code needs from an HTTP client: send a request described as plain data
 * and resolve with the decoded response body.
 *
 * Implementations own URL building, authentication, request signing and retries. They reject with
 * the client's API error (status and body) on non-2xx responses.
 */
export interface WalletTransport {
  request<T = any>(req: TransportRequest): Promise<T>;
}

export type TransportHandler = (req: TransportRequest) => unknown | Promise<unknown>;

export interface RecordingTransport extends WalletTransport {
  /** Every request sent through this transport, in order. */
  readonly requests: TransportRequest[];
}

/**
 * A transport that records each request and answers it with `handler`.
 * Intended for unit tests that check request shapes without a mocked HTTP layer.
 */
export function createRecordingTransport(handler: TransportHandler = () => ({})): RecordingTransport {
  const requests: TransportRequest[] = [];
  return {
    requests,
    async request<T>(req: TransportRequest): Promise<T> {
      requests.push(req);
      return (await handler(req)) as T;
    },
  };
}
