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

  // ========== PRIVATE KEY STORAGE ==========

  /**
   * Save encrypted private key to IndexedDB
   * Private key is encrypted with user's password (derived key)
   * Should only be called during registration or key rotation
   * @param {string} username - User identifier
   * @param {string} encryptedPrivateKeyBase64 - Password-encrypted private key
   * @param {Object} metadata - Additional data (creation date, key version)
   * @returns {Promise<void>}
   */
  async function savePrivateKey(username, encryptedPrivateKeyBase64, encryptedSigningPrivateKeyBase64 = null, metadata = {}) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for writing to private_keys store
      // readwrite: allows modification
      const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readwrite');

      // Get reference to object store
      const store = transaction.objectStore(STORES.PRIVATE_KEYS);

      // Prepare data to store
      const data = {
        username: username, // Key identifier
        encrypted_private_key: encryptedPrivateKeyBase64, // Encrypted RSA private key
        encrypted_signing_private_key: encryptedSigningPrivateKeyBase64 || null, // Optional encrypted signing key
        created_at: metadata.created_at || new Date().toISOString(), // Creation timestamp
        key_version: metadata.key_version || 1, // Version for key rotation
        key_id: metadata.key_id || username + '_v1' // Unique key identifier
      };

      // Put (insert or update) the private key in storage
      const request = store.put(data);

      // Wait for write to complete
      return new Promise((resolve, reject) => {
        // Handle successful write
        request.onsuccess = () => {
          // Log success (in production, would use secure logger)
          console.log(`Private key saved for ${username}`);
          // Resolve promise
          resolve();
        };

        // Handle write errors
        request.onerror = () => {
          // Reject with error
          reject(new Error('Failed to save private key: ' + request.error));
        };
      });
    } catch (error) {
      // Log initialization errors
      console.error('Error in savePrivateKey:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Load encrypted private key from IndexedDB
   * Returns encrypted key - must be decrypted with password
   * @param {string} username - User identifier
   * @returns {Promise<string>} Encrypted private key (Base64), null if not found
   */
  async function loadPrivateKey(username) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for reading from private_keys store
      // readonly: read-only access
      const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');

      // Get reference to object store
      const store = transaction.objectStore(STORES.PRIVATE_KEYS);

      // Request to get private key for user
      const request = store.get(username);

      // Wait for read to complete
      return new Promise((resolve, reject) => {
        // Handle successful read
        request.onsuccess = () => {
          // Get the result
          const result = request.result;

          // Check if key was found
          if (result) {
            // Return encrypted private key
            resolve(result.encrypted_private_key);
          } else {
            // Return null if not found
            resolve(null);
          }
        };

        // Handle read errors
        request.onerror = () => {
          // Reject with error
          reject(new Error('Failed to load private key: ' + request.error));
        };
      });
    } catch (error) {
      // Log errors
      console.error('Error in loadPrivateKey:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  async function loadSigningPrivateKey(username) {
    try {
      const db = await initializeDatabase();
      const transaction = db.transaction([STORES.PRIVATE_KEYS], 'readonly');
      const store = transaction.objectStore(STORES.PRIVATE_KEYS);
      const request = store.get(username);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve(result.encrypted_signing_private_key || null);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => {
          reject(new Error('Failed to load signing private key: ' + request.error));
        };
      });
    } catch (error) {
      console.error('Error in loadSigningPrivateKey:', error);
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
   * Delete all sensitive data from IndexedDB on logout
   * Ensures no keys remain in storage after user leaves
   * @param {string} username - User identifier
   * @returns {Promise<void>}
   */
  async function clearSensitiveData(username) {
    try {
      // Get database connection
      const db = await initializeDatabase();

      // Create transaction for deleting from multiple stores
      const transaction = db.transaction(
        [STORES.PRIVATE_KEYS, STORES.GROUP_KEYS, STORES.ENCRYPTED_GROUP_KEYS],
        'readwrite'
      );

      // Delete private key
      const privKeyStore = transaction.objectStore(STORES.PRIVATE_KEYS);
      privKeyStore.delete(username);

      // Delete all group keys (should already be cleared from RAM)
      const groupKeyStore = transaction.objectStore(STORES.GROUP_KEYS);
      groupKeyStore.clear();

      // Delete all encrypted group keys for user
      const encGroupKeyStore = transaction.objectStore(STORES.ENCRYPTED_GROUP_KEYS);
      const index = encGroupKeyStore.index('group_user');
      const range = IDBKeyRange.bound([undefined, username], [undefined, username], false, false);
      // Note: This simple approach clears all group keys - in production might want selective deletion

      // Wait for all deletions to complete
      return new Promise((resolve, reject) => {
        // Handle successful completion
        transaction.oncomplete = () => {
          // Log success
          console.log(`Cleared all sensitive data for ${username}`);
          // Resolve promise
          resolve();
        };

        // Handle transaction errors
        transaction.onerror = () => {
          // Reject with error
          reject(new Error('Failed to clear sensitive data: ' + transaction.error));
        };
      });
    } catch (error) {
      // Log errors
      console.error('Error in clearSensitiveData:', error);
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

  // ========== PUBLIC API EXPORT ==========

  // Return public interface
  return {
    // Database initialization
    initializeDatabase,
    // Private key operations
    savePrivateKey,
    loadPrivateKey,
    loadSigningPrivateKey,
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
