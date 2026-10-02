# @bitgo/sdk-keys

Key management, password encryption and MPC/TSS primitives for BitGoJS, with no network dependencies.

This is the bottom layer of the SDK: code that creates, encrypts, decrypts and combines keys. It never talks to the
BitGo API, so it can be used offline, in signing services, or in any environment where pulling in an HTTP client is
undesirable.

## What's in it

| Area | Exports |
| --- | --- |
| Password encryption | `encrypt`, `decrypt`, `encryptV2`, `decryptV2`, `decryptV1`, `createEncryptionSession`, `EncryptionSession` |
| MPC/TSS | `Ecdsa`, `ECDSA`, `Eddsa`, `EDDSA`, `rangeProof`, `ShamirSecret`, `Ed25519Curve`, `Secp256k1Curve`, `HDTree`, `BIP32`, `Ed25519BIP32` |
| ECDH | `getSharedSecret`, `signMessageWithDerivedEcdhKey`, `verifyEcdhSignature` |
| BIP32 message signing | `signMessage`, `verifyMessage` |
| io-ts helpers | `boundedInt`, `base64String`, `decodeWithCodec` |

`@bitgo/sdk-core` and `@bitgo/sdk-api` re-export everything they exported before, so existing imports keep working.

## The network boundary

`yarn lint` runs `scripts/check-no-network.js`, which fails if this package:

- depends on an HTTP client or a BitGo layer above it (`@bitgo/sdk-core`, `@bitgo/sdk-api`, `@bitgo/statics`,
  `@bitgo/utxo-lib`, `superagent`, `axios`, ...)
- imports a Node networking module (`http`, `https`, `net`, `tls`, `dns`, ...)
- imports any package that isn't a declared dependency

The same list is enforced in editors through `no-restricted-imports` in `.eslintrc.json`.
