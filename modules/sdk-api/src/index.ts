export * from './api';
export * from './bitgoAPI';
// Password encryption moved to @bitgo/sdk-keys. Re-exported here so existing imports keep working.
export {
  aesGcmDecrypt,
  aesGcmEncrypt,
  ARGON2_DEFAULTS,
  argon2ToHkdfKey,
  bytesToWord,
  createEncryptionSession,
  CryptoModule,
  decrypt,
  decryptV1,
  decryptV1WithCrypto,
  decryptV1WithFallback,
  decryptV2,
  encrypt,
  EncryptionSession,
  encryptV2,
  GCM_IV_LENGTH,
  HKDF_SALT_LENGTH,
  hkdfDeriveAesKey,
  parseV1Envelope,
  parseV2Envelope,
  V1_MAX_ITER,
  V1EncryptionSession,
  V1Envelope,
  V2Envelope,
} from '@bitgo/sdk-keys';
export * from './util';
export * from './types';
