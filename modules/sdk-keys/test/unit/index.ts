import 'should';
import * as assert from 'assert';
import { bip32 } from '@bitgo/secp256k1';
import {
  createEncryptionSession,
  decrypt,
  Ecdsa,
  Eddsa,
  encrypt,
  getSharedSecret,
  ShamirSecret,
  signMessage,
  verifyMessage,
} from '../../src';

describe('@bitgo/sdk-keys public API', function () {
  it('round-trips v1 and v2 password encryption', async function () {
    const v1 = await encrypt('pw', 'secret', { encryptionVersion: 1 });
    (await decrypt('pw', v1)).should.equal('secret');

    const v2 = await encrypt('pw', 'secret');
    JSON.parse(v2).v.should.equal(2);
    (await decrypt('pw', v2)).should.equal('secret');

    await assert.rejects(() => decrypt('wrong', v1));
  });

  it('encrypts several values with one session', async function () {
    const session = await createEncryptionSession('pw');
    try {
      const ct = await session.encrypt('a');
      (await decrypt('pw', ct)).should.equal('a');
    } finally {
      session.destroy();
    }
  });

  it('derives the same ECDH secret from both sides', function () {
    const alice = bip32.fromSeed(Buffer.alloc(32, 1));
    const bob = bip32.fromSeed(Buffer.alloc(32, 2));
    getSharedSecret(alice, bob.neutered())
      .toString('hex')
      .should.equal(getSharedSecret(bob, alice.neutered()).toString('hex'));
  });

  it('signs and verifies a message with a bip32 key', function () {
    const key = bip32.fromSeed(Buffer.alloc(32, 3));
    const network = { messagePrefix: '\x18Bitcoin Signed Message:\n' };
    const sig = signMessage('hello', key, network);
    verifyMessage('hello', key, sig, network).should.be.true();
  });

  it('exposes the MPC primitives', function () {
    Ecdsa.should.be.a.Function();
    Eddsa.should.be.a.Function();
    ShamirSecret.should.be.ok();
  });
});
