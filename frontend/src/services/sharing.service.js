import { API_BASE_URL } from '../config';

function getAuthHeader() {
  const token = localStorage.getItem('token') || localStorage.getItem('docvault_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const sharingService = {
  // Connection lookups & requests
  async lookupUser(docVaultId) {
    const cleanId = encodeURIComponent(docVaultId.trim());
    const res = await fetch(`${API_BASE_URL}/api/connections/lookup/${cleanId}`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async getConnections() {
    const res = await fetch(`${API_BASE_URL}/api/connections`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async getRequests() {
    const res = await fetch(`${API_BASE_URL}/api/connections/requests`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async sendRequest(docVaultId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/request`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ docVaultId }),
    });
    return res.json();
  },

  async acceptRequest(requestId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/requests/${requestId}/accept`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async rejectRequest(requestId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async cancelRequest(requestId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/requests/${requestId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async removeConnection(targetUserId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/${targetUserId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async blockUser(targetUserId) {
    const res = await fetch(`${API_BASE_URL}/api/connections/${targetUserId}/block`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  // Document Sharing policies & grants
  async getDocumentSharing(documentId) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/${documentId}`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async setDocumentPolicy(data) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/policy`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async bulkShare(data) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/bulk`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async createCategoryRule(data) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/category-rule`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getReceivedDocuments() {
    const res = await fetch(`${API_BASE_URL}/api/sharing/received`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async getSentGrants() {
    const res = await fetch(`${API_BASE_URL}/api/sharing/sent`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async revokeGrant(grantId) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/grants/${grantId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  // Document Access Requests
  async requestAccess(documentId, message) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/request-access`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ documentId, message }),
    });
    return res.json();
  },

  async getAccessRequests() {
    const res = await fetch(`${API_BASE_URL}/api/sharing/access-requests`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async approveAccessRequest(requestId, data) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/access-requests/${requestId}/approve`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async rejectAccessRequest(requestId) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/access-requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async getSharingAudit(documentId) {
    const res = await fetch(`${API_BASE_URL}/api/sharing/audit/${documentId}`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },
};

