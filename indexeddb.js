/* ========== INDEXEDDB SECURE KEY STORAGE MODULE ==========
 * Stores encrypted private keys and group keys in IndexedDB
 * Private keys are NEVER stored in localStorage
 * Only encrypted data is stored at rest
 * Keys are loaded only when needed for operations
 * ================================================== */

const IndexedDBModule = (() => {
  // Database configuration
  const DB_NAME = 'SikkerChat';
  const DB_VERSION = 1;
  
  // Object store names for organizing data
  const STORES = {
    PRIVATE_KEYS: 'private_keys', // Encrypted RSA private keys
    GROUP_KEYS: 'group_keys', // Encrypted AES group keys
    ENCRYPTED_GROUP_KEYS: 'encrypted_group_keys', // Group keys encrypted for specific users
    CRYPTO_METADATA: 'crypto_metadata' // Key generation dates, key IDs, etc
  };

  // Cached database connection
  let cachedDB = null;

  // Normalize username for storage and lookup.
  // This ensures the local key store is case-insensitive and matches usernames
  // even if the server returns a different case than the browser used during registration.
  function normalizeUsername(username) {
    if (!username || typeof username !== 'string') {
      return username;
    }
    return username.trim().toLowerCase();
  }

  // ========== DATABASE INITIALIZATION ==========

  /**
   * Initialize IndexedDB database with required object stores
   * Called once on app startup
   * @returns {Promise<IDBDatabase>} Opened database connection
   */
  async function initializeDatabase() {
    // Check if database is already cached
    if (cachedDB) {
      // Return cached connection
      return cachedDB;
    }

    // Return promise that resolves when database is ready
    return new Promise((resolve, reject) => {
      // Request to open or create database
      // If version is higher, onupgradeneeded is triggered
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Handle upgrade needed - create object stores
      request.onupgradeneeded = (event) => {
        // Get database reference from upgrade event
        const db = event.target.result;

        // Create object store for encrypted private keys
        // keyPath: 'username' - each user has one private key
        if (!db.objectStoreNames.contains(STORES.PRIVATE_KEYS)) {
          db.createObjectStore(STORES.PRIVATE_KEYS, { keyPath: 'username' });
        }

        // Create object store for decrypted group keys (cached in RAM)
        // keyPath: 'group_id' - maps group to its AES key
        if (!db.objectStoreNames.contains(STORES.GROUP_KEYS)) {
          db.createObjectStore(STORES.GROUP_KEYS, { keyPath: 'group_id' });
        }

        // Create object store for encrypted group keys
        // Stores: { group_id, username, encrypted_group_key }
        // User has one encrypted copy of group key per group
        if (!db.objectStoreNames.contains(STORES.ENCRYPTED_GROUP_KEYS)) {
          const store = db.createObjectStore(STORES.ENCRYPTED_GROUP_KEYS, { keyPath: 'id', autoIncrement: true });
          // Create index to query by group_id and username together
          store.createIndex('group_user', ['group_id', 'username'], { unique: true });
        }

        // Create object store for cryptographic metadata
        // Tracks: key generation timestamps, key versions, rotation dates
        if (!db.objectStoreNames.contains(STORES.CRYPTO_METADATA)) {
          db.createObjectStore(STORES.CRYPTO_METADATA, { keyPath: 'key' });
        }
      };

      // Handle successful database open
      request.onsuccess = (event) => {
        // Get database connection from success event
        const db = event.target.result;
        // Cache the connection for reuse
        cachedDB = db;
        // Resolve promise with database
        resolve(db);
      };

      // Handle database open errors
      request.onerror = (event) => {
        // Reject promise with error details
        reject(new Error('Failed to open IndexedDB: ' + event.target.error));
      };
    });
  }

  // ========== PASSWORD ENCRYPTION HELPERS ==========

  /**
   * Derive encryption key from password using PBKDF2
   * Used to encrypt private keys at rest in IndexedDB
   * @param {string} password - User password
   * @param {string} salt - Random salt for key derivation
   * @returns {Promise<CryptoKey>} Derived encryption key
   */
  async function deriveKeyFromPassword(password, salt) {
    try {
      // Import password as base key material
      const baseKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive key from password using PBKDF2
      // 100,000 iterations provides reasonable security
      const derivedKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      return derivedKey;
    } catch (error) {
      console.error('Error deriving key from password:', error);
      throw error;
    }
  }

  /**
   * Encrypt private key with password-derived key
   * Uses AES-GCM for authenticated encryption
   * @param {string} privateKeyBase64 - Private key to encrypt
   * @param {string} password - User password
   * @param {string} username - Username (used as salt)
   * @returns {Promise<object>} { encryptedData: base64, salt: string, iv: base64 }
   */
  async function encryptPrivateKeyWithPassword(privateKeyBase64, password, username) {
    try {
      // Use username as part of salt for reproducible key derivation
      const salt = username;

      // Derive key from password
      const derivedKey = await deriveKeyFromPassword(password, salt);

      // Generate random IV (12 bytes for GCM)
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Convert private key Base64 to bytes
      const keyData = new TextEncoder().encode(privateKeyBase64);

      // Encrypt with AES-GCM
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        derivedKey,
        keyData
      );

      // Convert encrypted data and IV to Base64
      const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      return {
        encryptedData: encryptedBase64,
        salt: salt,
        iv: ivBase64
      };
    } catch (error) {
      console.error('Error encrypting private key:', error);
      throw error;
    }
  }

  /**
   * Decrypt private key with password-derived key
   * Uses AES-GCM for authenticated decryption
   * @param {object} encryptedData - { encryptedData, salt, iv }
   * @param {string} password - User password
   * @returns {Promise<string>} Decrypted private key (Base64)
   */
  async function decryptPrivateKeyWithPassword(encryptedData, password) {
    try {
      // Use stored salt for key derivation
      const { encryptedData: encryptedBase64, salt, iv: ivBase64 } = encryptedData;

      // Derive key from password using stored salt
      const derivedKey = await deriveKeyFromPassword(password, salt);

      // Convert Base64 back to bytes
      const encryptedBytes = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
      const ivBytes = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));

      // Decrypt with AES-GCM
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        derivedKey,
        encryptedBytes
      );

      // Convert decrypted bytes to UTF-8 string
      const decryptedBase64 = new TextDecoder().decode(decryptedBuffer);

      return decryptedBase64;
    } catch (error) {
      console.error('Error decrypting private key:', error);
      throw error;
    }
  }

  // ========== PRIVATE KEY STORAGE ==========

  /**
   * Save encrypted private key to IndexedDB
   * Private key is encrypted with user's password (derived key)
   * Should only be called during registration or key rotation
   * @param {string} username - User identifier
   * @param {Object} encryptedPrivateKeyData - Encrypted key object with { encryptedData, salt, iv, algorithm }
   * @param {Object} encryptedSigningPrivateKeyData - Encrypted signing key object
   * @param {Object} metadata - Additional data (creation date, key version)
   * @returns {Promise<void>}
   */
  async function savePrivateKey(username, encryptedPrivateKeyData, encryptedSigningPrivateKeyData = null, metadata = {}) {
    try {
      console.log("[savePrivateKey] START - username:", username);
      
      // Get database connection
      const db = await initializeDatabase();
      if (!db) {
        throw new Error("Failed to get database connection");
      }

      // Prepare data to store FIRST before transaction
      const encPrivateKeyStr = typeof encryptedPrivateKeyData === 'string' ? encryptedPrivateKeyData : JSON.stringify(encryptedPrivateKeyData);
      const encSigningKeyStr = encryptedSigningPrivateKeyData ? (typeof encryptedSigningPrivateKeyData === 'string' ? encryptedSigningPrivateKeyData : JSON.stringify(encryptedSigningPrivateKeyData)) : null;
      
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername) {
        throw new Error('Invalid username for IndexedDB storage');
      }

      const data = {
        username: normalizedUsername,
        encrypted_private_key: encPrivateKeyStr,
        encrypted_signing_private_key: encSigningKeyStr,
        created_at: metadata.created_at || new Date().toISOString(),
        key_version: metadata.key_version || 1,
        key_id: metadata.key_id || normalizedUsername + '_v1'
      };

      console.log("[savePrivateKey] Prepared data for normalized username:", normalizedUsername, "key length:", encPrivateKeyStr.length);

      // Return promise that handles both request success AND transaction completion
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readwrite');
          const store = transaction.objectStore(STORES.PRIVATE_KEYS);
          const request = store.put(data);

          // Handle successful write
          request.onsuccess = () => {
            console.log(`[savePrivateKey] PUT succeeded`);
          };

          // Handle request error
          request.onerror = () => {
            console.error(`[savePrivateKey] PUT failed:`, request.error);
            reject(new Error('Failed to save private key: ' + request.error));
          };

          // Handle transaction completion
          transaction.oncomplete = () => {
            console.log(`[savePrivateKey] Transaction complete - saved for ${username}`);
            resolve();
          };

          // Handle transaction error
          transaction.onerror = () => {
            console.error(`[savePrivateKey] Transaction error:`, transaction.error);
            reject(new Error('Transaction error: ' + transaction.error));
          };
        } catch (txnError) {
          console.error('[savePrivateKey] Transaction creation error:', txnError);
          reject(txnError);
        }
      });
    } catch (error) {
      console.error('[savePrivateKey] Exception:', error);
      throw error;
    }
  }

  /**
   * Load encrypted private key from IndexedDB
   * Returns encrypted key - must be decrypted with password
   * @param {string} username - User identifier
   * @returns {Promise<string|null>} Encrypted private key JSON string, null if not found
   */
  async function loadPrivateKey(username) {
    try {
      const normalizedUsername = normalizeUsername(username);
      console.log("[loadPrivateKey] Loading for:", username, "normalized:", normalizedUsername);
      
      // Get database connection
      const db = await initializeDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');
        const store = transaction.objectStore(STORES.PRIVATE_KEYS);
        const request = store.get(username);

        const handleResult = (resultUsername, result) => {
          if (result && result.encrypted_private_key) {
            console.log("[loadPrivateKey] Found! Username:", resultUsername, "Key length:", result.encrypted_private_key.length);
            const keyData = result.encrypted_private_key;
            if (typeof keyData === 'string') {
              resolve(keyData);
            } else if (typeof keyData === 'object' && keyData !== null) {
              resolve(JSON.stringify(keyData));
            } else {
              resolve(null);
            }
            return true;
          }
          return false;
        };

        request.onsuccess = () => {
          const result = request.result;
          if (handleResult(username, result)) {
            return;
          }

          if (normalizedUsername && normalizedUsername !== username) {
            console.log("[loadPrivateKey] Exact not found, trying normalized username:", normalizedUsername);
            const fallbackTransaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');
            const fallbackStore = fallbackTransaction.objectStore(STORES.PRIVATE_KEYS);
            const fallbackRequest = fallbackStore.get(normalizedUsername);

            fallbackRequest.onsuccess = () => {
              const fallbackResult = fallbackRequest.result;
              if (handleResult(normalizedUsername, fallbackResult)) {
                return;
              }
              console.warn("[loadPrivateKey] NOT FOUND for:", username, "or normalized:", normalizedUsername);
              resolve(null);
            };

            fallbackRequest.onerror = () => {
              console.error('[loadPrivateKey] Fallback DB Error:', fallbackRequest.error);
              reject(new Error('Failed to load private key: ' + fallbackRequest.error));
            };

            fallbackTransaction.onerror = () => {
              console.error('[loadPrivateKey] Fallback transaction error:', fallbackTransaction.error);
              reject(new Error('Transaction error: ' + fallbackTransaction.error));
            };
          } else {
            console.warn("[loadPrivateKey] NOT FOUND for:", username);
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('[loadPrivateKey] DB Error:', request.error);
          reject(new Error('Failed to load private key: ' + request.error));
        };

        transaction.onerror = () => {
          console.error('[loadPrivateKey] Transaction error:', transaction.error);
          reject(new Error('Transaction error: ' + transaction.error));
        };
      });
    } catch (error) {
      console.error('[loadPrivateKey] Exception:', error);
      throw error;
    }
  }

  async function loadSigningPrivateKey(username) {
    try {
      const normalizedUsername = normalizeUsername(username);
      console.log("[loadSigningPrivateKey] Loading for:", username, "normalized:", normalizedUsername);
      
      const db = await initializeDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');
        const store = transaction.objectStore(STORES.PRIVATE_KEYS);
        const request = store.get(username);

        const handleResult = (resultUsername, result) => {
          if (result && result.encrypted_signing_private_key) {
            console.log("[loadSigningPrivateKey] Found! Username:", resultUsername, "Key length:", result.encrypted_signing_private_key.length);
            const keyData = result.encrypted_signing_private_key;
            if (typeof keyData === 'string') {
              resolve(keyData);
            } else if (typeof keyData === 'object' && keyData !== null) {
              resolve(JSON.stringify(keyData));
            } else {
              resolve(null);
            }
            return true;
          }
          return false;
        };

        request.onsuccess = () => {
          const result = request.result;
          if (handleResult(username, result)) {
            return;
          }

          if (normalizedUsername && normalizedUsername !== username) {
            console.log("[loadSigningPrivateKey] Exact not found, trying normalized username:", normalizedUsername);
            const fallbackTransaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');
            const fallbackStore = fallbackTransaction.objectStore(STORES.PRIVATE_KEYS);
            const fallbackRequest = fallbackStore.get(normalizedUsername);

            fallbackRequest.onsuccess = () => {
              const fallbackResult = fallbackRequest.result;
              if (handleResult(normalizedUsername, fallbackResult)) {
                return;
              }
              console.warn("[loadSigningPrivateKey] NOT FOUND for:", username, "or normalized:", normalizedUsername);
              resolve(null);
            };

            fallbackRequest.onerror = () => {
              console.error('[loadSigningPrivateKey] Fallback DB Error:', fallbackRequest.error);
              reject(new Error('Failed to load signing private key: ' + fallbackRequest.error));
            };

            fallbackTransaction.onerror = () => {
              console.error('[loadSigningPrivateKey] Fallback transaction error:', fallbackTransaction.error);
              reject(new Error('Transaction error: ' + fallbackTransaction.error));
            };
          } else {
            console.warn("[loadSigningPrivateKey] NOT FOUND for:", username);
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('[loadSigningPrivateKey] DB Error:', request.error);
          reject(new Error('Failed to load signing private key: ' + request.error));
        };

        transaction.onerror = () => {
          console.error('[loadSigningPrivateKey] Transaction error:', transaction.error);
          reject(new Error('Transaction error: ' + transaction.error));
        };
      });
    } catch (error) {
      console.error('[loadSigningPrivateKey] Exception:', error);
      throw error;
    }
  }

  // ========== GROUP KEY STORAGE ==========

  /**
   * Save raw AES group key for local use
   * @param {string} groupId - Group identifier
   * @param {string} groupKeyBase64 - Base64 encoded raw AES group key
   * @returns {Promise<void>}
   */
  async function saveGroupKey(groupId, groupKeyBase64) {
    try {
      const db = await initializeDatabase();
      const transaction = db.transaction([STORES.GROUP_KEYS], 'readwrite');
      const store = transaction.objectStore(STORES.GROUP_KEYS);
      const data = {
        group_id: groupId,
        group_key: groupKeyBase64,
        created_at: new Date().toISOString()
      };
      const request = store.put(data);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log(`Group key saved for group ${groupId}`);
          resolve();
        };
        request.onerror = () => {
          reject(new Error('Failed to save group key: ' + request.error));
        };
      });
    } catch (error) {
      console.error('Error in saveGroupKey:', error);
      throw error;
    }
  }

  /**
   * Load raw AES group key for local use
   * @param {string} groupId - Group identifier
   * @returns {Promise<string>} Base64 encoded group key, or null if not found
   */
  async function loadGroupKey(groupId) {
    try {
      const db = await initializeDatabase();
      const transaction = db.transaction([STORES.GROUP_KEYS], 'readonly');
      const store = transaction.objectStore(STORES.GROUP_KEYS);
      const request = store.get(groupId);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve(result.group_key);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => {
          reject(new Error('Failed to load group key: ' + request.error));
        };
      });
    } catch (error) {
      console.error('Error in loadGroupKey:', error);
      throw error;
    }
  }

  /**
   * Save encrypted group key for a specific user in a group
   * This is the envelope encryption: group_key encrypted with user's public key
   * @param {string} groupId - Group identifier (UUID)
   * @param {string} username - User identifier
   * @param {string} encryptedGroupKeyBase64 - Group key encrypted with user's public key
   * @returns {Promise<void>}
   */
  async function saveEncryptedGroupKey(groupId, username, encryptedGroupKeyBase64) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for writing to encrypted_group_keys store
      const transaction = db.transaction([STORES.ENCRYPTED_GROUP_KEYS], 'readwrite');

      // Get reference to object store
      const store = transaction.objectStore(STORES.ENCRYPTED_GROUP_KEYS);

      // Prepare data to store
      const data = {
        group_id: groupId, // Which group
        username: username, // Which user (this user's copy, encrypted with their public key)
        encrypted_group_key: encryptedGroupKeyBase64, // Group key encrypted with user's public key
        created_at: new Date().toISOString(), // When this copy was created
        key_version: 1 // Version for key rotation
      };

      // Put (insert or update) the encrypted group key
      const request = store.put(data);

      // Wait for write to complete
      return new Promise((resolve, reject) => {
        // Handle successful write
        request.onsuccess = () => {
          // Log success
          console.log(`Encrypted group key saved for ${username} in group ${groupId}`);
          // Resolve promise
          resolve();
        };

        // Handle write errors
        request.onerror = () => {
          // Reject with error
          reject(new Error('Failed to save encrypted group key: ' + request.error));
        };
      });
    } catch (error) {
      // Log errors
      console.error('Error in saveEncryptedGroupKey:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Load encrypted group key for user from IndexedDB
   * @param {string} groupId - Group identifier
   * @param {string} username - User identifier
   * @returns {Promise<string>} Encrypted group key (Base64), null if not found
   */
  async function loadEncryptedGroupKey(groupId, username) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for reading
      const transaction = db.transaction([STORES.ENCRYPTED_GROUP_KEYS], 'readonly');

      // Get reference to object store
      const store = transaction.objectStore(STORES.ENCRYPTED_GROUP_KEYS);

      // Get index by group_id and username
      const index = store.index('group_user');

      // Request to get encrypted group key for this user in this group
      const request = index.get([groupId, username]);

      // Wait for read to complete
      return new Promise((resolve, reject) => {
        // Handle successful read
        request.onsuccess = () => {
          // Get the result
          const result = request.result;

          // Check if key was found
          if (result) {
            // Return encrypted group key
            resolve(result.encrypted_group_key);
          } else {
            // Return null if not found
            resolve(null);
          }
        };

        // Handle read errors
        request.onerror = () => {
          // Reject with error
          reject(new Error('Failed to load encrypted group key: ' + request.error));
        };
      });
    } catch (error) {
      // Log errors
      console.error('Error in loadEncryptedGroupKey:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  // ========== SENSITIVE DATA CLEANUP ==========

  /**
   * Clear session data from memory on logout
   * IMPORTANT: Does NOT delete persistent encrypted private keys!
   * 
   * Logout should only clear:
   * - Temporary decrypted keys in memory (RAM)
   * - Group key cache from this session
   * 
   * Logout should NOT delete:
   * - Encrypted private key (persisted in IndexedDB for next login)
   * - Encrypted group keys (persisted for member re-use)
   * 
   * This ensures users can login again without re-registering
   * @param {string} username - User identifier
   * @returns {Promise<void>}
   */
  async function clearSensitiveData(username) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for clearing ONLY temporary session data
      // DO NOT delete persistent encrypted private keys!
      const transaction = db.transaction(
        [STORES.GROUP_KEYS],  // ONLY clear RAM-cached group keys
        'readwrite'
      );

      // CRITICAL: Do NOT delete private key from STORES.PRIVATE_KEYS
      // The encrypted private key must persist for the next login
      // Users should not need to re-register after logout

      // Clear only the temporarily cached group keys (these were loaded into memory)
      // These can be re-loaded from server or re-derived on next login
      const groupKeyStore = transaction.objectStore(STORES.GROUP_KEYS);
      groupKeyStore.clear();

      // Note: STORES.ENCRYPTED_GROUP_KEYS is also kept for persistence
      // Encrypted group keys per user are needed after re-login

      // Wait for cache clearing to complete
      return new Promise((resolve, reject) => {
        // Handle successful completion
        transaction.oncomplete = () => {
          // Log that session data was cleared (but persistent keys kept)
          console.log(`[LOGOUT] Cleared session cache for ${username} (encrypted keys PRESERVED in IndexedDB)`);
          // Resolve promise
          resolve();
        };

        // Handle transaction errors
        transaction.onerror = () => {
          // Reject with error
          reject(new Error('Failed to clear session data: ' + transaction.error));
        };
      });
    } catch (error) {
      // Log errors
      console.error('[LOGOUT ERROR] in clearSensitiveData:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Close database connection
   * Called on logout to release resources
   * @returns {void}
   */
  function closeDatabase() {
    // Check if database is open
    if (cachedDB) {
      // Close the connection
      cachedDB.close();
      // Clear the cache
      cachedDB = null;
      // Log closure
      console.log('IndexedDB connection closed');
    }
  }

  /**
   * Delete all stored keys for a specific user
   * Used to clean up corrupted key data
   * @param {string} username - Username to delete keys for
   * @returns {Promise<void>}
   */
  async function deleteUserKeys(username) {
    try {
      console.log(`[deleteUserKeys] START - username: ${username}`);
      const db = await initializeDatabase();
      console.log(`[deleteUserKeys] Got database connection`);
      
      const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readwrite');
      console.log(`[deleteUserKeys] Created transaction`);
      
      const store = transaction.objectStore(STORES.PRIVATE_KEYS);
      console.log(`[deleteUserKeys] Got object store`);
      
      const request = store.delete(username);
      console.log(`[deleteUserKeys] Submitted DELETE request`);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log(`[deleteUserKeys] SUCCESS - Deleted keys for ${username}`);
          resolve();
        };
        request.onerror = () => {
          console.error(`[deleteUserKeys] ERROR:`, request.error);
          reject(new Error('Failed to delete user keys: ' + request.error));
        };
        
        transaction.onerror = () => {
          console.error(`[deleteUserKeys] TRANSACTION ERROR:`, transaction.error);
          reject(new Error('Transaction error: ' + transaction.error));
        };
      });
    } catch (error) {
      console.error('[deleteUserKeys] Exception:', error);
      throw error;
    }
  }

  // ========== PUBLIC API EXPORT ==========

  // Return public interface
  return {
    // Database initialization
    initializeDatabase,
    // Password-based encryption for private keys
    encryptPrivateKeyWithPassword,
    decryptPrivateKeyWithPassword,
    // Private key operations
    savePrivateKey,
    loadPrivateKey,
    loadSigningPrivateKey,
    deleteUserKeys,
    // Raw group key operations
    saveGroupKey,
    loadGroupKey,
    // Encrypted group key operations
    saveEncryptedGroupKey,
    loadEncryptedGroupKey,
    // Cleanup
    clearSensitiveData,
    closeDatabase
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IndexedDBModule;
}
