/**
 * @prettier
 */
//
// lean.ts - `bitgo/lean` entry point: the BitGo client with no coins registered.
//
// Copyright 2026, BitGo, Inc.  All Rights Reserved.
//
// This module must not import ./v2 or ./index, which load every coin package.
//
import pjson = require('../package.json');
import { BaseCoin, BitGoBase, CoinConstructor, CoinFactory } from '@bitgo/sdk-core';
import { BitGoAPI, BitGoAPIOptions } from '@bitgo/sdk-api';

export * from '@bitgo/sdk-api';
export * from '@bitgo/sdk-core';
// Both packages export getNetwork(network?: V1Network); pick one to resolve the star-export ambiguity.
export { getNetwork } from '@bitgo/sdk-api';

/**
 * A coin package's registration function, e.g. `register` from `@bitgo/sdk-coin-sol`.
 */
export type CoinRegistrar = (sdk: BitGoBase) => void;

export type BitGoOptions = BitGoAPIOptions;

/**
 * BitGo client that starts with no coins. Register the coins you use:
 *
 * ```ts
 * import { BitGo } from 'bitgo/lean';
 * import { register as registerSol } from '@bitgo/sdk-coin-sol';
 *
 * const bitgo = new BitGo({ env: 'test' }).use(registerSol);
 * const sol = bitgo.coin('tsol');
 * ```
 *
 * Coins are registered on this instance only, so two instances can carry different coin sets.
 */
export class BitGo extends BitGoAPI {
  private readonly _coinFactory: CoinFactory;

  constructor(params: BitGoOptions = {}) {
    super(params);
    this._version = pjson.version;
    this._userAgent = params.userAgent || 'BitGoJS/' + this.version();
    this._coinFactory = new CoinFactory();
  }

  /**
   * Register a coin constructor on this instance.
   * @param name coin name as registered in @bitgo/statics
   * @param coin the coin constructor
   */
  register(name: string, coin: CoinConstructor): void {
    this._coinFactory.register(name, coin);
  }

  /**
   * Run coin package registration functions against this instance.
   * @returns this instance, for chaining
   */
  use(...registrars: CoinRegistrar[]): this {
    for (const registrar of registrars) {
      registrar(this);
    }
    return this;
  }

  /**
   * Create a basecoin object for a registered coin.
   * @throws UnsupportedCoinError if the coin was not registered on this instance
   */
  coin(coinName: string): BaseCoin {
    return this._coinFactory.getInstance(this, coinName);
  }
}
