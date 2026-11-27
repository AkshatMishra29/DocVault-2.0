/**
 * DocVault Zero-Knowledge Client-Side E2EE Service
 * =================================================
 * Encrypts sensitive documents & metadata in-browser using Web Crypto (AES-GCM-256)
 * BEFORE any bytes are sent to the server or cloud storage.
 *
 * Key Hierarchy:
 *   User Vault PIN + Per-User Salt ──(PBKDF2-SHA256, 250k iters)──► Master Key (KEK)
 *   Random 256-bit AES-GCM Key ─────────────────────────────────────► Document Key (DEK)
 *     ├─ Encrypts File Bytes  ──► ciphertext + fileIv
 *     ├─ Encrypts Metadata    ──► encryptedMetadata + metaIv
 *     └─ Wrapped by MasterKey ──► wrappedDek + dekIv
 *
 * The server and cloud bucket ONLY ever see ciphertext + wrappedDek.
 */

const KDF_ITERATIONS = 250000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSubtle() {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
  }
  return cryptoObj;
}

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a random cryptographic salt (16 bytes, base64-encoded).
 */
export function generateSalt() {
  const cryptoObj = getSubtle();
  return bytesToBase64(cryptoObj.getRandomValues(new Uint8Array(16)));
}

/**
 * Derive a 256-bit Master Key (KEK) from the user's Vault PIN/passphrase and salt.
 * Never leaves client memory.
 */
export async function deriveMasterKey(pinOrPassphrase, saltBase64) {
  if (!pinOrPassphrase || String(pinOrPassphrase).length < 4) {
    throw new Error('Vault PIN or passphrase (min 4 chars) is required for E2EE.');
  }
  const { subtle } = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    textEncoder.encode(String(pinOrPassphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64),
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Encrypt raw file bytes and sensitive metadata in-memory using a fresh per-document DEK.
 *
 * @param {ArrayBuffer|Uint8Array} fileBytes
 * @param {Object} metadata - e.g. { title, originalName, mimetype, notes }
 * @param {CryptoKey} masterKey - Derived from Vault PIN via deriveMasterKey()
 * @param {string} saltBase64 - Salt used to derive masterKey
 */
export async function encryptDocumentForVault(fileBytes, metadata, masterKey, saltBase64) {
  const cryptoObj = getSubtle();
  const { subtle } = cryptoObj;
  const plainBytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);

  // 1. Generate a fresh 256-bit Data Encryption Key (DEK) for this document
  const dek = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. Encrypt file bytes
  const fileIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const encryptedFileBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: fileIv },
    dek,
    plainBytes
  );

  // 3. Encrypt sensitive metadata (title, originalName, notes)
  const metaIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const metaJson = textEncoder.encode(JSON.stringify(metadata || {}));
  const encryptedMetaBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: metaIv },
    dek,
    metaJson
  );

  // 4. Wrap (encrypt) the DEK with the user's Master Key
  const dekIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const wrappedDekBuf = await subtle.wrapKey(
    'raw',
    dek,
    masterKey,
    { name: 'AES-GCM', iv: dekIv }
  );

  // 5. Hash ONLY the ciphertext for integrity/dedup (never hash plaintext on server)
  const cipherHashBuf = await subtle.digest('SHA-256', encryptedFileBuf);
  const ciphertextSha256 = Array.from(new Uint8Array(cipherHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    ciphertext: new Uint8Array(encryptedFileBuf),
    ciphertextSha256,
    e2eeEnvelope: {
      enabled: true,
      alg: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256-250K',
      salt: saltBase64,
      wrappedDek: bytesToBase64(wrappedDekBuf),
      dekIv: bytesToBase64(dekIv),
      fileIv: bytesToBase64(fileIv),
      encryptedMetadata: bytesToBase64(encryptedMetaBuf),
      metaIv: bytesToBase64(metaIv),
    },
  };
}

/**
 * Decrypt an E2EE document and its metadata in browser memory.
 * Throws DOMException (OperationError) if the PIN/masterKey is wrong or ciphertext was tampered with.
 */
export async function decryptDocumentFromVault(ciphertextBytes, e2eeEnvelope, masterKey) {
  const { subtle } = getSubtle();
  const cipherU8 = ciphertextBytes instanceof Uint8Array ? ciphertextBytes : new Uint8Array(ciphertextBytes);

  // 1. Unwrap DEK using Master Key
  const dek = await subtle.unwrapKey(
    'raw',
    base64ToBytes(e2eeEnvelope.wrappedDek),
    masterKey,
    { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.dekIv) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // 2. Decrypt file bytes
  const plainFileBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.fileIv) },
    dek,
    cipherU8
  );

  // 3. Decrypt metadata
  let metadata = {};
  if (e2eeEnvelope.encryptedMetadata && e2eeEnvelope.metaIv) {
    const plainMetaBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.metaIv) },
      dek,
      base64ToBytes(e2eeEnvelope.encryptedMetadata)
    );
    metadata = JSON.parse(textDecoder.decode(plainMetaBuf));
  }

  return {
    fileBytes: new Uint8Array(plainFileBuf),
    metadata,
  };
}

/* ==========================================================================
   IN-MEMORY MASTER KEY VAULT (Never persisted to localStorage/sessionStorage)
   ========================================================================== */
let _inMemoryMasterKey = null;
let _keyExpiryTimer = null;
const KEY_IDLE_TTL_MS = 15 * 60 * 1000; // 15 min auto-wipe

export function setInMemoryMasterKey(masterKey) {
  _inMemoryMasterKey = masterKey || null;
  if (_keyExpiryTimer) clearTimeout(_keyExpiryTimer);
  if (_inMemoryMasterKey) {
    _keyExpiryTimer = setTimeout(() => {
      _inMemoryMasterKey = null;
    }, KEY_IDLE_TTL_MS);
  }
}

export function getInMemoryMasterKey() {
  return _inMemoryMasterKey;
}

export function clearInMemoryMasterKey() {
  _inMemoryMasterKey = null;
  if (_keyExpiryTimer) {
    clearTimeout(_keyExpiryTimer);
    _keyExpiryTimer = null;
  }
}

/* ==========================================================================
   ZERO-KNOWLEDGE #FRAGMENT LINK SHARING
   Unwraps DEK locally so share links can pass `#key=...` (never sent to server)
   ========================================================================== */
export async function exportRawDekForFragment(e2eeEnvelope, masterKey) {
  const { subtle } = getSubtle();
  const dek = await subtle.unwrapKey(
    'raw',
    base64ToBytes(e2eeEnvelope.wrappedDek),
    masterKey,
    { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.dekIv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );
  const rawDek = await subtle.exportKey('raw', dek);
  return bytesToBase64(rawDek);
}

export async function decryptWithFragmentKey(ciphertextBytes, e2eeEnvelope, fragmentKeyBase64) {
  const { subtle } = getSubtle();
  const cipherU8 = ciphertextBytes instanceof Uint8Array ? ciphertextBytes : new Uint8Array(ciphertextBytes);
  const dek = await subtle.importKey(
    'raw',
    base64ToBytes(fragmentKeyBase64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plainFileBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.fileIv) },
    dek,
    cipherU8
  );

  let metadata = {};
  if (e2eeEnvelope.encryptedMetadata && e2eeEnvelope.metaIv) {
    const plainMetaBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(e2eeEnvelope.metaIv) },
      dek,
      base64ToBytes(e2eeEnvelope.encryptedMetadata)
    );
    metadata = JSON.parse(textDecoder.decode(plainMetaBuf));
  }

  return { fileBytes: new Uint8Array(plainFileBuf), metadata };
}
