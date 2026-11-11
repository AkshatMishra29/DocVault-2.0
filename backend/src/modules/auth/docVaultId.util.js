import crypto from 'crypto';
import { User } from './auth.model.js';

/**
 * Generate a cryptographically random, non-sequential DocVault ID (e.g. DV-9A4B-7C2E)
 */
export function generateDocVaultId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 without confusing chars (0/O, 1/I)
  const getRandomChunk = (len) => {
    let res = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
      res += chars[bytes[i] % chars.length];
    }
    return res;
  };
  return `DV-${getRandomChunk(4)}-${getRandomChunk(4)}`;
}

/**
 * Auto-backfill existing users in the database missing a docVaultId
 */
export async function backfillDocVaultIds() {
  try {
    const usersWithoutId = await User.find({
      $or: [{ docVaultId: { $exists: false } }, { docVaultId: null }, { docVaultId: '' }],
    });

    if (usersWithoutId.length > 0) {
      console.log(`[DocVault ID] Backfilling ${usersWithoutId.length} users with unique DocVault IDs...`);
      for (const user of usersWithoutId) {
        let unique = false;
        let candidateId = '';
        while (!unique) {
          candidateId = generateDocVaultId();
          const existing = await User.findOne({ docVaultId: candidateId });
          if (!existing) unique = true;
        }
        user.docVaultId = candidateId;
        await user.save();
      }
      console.log(`[DocVault ID] Successfully backfilled all existing users.`);
    }
  } catch (err) {
    console.error('[DocVault ID] Backfill warning:', err.message);
  }
}

