# @bitgo/sdk-wallet

The slim BitGo wallet core: create, get, sign and send, over a `WalletTransport`.

It depends only on `@bitgo/sdk-keys` and `@bitgo/sdk-transport` (plus `io-ts` and `@bitgo/public-types` for the
request whitelists). It does not import `@bitgo/sdk-core`, `@bitgo/sdk-api`, superagent, staking, trading, defi,
lightning or webhooks.

```ts
import { CoreWallets } from '@bitgo/sdk-wallet';

const wallets = new CoreWallets({ transport, coin });
const wallet = await wallets.get({ id });
await wallet.createAddress();
await wallet.send({ address, amount: '10000', walletPassphrase });
```

- `transport` is any `WalletTransport`. `transportFromBitGo(bitgo)` from `@bitgo/sdk-core` adapts an existing
  `BitGoAPI`.
- `coin` is any `CoreCoin`. Every coin class from the `sdk-coin-*` packages satisfies it.
- `keyDecrypter` is optional and defaults to `defaultKeyDecrypter` from `@bitgo/sdk-keys`.

`CoreWallet` signs on-chain multisig wallets. TSS wallets can be read and receive addresses, but signing them still
needs `Wallet` from `@bitgo/sdk-core`, which extends `CoreWallet`.

Build parameters are whitelisted (`buildParamKeys`) before they reach `/tx/build`, so passphrases and keys never leave
the process.
