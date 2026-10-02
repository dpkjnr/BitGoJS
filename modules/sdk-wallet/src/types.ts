import { KeyDecrypter } from '@bitgo/sdk-keys';
import { TransportTracer, WalletTransport } from '@bitgo/sdk-transport';

export type MultisigType = 'onchain' | 'tss';

/**
 * Any options object. Used where `@bitgo/sdk-core` passes its own option interfaces, which have no index
 * signature and so are not assignable to `Record<string, unknown>`.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type OptionsObject = object;

/** The coin-specific wallet fields core signing reads. */
export interface CoreWalletCoinSpecific {
  baseAddress?: string;
  rootAddress?: string;
  walletVersion?: number;
  userKeySigningRequired?: boolean;
}

/** The wallet document fields `CoreWallet` relies on. `@bitgo/sdk-core`'s `WalletData` is a superset. */
export interface CoreWalletData {
  id: string;
  coin: string;
  label: string;
  keys: string[];
  multisigType: MultisigType;
  multisigTypeVersion?: 'MPCv2';
  type?: string;
  balanceString?: string;
  confirmedBalanceString?: string;
  spendableBalanceString?: string;
  receiveAddress?: { address: string };
  coinSpecific?: CoreWalletCoinSpecific;
  /** @deprecated top-level fallback for `coinSpecific.userKeySigningRequired` */
  userKeySigningRequired?: boolean;
}

export interface CoreKeychain {
  id: string;
  pub?: string;
  commonKeychain?: string;
  encryptedPrv?: string;
  webauthnDevices?: { encryptedPrv?: string }[];
}

export interface CoreRecipient {
  address: string;
  amount: string | number;
  tokenName?: string;
  /** Contract call data; some coins accept structured token transfer data here. */
  data?: unknown;
}

/** A transaction prebuild as returned by `/tx/build` and post-processed by the coin. */
export interface CoreTransactionPrebuild {
  txHex?: string;
  txBase64?: string;
  txInfo?: unknown;
  walletId?: string;
}

export interface CorePrebuildResult extends CoreTransactionPrebuild {
  walletId: string;
}

/** What a coin's `signTransaction` returns: a half-signed or fully signed transaction. */
export interface CoreSignedTransaction {
  txHex?: string;
  halfSigned?: unknown;
  txRequestId?: string;
}

export interface CoreVerifyTransactionOptions {
  txPrebuild: CoreTransactionPrebuild;
  txParams: OptionsObject;
  wallet: unknown;
  verification?: unknown;
  reqId?: TransportTracer;
  walletType?: MultisigType;
}

export interface CorePresignTransactionOptions {
  txPrebuild?: CoreTransactionPrebuild;
  walletData: CoreWalletData;
  tssUtils?: unknown;
  [index: string]: unknown;
}

/** Coins receive the new address document plus `keychains`, `rootAddress` and wallet version fields. */
export interface CoreVerifyAddressOptions {
  address: string;
}

/**
 * The slice of a coin that create/get/sign/send needs. Every `IBaseCoin` from `@bitgo/sdk-core`
 * satisfies it, so existing coin classes can be passed in unchanged.
 */
export interface CoreCoin {
  getChain(): string;
  getFamily(): string;
  /** Indices into the wallet's keys whose pubs the coin needs when signing. */
  keyIdsForSigning(): number[];
  valuelessTransferAllowed(): boolean;
  transactionDataAllowed(): boolean;
  checkRecipient(recipient: CoreRecipient, options?: { allowZeroAmount?: boolean }): void;
  preprocessBuildParams(params: Record<string, unknown>): Record<string, unknown>;
  getExtraPrebuildParams(params: OptionsObject): Promise<Record<string, unknown>>;
  postProcessPrebuild(prebuild: CoreTransactionPrebuild): Promise<CoreTransactionPrebuild>;
  verifyTransaction(params: CoreVerifyTransactionOptions): Promise<boolean>;
  presignTransaction(params: CorePresignTransactionOptions): Promise<CorePresignTransactionOptions>;
  signTransaction(params: OptionsObject): Promise<CoreSignedTransaction>;
  isWalletAddress(params: CoreVerifyAddressOptions, wallet?: unknown): Promise<boolean>;
}

/** Everything a core wallet needs to work: a way to reach BitGo, a coin, and a way to decrypt keys. */
export interface CoreWalletContext<TCoin extends CoreCoin = CoreCoin> {
  transport: WalletTransport;
  coin: TCoin;
  /** Decrypts encrypted user keys. Defaults to `defaultKeyDecrypter` from `@bitgo/sdk-keys`. */
  keyDecrypter?: KeyDecrypter;
}

export interface CoreGetPrvOptions {
  prv?: string;
  walletPassphrase?: string;
  /** User keychain to decrypt; fetched from BitGo when omitted. */
  keychain?: CoreKeychain;
}

export interface CoreCreateAddressOptions {
  chain?: number;
  label?: string;
  format?: string;
  /** Required for OFC wallets. */
  onToken?: string;
  reqId?: TransportTracer;
}

export interface CorePrebuildTransactionOptions {
  recipients?: CoreRecipient[];
  offlineVerification?: boolean;
  walletContractAddress?: string;
  reqId?: TransportTracer;
}

export interface CoreSignTransactionOptions extends CoreGetPrvOptions {
  txPrebuild?: CoreTransactionPrebuild;
  pubs?: string[];
  reqId?: TransportTracer;
}

export interface CorePrebuildAndSignTransactionOptions extends CorePrebuildTransactionOptions, CoreGetPrvOptions {
  /** A prebuild from {@link CoreWallet.prebuildTransaction}; txRequest ids (TSS) are not supported here. */
  prebuildTx?: CorePrebuildResult | string;
  verification?: unknown;
}

export interface CoreSubmitTransactionOptions {
  txHex?: string;
  halfSigned?: unknown;
  txRequestId?: string;
  otp?: string;
  comment?: string;
}

export interface CoreSendManyOptions extends CorePrebuildAndSignTransactionOptions {
  comment?: string;
  otp?: string;
}

export interface CoreSendOptions extends CoreSendManyOptions {
  address?: string;
  amount?: string | number;
  tokenName?: string;
  data?: string;
}
