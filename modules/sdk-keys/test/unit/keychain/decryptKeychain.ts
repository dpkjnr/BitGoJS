import * as assert from 'assert';
import { decryptKeychainPrivateKey, defaultKeyDecrypter, encrypt, KeyDecrypter } from '../../../src';

describe('decryptKeychainPrivateKey', function () {
  it('decrypts the keychain envelope with the default decrypter', async function () {
    const encryptedPrv = await encrypt('pw', 'xprv-secret');
    assert.strictEqual(await decryptKeychainPrivateKey(defaultKeyDecrypter, { encryptedPrv }, 'pw'), 'xprv-secret');
  });

  it('falls back to webauthn device envelopes', async function () {
    const encryptedPrv = await encrypt('other', 'xprv-secret');
    const deviceEnvelope = await encrypt('pw', 'xprv-secret');
    const keychain = { encryptedPrv, webauthnDevices: [{ encryptedPrv: deviceEnvelope }] };
    assert.strictEqual(await decryptKeychainPrivateKey(defaultKeyDecrypter, keychain, 'pw'), 'xprv-secret');
  });

  it('returns undefined when no envelope matches', async function () {
    const encryptedPrv = await encrypt('other', 'xprv-secret');
    assert.strictEqual(await decryptKeychainPrivateKey(defaultKeyDecrypter, { encryptedPrv }, 'pw'), undefined);
  });

  it('accepts any decrypter, such as a BitGo client', async function () {
    const inputs: string[] = [];
    const decrypter: KeyDecrypter = {
      decrypt: async ({ input }) => {
        inputs.push(input);
        return 'from-client';
      },
    };
    assert.strictEqual(await decryptKeychainPrivateKey(decrypter, { encryptedPrv: 'env' }, 'pw'), 'from-client');
    assert.deepStrictEqual(inputs, ['env']);
  });
});
