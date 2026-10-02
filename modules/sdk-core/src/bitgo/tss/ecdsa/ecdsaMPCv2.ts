// Moved to @bitgo/sdk-keys (EcdsaMPCv2Shares). Re-exported so existing imports keep working.
import { EcdsaMPCv2Shares } from '@bitgo/sdk-keys';

export const {
  getSignatureShareRoundOne,
  getSignatureShareRoundTwo,
  getSignatureShareRoundThree,
  verifyBitGoMessagesAndSignaturesRoundOne,
  verifyBitGoMessagesAndSignaturesRoundTwo,
  getBitGoPartyGpgKey,
  getUserPartyGpgKey,
} = EcdsaMPCv2Shares;
