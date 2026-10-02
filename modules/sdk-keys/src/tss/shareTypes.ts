/**
 * Share records exchanged with BitGo during TSS signing. Plain data, shared by the signing helpers
 * here and the network layer in `@bitgo/sdk-core`.
 */
export const SignatureShareType = {
  USER: 'user',
  BACKUP: 'backup',
  BITGO: 'bitgo',
} as const;

export type SignatureShareType = (typeof SignatureShareType)[keyof typeof SignatureShareType];

export interface ShareBaseRecord {
  from: SignatureShareType;
  to: SignatureShareType;
  share: string;
}

export interface SignatureShareRecord extends ShareBaseRecord {
  vssProof?: string;
  privateShareProof?: string;
  publicShare?: string;
}

export const CommitmentType = {
  COMMITMENT: 'commitment',
  DECOMMITMENT: 'decommitment',
} as const;

export type CommitmentType = (typeof CommitmentType)[keyof typeof CommitmentType];

export interface CommitmentShareRecord extends ShareBaseRecord {
  type: CommitmentType;
}

export interface ExchangeCommitmentResponse {
  commitmentShare: CommitmentShareRecord;
}

export const EncryptedSignerShareType = {
  ENCRYPTED_SIGNER_SHARE: 'encryptedSignerShare',
  ENCRYPTED_R_SHARE: 'encryptedRShare',
} as const;

export type EncryptedSignerShareType = (typeof EncryptedSignerShareType)[keyof typeof EncryptedSignerShareType];

export interface EncryptedSignerShareRecord extends ShareBaseRecord {
  type: EncryptedSignerShareType;
}

/** Party indices used by the MPCv2 (DKLS, MPS) protocols. */
export enum MPCv2PartiesEnum {
  USER = 0,
  BACKUP = 1,
  BITGO = 2,
}
