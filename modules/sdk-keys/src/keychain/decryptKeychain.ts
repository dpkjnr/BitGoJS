import { decrypt } from '../encryption';

/** Anything that can decrypt a key envelope, e.g. a BitGo client or {@link defaultKeyDecrypter}. */
export interface KeyDecrypter {
  decrypt(params: { input: string; password: string }): Promise<string>;
}

/** Decrypts with this package's own v1/v2 envelope code; no BitGo client needed. */
export const defaultKeyDecrypter: KeyDecrypter = {
  decrypt: ({ input, password }) => decrypt(password, input),
};

/** The encrypted private keys a keychain can carry: its own envelope plus one per webauthn device. */
export interface KeychainEncryptedKeys {
  encryptedPrv?: string;
  webauthnDevices?: { encryptedPrv?: string }[];
}

async function maybeDecrypt(decrypter: KeyDecrypter, input: string, password: string): Promise<string | undefined> {
  try {
    return await decrypter.decrypt({
      input,
      password,
    });
  } catch (_e) {
    return undefined;
  }
}

/**
 * Decrypts the private key of a keychain (supports v1 and v2 envelopes).
 * This method will try the password against the traditional encryptedPrv,
 * and any webauthn device encryptedPrvs.
 *
 * @param decrypter - decrypts one envelope; a BitGo client works as-is
 * @param keychain
 * @param password
 */
export async function decryptKeychainPrivateKey(
  decrypter: KeyDecrypter,
  keychain: KeychainEncryptedKeys,
  password: string
): Promise<string | undefined> {
  const prvs = [keychain.encryptedPrv, ...(keychain.webauthnDevices ?? []).map((d) => d.encryptedPrv)].filter(
    (prv): prv is string => prv !== undefined && prv !== null
  );
  for (const prv of prvs) {
    const decrypted = await maybeDecrypt(decrypter, prv, password);
    if (decrypted) {
      return decrypted;
    }
  }
  return undefined;
}
