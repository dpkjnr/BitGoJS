import { TxSendBody } from '@bitgo/public-types';
import { decryptKeychainPrivateKey, defaultKeyDecrypter, KeyDecrypter } from '@bitgo/sdk-keys';
import { TransportRequest, TransportTracer, WalletTransport } from '@bitgo/sdk-transport';
import * as t from 'io-ts';
import { buildParamKeys } from './buildParams';
import {
  CoreCoin,
  CoreCreateAddressOptions,
  CoreGetPrvOptions,
  CoreKeychain,
  CorePrebuildAndSignTransactionOptions,
  CorePrebuildResult,
  CorePrebuildTransactionOptions,
  CoreSendManyOptions,
  CoreSendOptions,
  CoreSignedTransaction,
  CoreSignTransactionOptions,
  CoreSubmitTransactionOptions,
  CoreTransactionPrebuild,
  CoreVerifyAddressOptions,
  CoreWalletContext,
  CoreWalletData,
  OptionsObject,
} from './types';

const sendBodyKeys = TxSendBody.type.types.flatMap((codec) => Object.keys(codec.props));
const sendBodyCodec = t.intersection([TxSendBody, t.partial({ locktime: t.number })]);

function pick(obj: OptionsObject, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) {
      out[key] = (obj as Record<string, unknown>)[key];
    }
  }
  return out;
}

/**
 * A BitGo wallet limited to what every integration needs: read its data, create a receive address,
 * build, sign and send transactions. It talks to BitGo only through a {@link WalletTransport}.
 *
 * TSS wallets can be read and receive addresses, but signing them still needs `Wallet` from
 * `@bitgo/sdk-core`, which extends this class.
 */
export class CoreWallet<TData extends CoreWalletData = CoreWalletData, TCoin extends CoreCoin = CoreCoin> {
  public readonly baseCoin: TCoin;
  public _wallet: TData;
  /** For feature packages; not for application code. */
  public readonly context: Readonly<CoreWalletContext<TCoin>>;

  constructor(context: CoreWalletContext<TCoin>, walletData: TData) {
    this.context = context;
    this.baseCoin = context.coin;
    this._wallet = walletData;
  }

  protected get transport(): WalletTransport {
    return this.context.transport;
  }

  protected get keyDecrypter(): KeyDecrypter {
    return this.context.keyDecrypter ?? defaultKeyDecrypter;
  }

  /** Path of this wallet relative to the platform API, e.g. `/tbtc/wallet/abc/address`. */
  protected walletPath(extra = ''): string {
    return '/' + this.baseCoin.getChain() + '/wallet/' + this.id() + extra;
  }

  protected request<T>(req: TransportRequest): Promise<T> {
    return this.transport.request<T>(req);
  }

  id(): string {
    return this._wallet.id;
  }

  coin(): string {
    return this._wallet.coin;
  }

  label(): string {
    return this._wallet.label;
  }

  /** Public object ids of this wallet's keychains, ordered user, backup, bitgo. */
  keyIds(): string[] {
    return this._wallet.keys;
  }

  type(): NonNullable<TData['type']> | 'hot' {
    return this._wallet.type || 'hot';
  }

  multisigType(): TData['multisigType'] {
    return this._wallet.multisigType;
  }

  multisigTypeVersion(): TData['multisigTypeVersion'] {
    return this._wallet.multisigTypeVersion;
  }

  /** String balances avoid overflowing JavaScript numbers. */
  balanceString(): TData['balanceString'] {
    return this._wallet.balanceString;
  }

  confirmedBalanceString(): TData['confirmedBalanceString'] {
    return this._wallet.confirmedBalanceString;
  }

  spendableBalanceString(): TData['spendableBalanceString'] {
    return this._wallet.spendableBalanceString;
  }

  receiveAddress(): string | undefined {
    return this._wallet.receiveAddress?.address;
  }

  coinSpecific(): TData['coinSpecific'] | undefined {
    return this._wallet.coinSpecific;
  }

  /** Whether OFC signing needs the user key; read from the wallet document. */
  userKeySigningRequired(): boolean {
    return this._wallet.coinSpecific?.userKeySigningRequired ?? this._wallet.userKeySigningRequired ?? true;
  }

  toJSON(): TData {
    return this._wallet;
  }

  /** Reload the wallet document from BitGo. */
  async refresh(params: Record<string, never> = {}): Promise<this> {
    this._wallet = await this.request<TData>({ method: 'GET', path: this.walletPath() });
    return this;
  }

  /** Fetch this wallet's keychains (user, backup, bitgo). */
  async getKeychains(reqId?: TransportTracer): Promise<CoreKeychain[]> {
    return Promise.all(
      this.keyIds().map((id) =>
        this.request<CoreKeychain>({
          method: 'GET',
          path: '/' + this.baseCoin.getChain() + '/key/' + encodeURIComponent(id),
          tracer: reqId,
        })
      )
    );
  }

  /**
   * Create a receive address. For coins that can check an address against the wallet keys
   * (`isWalletAddress`), the new address is verified before it is returned.
   */
  async createAddress(params: CoreCreateAddressOptions = {}): Promise<Record<string, unknown>> {
    const { chain, label, format, onToken, reqId } = params;
    if (chain !== undefined && !Number.isInteger(chain)) {
      throw new Error('chain has to be an integer');
    }
    if (this.baseCoin.getFamily() === 'ofc' && typeof onToken !== 'string') {
      throw new Error('onToken is a mandatory parameter for OFC wallets');
    }
    const body = Object.fromEntries(
      Object.entries({ chain, label, format, onToken }).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;

    const address = await this.request<Record<string, unknown>>({
      method: 'POST',
      path: this.walletPath('/address'),
      body,
      tracer: reqId,
    });
    if (address.error) {
      throw new Error(`address generation failed: ${String(address.error)}`);
    }

    const coinSpecific = address.coinSpecific as { pendingChainInitialization?: boolean } | undefined;
    if (this.baseCoin.getFamily() === 'ofc' || !coinSpecific || coinSpecific.pendingChainInitialization) {
      return address;
    }
    const keychains = await this.getKeychains(reqId);
    let isWalletAddress: boolean;
    try {
      const verification: CoreVerifyAddressOptions & Record<string, unknown> = {
        ...address,
        address: address.address as string,
        keychains,
        rootAddress: this.receiveAddress(),
        walletVersion: this._wallet.coinSpecific?.walletVersion,
        multisigTypeVersion: this.multisigTypeVersion(),
      };
      isWalletAddress = await this.baseCoin.isWalletAddress(verification, this);
    } catch (e) {
      // Coins without address verification throw MethodNotImplementedError; match sdk-core and accept.
      if ((e as Error)?.name !== 'MethodNotImplementedError') {
        throw e;
      }
      isWalletAddress = true;
    }
    if (!isWalletAddress) {
      throw new Error('not a wallet address');
    }
    return address;
  }

  /**
   * Return the user private key: `prv` if given, otherwise the user keychain decrypted with
   * `walletPassphrase`.
   */
  async getPrv(params: CoreGetPrvOptions = {}): Promise<string> {
    if (params.prv !== undefined) {
      if (typeof params.prv !== 'string') {
        throw new Error('prv must be a string');
      }
      return params.prv;
    }
    if (typeof params.walletPassphrase !== 'string') {
      throw new Error('must either provide prv or wallet passphrase');
    }
    const keychain =
      params.keychain ??
      (await this.request<CoreKeychain>({
        method: 'GET',
        path: '/' + this.baseCoin.getChain() + '/key/' + encodeURIComponent(this.keyIds()[0]),
      }));
    if (!keychain.encryptedPrv && !keychain.webauthnDevices?.length) {
      throw new Error('the user keychain does not have property encryptedPrv');
    }
    const prv = await decryptKeychainPrivateKey(this.keyDecrypter, keychain, params.walletPassphrase);
    if (!prv) {
      throw new Error('unable to decrypt keychain with the given wallet passphrase');
    }
    return prv;
  }

  protected assertOnchain(action: string): void {
    if (this.multisigType() !== 'onchain') {
      throw new Error(`${action} for ${this.multisigType()} wallets needs Wallet from @bitgo/sdk-core`);
    }
  }

  /** Ask BitGo to build a transaction. Only whitelisted build parameters leave the process. */
  async prebuildTransaction(params: CorePrebuildTransactionOptions = {}): Promise<CorePrebuildResult> {
    this.assertOnchain('prebuildTransaction');
    const buildParams = this.baseCoin.preprocessBuildParams(pick(params, buildParamKeys));
    Object.assign(buildParams, await this.baseCoin.getExtraPrebuildParams({ ...params, wallet: this }));

    const response = await this.request<CoreTransactionPrebuild>({
      method: 'POST',
      path: this.walletPath('/tx/build'),
      query: { offlineVerification: params.offlineVerification ? true : undefined },
      body: buildParams,
      tracer: params.reqId,
    });
    const processed = (await this.baseCoin.postProcessPrebuild({
      ...response,
      wallet: this,
      buildParams,
    } as CoreTransactionPrebuild)) as CoreTransactionPrebuild & Record<string, unknown>;
    const prebuild = { ...processed };
    delete prebuild.wallet;
    delete prebuild.buildParams;

    const walletContractAddress = this._wallet.coinSpecific?.baseAddress;
    return {
      ...prebuild,
      walletId: this.id(),
      ...(walletContractAddress && !params.walletContractAddress ? { walletContractAddress } : {}),
      reqId: params.reqId,
    } as CorePrebuildResult;
  }

  /** Sign a prebuilt transaction with the user key. */
  async signTransaction(params: CoreSignTransactionOptions = {}): Promise<CoreSignedTransaction> {
    this.assertOnchain('signTransaction');
    const { txPrebuild } = params;
    if (!txPrebuild || typeof txPrebuild !== 'object') {
      throw new Error('txPrebuild is required for on-chain multisig wallets');
    }

    let { pubs } = params;
    if (!pubs && this.baseCoin.keyIdsForSigning().length > 1) {
      pubs = (await this.getKeychains(params.reqId)).map((k) => {
        if (!k.pub) {
          throw new Error(`keychain ${k.id} has no pub`);
        }
        return k.pub;
      });
    }

    const presign = await this.baseCoin.presignTransaction({ ...params, walletData: this._wallet });
    const needsUserKey = this.baseCoin.getFamily() !== 'ofc' || this.userKeySigningRequired();
    const prv = needsUserKey ? await this.getPrv(presign as CoreGetPrvOptions) : undefined;

    return this.baseCoin.signTransaction({
      ...presign,
      txPrebuild: { ...txPrebuild, walletId: this.id() },
      pubs,
      prv,
      wallet: this,
      coin: this.baseCoin,
    });
  }

  /** Build a transaction, verify BitGo built what was asked for, and sign it. */
  async prebuildAndSignTransaction(params: CorePrebuildAndSignTransactionOptions = {}): Promise<CoreSignedTransaction> {
    this.assertOnchain('prebuildAndSignTransaction');
    if (params.prebuildTx && params.recipients) {
      throw new Error('Only one of prebuildTx and recipients may be specified');
    }
    if (params.recipients && !Array.isArray(params.recipients)) {
      throw new Error('expecting recipients array');
    }

    if (typeof params.prebuildTx === 'string') {
      throw new Error('prebuildTx as a txRequest id needs Wallet from @bitgo/sdk-core');
    }

    const keychains = await this.getKeychains(params.reqId);
    const txPrebuild = params.prebuildTx ?? (await this.prebuildTransaction(params));
    await this.baseCoin.verifyTransaction({
      txParams: { ...params },
      txPrebuild,
      wallet: this,
      verification: params.verification ?? {},
      reqId: params.reqId,
      walletType: this.multisigType(),
    });

    const signingParams: CoreSignTransactionOptions & Record<string, unknown> = {
      ...params,
      txPrebuild,
      keychain: params.keychain ?? keychains[0],
      backupKeychain: keychains[1],
      bitgoKeychain: keychains[2],
      pubs: keychains.map((k) => {
        if (!k.pub) {
          throw new Error(`keychain ${k.id} has no pub`);
        }
        return k.pub;
      }),
    };
    return this.signTransaction(signingParams);
  }

  /** Send a signed transaction (or a signed txRequest) to BitGo for co-signing and broadcast. */
  async submitTransaction(params: CoreSubmitTransactionOptions = {}, reqId?: TransportTracer): Promise<unknown> {
    const hasTxHex = !!params.txHex;
    const hasHalfSigned = !!params.halfSigned;
    if (params.txRequestId && (hasTxHex || hasHalfSigned)) {
      throw new Error('must supply exactly one of txRequestId, txHex, or halfSigned');
    } else if (!params.txRequestId && hasTxHex === hasHalfSigned) {
      throw new Error('must supply either txHex or halfSigned, but not both');
    }
    return this.postSendBody('/tx/send', params, reqId);
  }

  /** Send `amount` to `address`. */
  async send(params: CoreSendOptions = {}): Promise<unknown> {
    const { address, amount } = params;
    if (amount === undefined) {
      throw new Error('missing required parameter amount');
    }
    if (typeof address !== 'string') {
      throw new Error('missing required parameter address');
    }
    const isNonNegativeInteger =
      typeof amount === 'number' ? Number.isInteger(amount) && amount >= 0 : /^\d+$/.test(amount);
    const isZero = Number(amount) === 0;
    if (!isNonNegativeInteger || (isZero && !this.baseCoin.valuelessTransferAllowed())) {
      throw new Error('invalid argument for amount - Integer greater than zero or numeric string expected');
    }
    const recipient: CoreSendManyOptions['recipients'] = [{ address, amount }];
    if (params.tokenName) {
      recipient[0].tokenName = params.tokenName;
    }
    if (params.data && this.baseCoin.transactionDataAllowed()) {
      recipient[0].data = params.data;
    }
    return this.sendMany({ ...params, recipients: recipient });
  }

  /** Build, sign and send a transaction to one or more recipients. */
  async sendMany(params: CoreSendManyOptions = {}): Promise<unknown> {
    if (Array.isArray(params.recipients)) {
      for (const recipient of params.recipients) {
        this.baseCoin.checkRecipient(recipient);
      }
    }
    this.assertOnchain('sendMany');
    const selectParams = pick(params, [...buildParamKeys, 'comment', 'otp', 'hop']);

    if (this._wallet.type === 'custodial') {
      Object.assign(selectParams, await this.baseCoin.getExtraPrebuildParams({ ...params, wallet: this }));
      return this.postSendBody('/tx/initiate', selectParams, params.reqId);
    }

    const signed = await this.prebuildAndSignTransaction(params);
    const extraParams = await this.baseCoin.getExtraPrebuildParams({ ...params, wallet: this });
    return this.postSendBody('/tx/send', { ...signed, ...selectParams, ...extraParams }, params.reqId);
  }

  private postSendBody(path: string, params: OptionsObject, reqId?: TransportTracer): Promise<unknown> {
    const body = this.baseCoin.preprocessBuildParams(pick(params, sendBodyKeys));
    let encoded: unknown = body;
    try {
      encoded = sendBodyCodec.encode(body as t.TypeOf<typeof sendBodyCodec>);
    } catch (e) {
      // Same fallback as sdk-core's postWithCodec: send the body as is.
    }
    return this.request({ method: 'POST', path: this.walletPath(path), body: encoded, tracer: reqId });
  }
}
