// Moved to @bitgo/sdk-keys (RedpallasMPCv2Shares). Re-exported so existing imports keep working.
import { RedpallasMPCv2Shares } from '@bitgo/sdk-keys';

export const {
  getSignatureShareRoundOne,
  verifyPeerMessageRoundOne,
  getSignatureShareRoundTwo,
  verifyPeerMessageRoundTwo,
  verifyPeerMessageRoundThree,
  getSignatureShareRoundThree,
} = RedpallasMPCv2Shares;
