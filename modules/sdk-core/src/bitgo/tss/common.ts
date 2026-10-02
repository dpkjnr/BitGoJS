import assert from 'assert';
import openpgp from 'openpgp';

import { MPCv2SigningState } from '@bitgo/public-types';
import { asTransport, TransportSource } from '../transport';
import { TxRequestChallengeResponse } from './types';
import { MPCAlgorithm } from '../baseCoin';
import {
  RequestType,
  TxRequest,
  verifyPrimaryUserWrapper,
  SignatureShareRecord,
  SignatureShareType,
  CommitmentShareRecord,
  EncryptedSignerShareRecord,
  ExchangeCommitmentResponse,
  RequestTracer,
} from '../utils';
import { IRequestTracer } from '../../api';

const debug = require('debug')('bitgo:tss:common');

export function getBitgoSignatureShare(
  signatureShares: SignatureShareRecord[],
  signerShareType: SignatureShareType,
  shareType: MPCv2SigningState
): SignatureShareRecord {
  const bitgoShare = signatureShares.find((share) => {
    if (share.from !== SignatureShareType.BITGO || share.to !== signerShareType) {
      return false;
    }

    try {
      return JSON.parse(share.share).type === shareType;
    } catch {
      return false;
    }
  });
  assert(bitgoShare, `Missing BitGo ${shareType} signature share`);
  return bitgoShare;
}

/**
 * Gets the latest Tx Request by id
 *
 * @param {TransportSource} bitgo - the bitgo instance, or a WalletTransport
 * @param {String} walletId - the wallet id
 * @param {String} txRequestId - the txRequest id
 * @param {IRequestTracer} reqId - the request tracer request id
 * @returns {Promise<TxRequest>}
 */
export async function getTxRequest(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  reqId?: IRequestTracer
): Promise<TxRequest> {
  const txRequestRes = await asTransport(bitgo).request({
    method: 'GET',
    path: '/wallet/' + walletId + '/txrequests',
    query: { txRequestIds: txRequestId, latest: 'true' },
    retries: 3,
    tracer: reqId || new RequestTracer(),
  });

  if (txRequestRes.txRequests.length <= 0) {
    throw new Error(`Unable to find TxRequest with id ${txRequestId}`);
  }

  return txRequestRes.txRequests[0];
}

/**
 * Sends a Signature Share
 *
 * @param {TransportSource} bitgo - the bitgo instance, or a WalletTransport
 * @param {String} walletId - the wallet id  *
 * @param {String} txRequestId - the txRequest Id
 * @param {SignatureShareRecord} signatureShare - a Signature Share
 * @param requestType - The type of request being submitted (either tx or message for signing)
 * @param signerShare
 * @param mpcAlgorithm
 * @param apiMode
 * @param {IRequestTracer} reqId - the request tracer request id
 * @returns {Promise<SignatureShareRecord>} - a Signature Share
 */
export async function sendSignatureShare(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  signatureShare: SignatureShareRecord,
  requestType: RequestType,
  signerShare?: string,
  mpcAlgorithm: 'eddsa' | 'ecdsa' = 'eddsa',
  apiMode: 'full' | 'lite' = 'lite',
  userPublicGpgKey?: string,
  reqId?: IRequestTracer
): Promise<SignatureShareRecord> {
  let addendum = '';
  switch (requestType) {
    case RequestType.tx:
      if (mpcAlgorithm === 'ecdsa' || apiMode === 'full') {
        addendum = '/transactions/0';
      }
      break;
    case RequestType.message:
      if (mpcAlgorithm === 'ecdsa' || apiMode === 'full') {
        addendum = '/messages/0';
      }
      break;
  }
  const urlPath = '/wallet/' + walletId + '/txrequests/' + txRequestId + addendum + '/signatureshares';
  // TODO(WCN-541): add optional attestation pass-through for MPC /signatureshares, first round
  // only (deferred until multisig attestation, WCN-539, is verified end-to-end on staging).
  return asTransport(bitgo).request({
    method: 'POST',
    path: urlPath,
    body: {
      signatureShare,
      signerShare,
      userPublicGpgKey,
    },
    tracer: reqId || new RequestTracer(),
  });
}

/**
 * Sends a Signature Share using the sign txRequest route
 *
 * @param {TransportSource} bitgo - the bitgo instance, or a WalletTransport
 * @param {String} walletId - the wallet id  *
 * @param {String} txRequestId - the txRequest Id
 * @param signatureShares
 * @param requestType - The type of request being submitted (either tx or message for signing)
 * @param signerShare
 * @param mpcAlgorithm
 * @param multisigTypeVersion
 * @param signerGpgPublicKey
 * @param reqId
 * @returns {Promise<SignatureShareRecord>} - a Signature Share
 */
export async function sendSignatureShareV2(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  signatureShares: SignatureShareRecord[],
  requestType: RequestType,
  mpcAlgorithm: MPCAlgorithm,
  signerGpgPublicKey: string,
  signerShare?: string,
  multisigTypeVersion?: 'MPCv2' | undefined,
  reqId?: IRequestTracer
): Promise<TxRequest> {
  const addendum = requestType === RequestType.tx ? '/transactions/0' : '/messages/0';
  const urlPath = '/wallet/' + walletId + '/txrequests/' + txRequestId + addendum + '/sign';
  let type = '';
  if (multisigTypeVersion === 'MPCv2' && mpcAlgorithm === 'ecdsa') {
    type = 'ecdsaMpcV2';
  } else if (multisigTypeVersion === 'MPCv2' && mpcAlgorithm === 'eddsa') {
    type = 'eddsaMpcV2';
  } else if (multisigTypeVersion === 'MPCv2' && mpcAlgorithm === 'redpallas') {
    type = 'redpallasMpcV2';
  } else if (multisigTypeVersion === undefined && mpcAlgorithm === 'eddsa') {
    type = 'eddsaMpcV1';
  }
  const requestBody = {
    type,
    signatureShares,
    signerShare,
    signerGpgPublicKey,
  };
  const transport = asTransport(bitgo);
  const request = { method: 'POST', path: urlPath, body: requestBody, tracer: reqId || new RequestTracer() } as const;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      return await transport.request<TxRequest>(request);
    } catch (err) {
      if (err?.status === 429) {
        const sleepTime = 1000 * (attempts + 1);
        debug(`MPC Signing rate limit error - retrying in ${sleepTime / 1000} seconds`);
        // sleep for a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        attempts++;
      } else {
        throw err;
      }
    }
  }
  return await transport.request<TxRequest>(request);
}

/**
 * Sends a Transaction Request for broadcast once signing is complete
 *
 * @param {TransportSource} bitgo - the bitgo instance, or a WalletTransport
 * @param {String} walletId - the wallet id  *
 * @param {String} txRequestId - the txRequest Id
 * @param requestType - The type of request being submitted (either tx or message for signing)
 * @param {IRequestTracer} reqId - request tracer request id
 * @returns {Promise<SignatureShareRecord>} - a Signature Share
 */
export async function sendTxRequest(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  requestType: RequestType,
  reqId?: IRequestTracer
): Promise<TxRequest> {
  const addendum = requestType === RequestType.tx ? '/transactions/0' : '/messages/0';
  const urlPath = '/wallet/' + walletId + '/txrequests/' + txRequestId + addendum + '/send';
  return asTransport(bitgo).request({ method: 'POST', path: urlPath, tracer: reqId || new RequestTracer() });
}

/**
 * Sends the client commitment and encrypted signer share to the server, getting back the server commitment
 * @param {TransportSource} bitgo - the bitgo instance, or a WalletTransport
 * @param {string} walletId - the wallet id
 * @param {string} txRequestId - the txRequest Id
 * @param {CommitmentShareRecord} commitmentShare - the client commitment share
 * @param {EncryptedSignerShareRecord} encryptedSignerShare - the client encrypted signer share
 * @param {string} [apiMode] - the txRequest api mode (full or lite) - defaults to lite
 * @param {IRequestTracer} reqId - the request tracer request Id
 * @returns {Promise<ExchangeCommitmentResponse>} - the server commitment share
 */
export async function exchangeEddsaCommitments(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  commitmentShare: CommitmentShareRecord,
  encryptedSignerShare: EncryptedSignerShareRecord,
  apiMode: 'full' | 'lite' = 'lite',
  reqId?: IRequestTracer
): Promise<ExchangeCommitmentResponse> {
  let addendum = '';
  if (apiMode === 'full') {
    addendum = '/transactions/0';
  }
  const urlPath = '/wallet/' + walletId + '/txrequests/' + txRequestId + addendum + '/commit';
  return await asTransport(bitgo).request({
    method: 'POST',
    path: urlPath,
    body: { commitmentShare, encryptedSignerShare },
    tracer: reqId || new RequestTracer(),
  });
}

/**
 * Verifies that a TSS wallet signature was produced with the expected key and that the signed data contains the
 * expected common keychain as well as the expected user and backup key ids
 */
export async function commonVerifyWalletSignature(params: {
  walletSignature: openpgp.Key;
  bitgoPub: openpgp.Key;
  commonKeychain: string;
  userKeyId: string;
  backupKeyId: string;
}): Promise<{ value: ArrayBuffer }[]> {
  const { walletSignature, bitgoPub, commonKeychain, userKeyId, backupKeyId } = params;

  // By ensuring that the fingerprints of the walletSignature and the bitgoPub are different and that any of the results
  // from calling verifyPrimaryUser is valid we know that the signature was actually produced by the private key
  // belonging to the bitgoPub.
  if (walletSignature.keyPacket.getFingerprint() === bitgoPub.keyPacket.getFingerprint()) {
    throw new Error('Invalid HSM GPG signature');
  }

  const verificationResult = await verifyPrimaryUserWrapper(walletSignature, bitgoPub, false);
  const isValid = verificationResult.some((result) => result.valid);
  if (!isValid) {
    throw new Error('Invalid HSM GPG signature');
  }
  const primaryUser = await walletSignature.getPrimaryUser();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore the rawNotations property is missing from the type but it actually exists
  const rawNotations: { value: Uint8Array }[] = primaryUser.user.otherCertifications[0].rawNotations;

  assert(rawNotations.length === 5, 'invalid wallet signatures');

  assert(
    commonKeychain === Buffer.from(rawNotations[0].value).toString(),
    'wallet signature does not match common keychain'
  );
  assert(userKeyId === Buffer.from(rawNotations[1].value).toString(), `wallet signature does not match user key id`);
  assert(
    backupKeyId === Buffer.from(rawNotations[2].value).toString(),
    'wallet signature does not match backup key id'
  );

  return rawNotations;
}

/**
 * Gets challenge for a tx request from BitGo
 * supports Message and regular Transaction
 * @param bitgo
 * @param walletId
 * @param txRequestId
 * @param index
 * @param requestType
 * @param paillierModulus
 * @param reqId
 */
export async function getTxRequestChallenge(
  bitgo: TransportSource,
  walletId: string,
  txRequestId: string,
  index: string,
  requestType: RequestType,
  paillierModulus: string,
  reqId?: IRequestTracer
): Promise<TxRequestChallengeResponse> {
  let addendum = '';
  switch (requestType) {
    case RequestType.tx:
      addendum = '/transactions/' + index;
      break;
    case RequestType.message:
      addendum = '/messages/' + index;
      break;
  }
  const urlPath = '/wallet/' + walletId + '/txrequests/' + txRequestId + addendum + '/challenge';
  return await asTransport(bitgo).request({
    method: 'POST',
    path: urlPath,
    body: { paillierModulus },
    tracer: reqId || new RequestTracer(),
  });
}
