// Moved to @bitgo/sdk-keys (EddsaMPCv2Shares). Re-exported so existing imports keep working.
import { EddsaMPCv2Shares } from '@bitgo/sdk-keys';

export const {
  getSignatureShareRoundOne,
  verifyPeerMessageRoundOne,
  getSignatureShareRoundTwo,
  verifyPeerMessageRoundTwo,
  verifyPeerMessageRoundThree,
  getSignatureShareRoundThree,
} = EddsaMPCv2Shares;
