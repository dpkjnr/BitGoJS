import { TransportTracer } from '@bitgo/sdk-transport';
import { CoreWallet } from './coreWallet';
import { CoreCoin, CoreWalletContext, CoreWalletData, MultisigType } from './types';

export interface CoreAddWalletOptions {
  label: string;
  /** Keychain ids ordered user, backup, bitgo. */
  keys: string[];
  m?: number;
  n?: number;
  multisigType?: MultisigType;
  type?: string;
  enterprise?: string;
  reqId?: TransportTracer;
  [index: string]: unknown;
}

/** Create and look up {@link CoreWallet}s for one coin. */
export class CoreWallets<TCoin extends CoreCoin = CoreCoin> {
  public readonly context: Readonly<CoreWalletContext<TCoin>>;

  constructor(context: CoreWalletContext<TCoin>) {
    this.context = context;
  }

  protected path(extra: string): string {
    return '/' + this.context.coin.getChain() + extra;
  }

  protected wrap(data: CoreWalletData): CoreWallet<CoreWalletData, TCoin> {
    return new CoreWallet(this.context, data);
  }

  /** Fetch a wallet by id. */
  async get(params: { id: string; reqId?: TransportTracer }): Promise<CoreWallet<CoreWalletData, TCoin>> {
    if (typeof params.id !== 'string') {
      throw new Error('id must be a string');
    }
    const data = await this.context.transport.request<CoreWalletData>({
      method: 'GET',
      path: this.path('/wallet/' + encodeURIComponent(params.id)),
      tracer: params.reqId,
    });
    return this.wrap(data);
  }

  /** Fetch the wallet that owns `address`. */
  async getWalletByAddress(params: {
    address: string;
    reqId?: TransportTracer;
  }): Promise<CoreWallet<CoreWalletData, TCoin>> {
    if (typeof params.address !== 'string') {
      throw new Error('address must be a string');
    }
    const data = await this.context.transport.request<CoreWalletData>({
      method: 'GET',
      path: this.path('/wallet/address/' + encodeURIComponent(params.address)),
      tracer: params.reqId,
    });
    return this.wrap(data);
  }

  /** Register a wallet with keychains that already exist on BitGo (bring your own keys). */
  async add(params: CoreAddWalletOptions): Promise<CoreWallet<CoreWalletData, TCoin>> {
    const { reqId, ...body } = params;
    if (typeof body.label !== 'string') {
      throw new Error('label must be a string');
    }
    if (!Array.isArray(body.keys) || body.keys.some((k) => typeof k !== 'string')) {
      throw new Error('keys must be an array of keychain ids');
    }
    const data = await this.context.transport.request<CoreWalletData>({
      method: 'POST',
      path: this.path('/wallet/add'),
      body,
      tracer: reqId,
    });
    return this.wrap(data);
  }
}
