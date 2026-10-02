# @bitgo/sdk-transport

The HTTP transport interface that BitGoJS wallet code calls instead of a concrete client.

A request is plain data, so a transport is easy to implement, mock, log or proxy:

```ts
import { WalletTransport } from '@bitgo/sdk-transport';

const wallet = await transport.request({ method: 'GET', path: '/tbtc/wallet/abc' });
const settings = await transport.request({ method: 'GET', service: 'microservice', path: '/api/v2/tss/settings' });
```

The package has no runtime dependencies. `@bitgo/sdk-core` provides `transportFromBitGo(bitgo)`, which adapts an
existing `BitGoAPI` / `BitGo` instance, so authentication, request signing and proxies keep working as before.

`createRecordingTransport(handler)` records requests and answers them from `handler`, for unit tests.
