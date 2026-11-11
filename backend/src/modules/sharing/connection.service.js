import {
  UserConnection,
  USER_CONNECTION_STATUS,
  ConnectionRequest,
  CONNECTION_REQUEST_STATUS,
  DocumentShareGrant,
  GRANT_STATUS,
  ShareNotification,
  NOTIFICATION_TYPE,
} from './models/index.js';
import { User } from '../auth/auth.model.js';

/**
 * Standardize pair order so userA < userB
 */
function getOrderedPair(id1, id2) {
  const str1 = id1.toString();
  const str2 = id2.toString();
  if (str1 < str2) {
    return { userA: id1, userB: id2, isUserA: true };
  }
  return { userA: id2, userB: id1, isUserA: false };
}

export class ConnectionService {
  /**
   * Send a connection request from requesterId to recipientId
   */
  static async sendRequest(requesterId, recipientDocVaultId) {
    if (!recipientDocVaultId) {
      throw new Error('DocVault ID is required');
    }

    const cleanId = recipientDocVaultId.trim().toUpperCase();
    const recipient = await User.findOne({ docVaultId: cleanId });

    if (!recipient) {
      const err = new Error('No user found with this DocVault ID.');
      err.status = 404;
      throw err;
    }

    if (recipient._id.toString() === requesterId.toString()) {
      const err = new Error('You cannot connect with yourself.');
      err.status = 400;
      throw err;
    }

    // Check block status
    const { userA, userB } = getOrderedPair(requesterId, recipient._id);
    const existingConn = await UserConnection.findOne({ userA, userB });
    if (existingConn && existingConn.status === USER_CONNECTION_STATUS.BLOCKED) {
      const err = new Error('Cannot send request to this user.');
      err.status = 403;
      throw err;
    }

    // Check if already mutual
    if (existingConn && existingConn.status === USER_CONNECTION_STATUS.MUTUAL) {
      const err = new Error('You are already mutual connections.');
      err.status = 400;
      throw err;
    }

    // Check if an existing pending request exists in this direction
    const existingReq = await ConnectionRequest.findOne({
      requesterId,
      recipientId: recipient._id,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    });

    if (existingReq) {
      const err = new Error('Connection request already pending.');
      err.status = 400;
      throw err;
    }

    // Create the request
    const request = await ConnectionRequest.create({
      requesterId,
      recipientId: recipient._id,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    });

    // Notify recipient
    const requester = await User.findById(requesterId).select('name docVaultId');
    await ShareNotification.create({
      userId: recipient._id,
      senderId: requesterId,
      type: NOTIFICATION_TYPE.CONNECTION_REQUEST,
      title: 'New Connection Request',
      message: `${requester?.name || 'Someone'} (${requester?.docVaultId || ''}) sent you a connection request.`,
      data: { requestId: request._id },
    }).catch((e) => console.warn('[Notification Error]:', e.message));

    return {
      success: true,
      requestId: request._id,
      recipient: {
        id: recipient._id,
        name: recipient.name,
        docVaultId: recipient.docVaultId,
      },
    };
  }

  /**
   * Accept an incoming connection request
   * In Instagram-style mutual model:
   * When B accepts A's request, B approves A.
   * If A already approved B (or vice versa), it becomes MUTUAL.
   * Otherwise it remains ONE_WAY until both sides have accepted.
   */
  static async acceptRequest(userId, requestId) {
    const request = await ConnectionRequest.findOne({
      _id: requestId,
      recipientId: userId,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    });

    if (!request) {
      const err = new Error('Connection request not found or already processed.');
      err.status = 404;
      throw err;
    }

    request.status = CONNECTION_REQUEST_STATUS.ACCEPTED;
    await request.save();

    const requesterId = request.requesterId;
    const { userA, userB, isUserA } = getOrderedPair(userId, requesterId);

    let conn = await UserConnection.findOne({ userA, userB });
    if (!conn) {
      conn = new UserConnection({ userA, userB });
    }

    if (conn.status === USER_CONNECTION_STATUS.BLOCKED) {
      const err = new Error('Connection is blocked.');
      err.status = 403;
      throw err;
    }

    // userId accepted requester's request
    if (isUserA) {
      conn.userAApprovedB = true;
    } else {
      conn.userBApprovedA = true;
    }

    // Check if both sides have approved each other
    if (conn.userAApprovedB && conn.userBApprovedA) {
      conn.status = USER_CONNECTION_STATUS.MUTUAL;
      conn.connectedAt = new Date();
    } else {
      conn.status = USER_CONNECTION_STATUS.ONE_WAY;
    }

    await conn.save();

    // Notify requester
    const acceptor = await User.findById(userId).select('name docVaultId');
    await ShareNotification.create({
      userId: requesterId,
      senderId: userId,
      type: NOTIFICATION_TYPE.CONNECTION_ACCEPTED,
      title: 'Connection Accepted',
      message: `${acceptor?.name || 'User'} accepted your connection request. Status: ${conn.status}.`,
      data: { connectionStatus: conn.status },
    }).catch((e) => console.warn('[Notification Error]:', e.message));

    return {
      success: true,
      status: conn.status,
      isMutual: conn.status === USER_CONNECTION_STATUS.MUTUAL,
    };
  }

  /**
   * Reject an incoming connection request
   */
  static async rejectRequest(userId, requestId) {
    const request = await ConnectionRequest.findOne({
      _id: requestId,
      recipientId: userId,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    });

    if (!request) {
      const err = new Error('Connection request not found.');
      err.status = 404;
      throw err;
    }

    request.status = CONNECTION_REQUEST_STATUS.REJECTED;
    await request.save();

    return { success: true, message: 'Request rejected.' };
  }

  /**
   * Cancel an outgoing pending request
   */
  static async cancelRequest(userId, requestId) {
    const request = await ConnectionRequest.findOne({
      _id: requestId,
      requesterId: userId,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    });

    if (!request) {
      const err = new Error('Pending request not found.');
      err.status = 404;
      throw err;
    }

    request.status = CONNECTION_REQUEST_STATUS.CANCELLED;
    await request.save();

    return { success: true, message: 'Request cancelled.' };
  }

  /**
   * Remove a connection (Revokes all active sharing grants between them!)
   */
  static async removeConnection(userId, targetUserId) {
    const { userA, userB } = getOrderedPair(userId, targetUserId);
    const conn = await UserConnection.findOne({ userA, userB });

    if (conn) {
      await UserConnection.deleteOne({ _id: conn._id });
    }

    // Immediately suspend/revoke all active document grants between these two users
    await DocumentShareGrant.updateMany(
      {
        $or: [
          { ownerId: userId, recipientId: targetUserId },
          { ownerId: targetUserId, recipientId: userId },
        ],
        status: GRANT_STATUS.ACTIVE,
      },
      { status: GRANT_STATUS.REVOKED }
    );

    return { success: true, message: 'Connection removed and sharing access revoked.' };
  }

  /**
   * Block a user
   */
  static async blockUser(userId, targetUserId) {
    if (userId.toString() === targetUserId.toString()) {
      throw new Error('Cannot block yourself.');
    }

    const { userA, userB } = getOrderedPair(userId, targetUserId);
    let conn = await UserConnection.findOne({ userA, userB });
    if (!conn) {
      conn = new UserConnection({ userA, userB });
    }

    conn.status = USER_CONNECTION_STATUS.BLOCKED;
    conn.blockedBy = userId;
    conn.userAApprovedB = false;
    conn.userBApprovedA = false;
    await conn.save();

    // Revoke all grants
    await DocumentShareGrant.updateMany(
      {
        $or: [
          { ownerId: userId, recipientId: targetUserId },
          { ownerId: targetUserId, recipientId: userId },
        ],
      },
      { status: GRANT_STATUS.REVOKED }
    );

    return { success: true, message: 'User blocked.' };
  }

  /**
   * Unblock a user
   */
  static async unblockUser(userId, targetUserId) {
    const { userA, userB } = getOrderedPair(userId, targetUserId);
    const conn = await UserConnection.findOne({ userA, userB, blockedBy: userId });
    if (!conn) {
      throw new Error('User is not blocked by you.');
    }

    await UserConnection.deleteOne({ _id: conn._id });
    return { success: true, message: 'User unblocked.' };
  }

  /**
   * Get all connections for a user with precise directional permission status
   * - MUTUAL: Both follow each other, mutual sharing & mutual AI context access enabled!
   * - I_SHARE_TO_THEM: Current user accepted their request, so other user can see documents I share.
   * - THEY_SHARE_TO_ME: Other user accepted current user's request, so current user can see documents they share.
   */
  static async getUserConnections(userId) {
    const conns = await UserConnection.find({
      $or: [{ userA: userId }, { userB: userId }],
      status: { $ne: USER_CONNECTION_STATUS.BLOCKED },
    });

    const otherUserIds = conns.map((c) =>
      c.userA.toString() === userId.toString() ? c.userB : c.userA
    );

    const users = await User.find({ _id: { $in: otherUserIds } }).select(
      'name docVaultId email createdAt'
    );
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return conns
      .map((c) => {
        const isUserA = c.userA.toString() === userId.toString();
        const otherId = isUserA ? c.userB.toString() : c.userA.toString();
        const otherUser = userMap.get(otherId);
        if (!otherUser) return null;

        const iApprovedThem = isUserA ? c.userAApprovedB : c.userBApprovedA;
        const theyApprovedMe = isUserA ? c.userBApprovedA : c.userAApprovedB;

        let connectionType = 'ONE_WAY';
        let statusLabel = '';

        if (c.status === USER_CONNECTION_STATUS.MUTUAL || (iApprovedThem && theyApprovedMe)) {
          connectionType = 'MUTUAL';
          statusLabel = 'Mutual (Full Two-Way Sharing & Shared AI Active)';
        } else if (iApprovedThem && !theyApprovedMe) {
          connectionType = 'I_SHARE_TO_THEM';
          statusLabel = 'You allowed them access (They have not allowed you yet)';
        } else if (!iApprovedThem && theyApprovedMe) {
          connectionType = 'THEY_SHARE_TO_ME';
          statusLabel = 'They allowed you access (You have not allowed them yet)';
        }

        return {
          id: otherUser._id,
          name: otherUser.name,
          docVaultId: otherUser.docVaultId,
          connectionType,
          statusLabel,
          iApprovedThem,
          theyApprovedMe,
          isMutual: connectionType === 'MUTUAL',
        };
      })
      .filter(Boolean);
  }

  /**
   * Get all users that the current user is eligible to share documents with
   * (Users where the connection is MUTUAL OR the current user approved them)
   */
  static async getEligibleShareRecipients(userId) {
    const all = await this.getUserConnections(userId);
    return all.filter((c) => c.iApprovedThem || c.isMutual);
  }

  /**
   * Legacy method for backward compatibility
   */
  static async getMutualConnections(userId) {
    const all = await this.getUserConnections(userId);
    return all.filter((c) => c.isMutual);
  }

  /**
   * Check if userA is authorized to receive documents from ownerId
   * Authorized if:
   * 1. Mutual connection
   * 2. OR owner explicitly approved userA (one-way grant allowed by owner)
   */
  static async canReceiveFromOwner(recipientId, ownerId) {
    if (!recipientId || !ownerId) return false;
    if (recipientId.toString() === ownerId.toString()) return true;

    const { userA, userB, isUserA } = getOrderedPair(recipientId, ownerId);
    const conn = await UserConnection.findOne({
      userA,
      userB,
      status: { $ne: USER_CONNECTION_STATUS.BLOCKED },
    });

    if (!conn) return false;
    if (conn.status === USER_CONNECTION_STATUS.MUTUAL) return true;

    // If owner approved recipient, owner can share to recipient
    // isUserA is true if recipient === userA, so owner is userB
    const ownerApprovedRecipient = isUserA ? conn.userBApprovedA : conn.userAApprovedB;
    return Boolean(ownerApprovedRecipient);
  }

  /**
   * Check if two users are MUTUAL connections
   */
  static async areMutual(user1Id, user2Id) {
    if (!user1Id || !user2Id) return false;
    if (user1Id.toString() === user2Id.toString()) return true; // Self is always authorized

    const { userA, userB } = getOrderedPair(user1Id, user2Id);
    const conn = await UserConnection.findOne({
      userA,
      userB,
    });

    if (!conn) return false;
    return conn.status === USER_CONNECTION_STATUS.MUTUAL || (conn.userAApprovedB && conn.userBApprovedA);
  }

  /**
   * Get incoming and outgoing connection requests
   */
  static async getRequests(userId) {
    const incoming = await ConnectionRequest.find({
      recipientId: userId,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    })
      .populate('requesterId', 'name docVaultId')
      .sort({ createdAt: -1 });

    const outgoing = await ConnectionRequest.find({
      requesterId: userId,
      status: CONNECTION_REQUEST_STATUS.PENDING,
    })
      .populate('recipientId', 'name docVaultId')
      .sort({ createdAt: -1 });

    return { incoming, outgoing };
  }
}

