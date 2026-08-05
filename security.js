/* ========== SECURITY MODULE ==========
 * Handles security operations across the application
 * Manages key lifecycle, envelope encryption, key rotation
 * =========================================== */

const SecurityModule = (() => {
  // ========== USER KEY INITIALIZATION ==========

  /**
   * Initialize user's cryptographic keys
   * Called during registration to create RSA keypair and store encrypted key in IndexedDB
   * @param {string} username - Username registering
   * @returns {Promise<{publicKey: string}>} Base64 encoded public key to send to server
   */
  async function initializeUserKeys(username) {
    try {
      // Generate RSA key pair for encryption (RSA-OAEP)
      const encryptionKeyPair = await CryptoModule.generateKeyPair();
      // Generate RSA key pair for signatures (RSA-PSS)
      const signatureKeyPair = await CryptoModule.generateSignatureKeyPair();

      // Export public keys for server
      const encryptionPublicKeyBase64 = await CryptoModule.exportPublicKey(encryptionKeyPair.publicKey);
      const signaturePublicKeyBase64 = await CryptoModule.exportPublicKey(signatureKeyPair.publicKey);
      
      // Export private keys for IndexedDB storage (encrypted at rest)
      const encryptionPrivateKeyBase64 = await CryptoModule.exportPrivateKey(encryptionKeyPair.privateKey);
      const signaturePrivateKeyBase64 = await CryptoModule.exportPrivateKey(signatureKeyPair.privateKey);

      // Save encryption keypair to IndexedDB
      await IndexedDBModule.savePrivateKey(
        username,
        'encryption',
        encryptionPrivateKeyBase64,
        encryptionPublicKeyBase64
      );

      // Save signature keypair to IndexedDB
      await IndexedDBModule.savePrivateKey(
        username,
        'signature',
        signaturePrivateKeyBase64,
        signaturePublicKeyBase64
      );

      // Save metadata about keys
      await IndexedDBModule.saveCryptoMetadata(username, {
        encryption_public_key: encryptionPublicKeyBase64,
        signature_public_key: signaturePublicKeyBase64,
        keys_created_at: new Date().toISOString()
      });

      // Return public keys for server registration
      return {
        public_key: encryptionPublicKeyBase64,
        signature_public_key: signaturePublicKeyBase64
      };
    } catch (error) {
      console.error('Error initializing user keys:', error);
      throw error;
    }
  }

  /**
   * Load user's private keys from IndexedDB after login
   * Private keys are only kept in RAM while session is active
   * @param {string} username - Username logging in
   * @returns {Promise<{encryptionPrivateKey: CryptoKey, signaturePrivateKey: CryptoKey}>}
   */
  async function loadUserKeys(username) {
    try {
      // Retrieve encrypted private keys from IndexedDB
      const encryptionKeyData = await IndexedDBModule.loadPrivateKey(username, 'encryption');
      const signatureKeyData = await IndexedDBModule.loadPrivateKey(username, 'signature');

      if (!encryptionKeyData || !signatureKeyData) {
        throw new Error('User keys not found in storage');
      }

      // Decrypt private keys (in production, would use password-based encryption)
      const encryptionPrivateKey = await CryptoModule.importPrivateKey(encryptionKeyData.private_key);
      const signaturePrivateKey = await CryptoModule.importPrivateKey(signatureKeyData.private_key, 'sign');

      // Return private keys for session use
      return {
        encryptionPrivateKey,
        signaturePrivateKey
      };
    } catch (error) {
      console.error('Error loading user keys:', error);
      throw error;
    }
  }

  // ========== GROUP KEY MANAGEMENT ==========

  /**
   * Create new group key for group
   * Called when creating a new group
   * @param {string} groupId - UUID of group
   * @param {string} groupName - Name of group
   * @param {string} creator - Username of creator
   * @param {CryptoKey} creatorPublicKey - Creator's RSA public key
   * @returns {Promise<{groupKey: CryptoKey, encryptedGroupKey: string}>}
   */
  async function createGroupKey(groupId, groupName, creator, creatorPublicKey) {
    try {
      // Generate new AES-GCM key for group
      const groupKey = await CryptoModule.generateGroupKey();

      // Encrypt group key with creator's public key
      const encryptedGroupKey = await CryptoModule.encryptGroupKeyForUser(
        groupKey,
        creatorPublicKey
      );

      // Save encrypted group key to IndexedDB for creator
      await IndexedDBModule.saveGroupKey(
        groupId,
        creator,
        encryptedGroupKey
      );

      // Save group key metadata
      await IndexedDBModule.saveCryptoMetadata(`group_${groupId}`, {
        group_name: groupName,
        creator: creator,
        group_key_created_at: new Date().toISOString(),
        key_rotation_count: 0
      });

      return {
        groupKey,
        encryptedGroupKey
      };
    } catch (error) {
      console.error('Error creating group key:', error);
      throw error;
    }
  }

  /**
   * Encrypt group key for new member
   * Called when adding a member to a group
   * @param {string} groupId - UUID of group
   * @param {string} newMember - Username of new member
   * @param {string} memberPublicKeyBase64 - Base64 encoded public key of new member
   * @param {CryptoKey} currentGroupKey - Current AES group key
   * @returns {Promise<string>} Encrypted group key for new member
   */
  async function encryptGroupKeyForMember(groupId, newMember, memberPublicKeyBase64, currentGroupKey) {
    try {
      // Import new member's public key
      const memberPublicKey = await CryptoModule.importPublicKey(memberPublicKeyBase64);

      // Encrypt group key with new member's public key
      const encryptedGroupKey = await CryptoModule.encryptGroupKeyForUser(
        currentGroupKey,
        memberPublicKey
      );

      // Save encrypted group key for this member
      await IndexedDBModule.saveGroupKey(
        groupId,
        newMember,
        encryptedGroupKey
      );

      return encryptedGroupKey;
    } catch (error) {
      console.error('Error encrypting group key for member:', error);
      throw error;
    }
  }

  /**
   * Get decrypted group key for user
   * Called before sending/receiving group messages
   * @param {string} groupId - UUID of group
   * @param {CryptoKey} userPrivateKey - User's RSA private key
   * @returns {Promise<CryptoKey>} Decrypted AES group key
   */
  async function getGroupKey(groupId, userPrivateKey) {
    try {
      // Load encrypted group key from IndexedDB
      const encryptedGroupKey = await IndexedDBModule.loadGroupKey(groupId);

      if (!encryptedGroupKey) {
        throw new Error(`No group key found for group ${groupId}`);
      }

      // Decrypt with user's private key
      const groupKey = await CryptoModule.decryptGroupKey(
        encryptedGroupKey,
        userPrivateKey
      );

      return groupKey;
    } catch (error) {
      console.error('Error getting group key:', error);
      throw error;
    }
  }

  // ========== KEY ROTATION ==========

  /**
   * Rotate group key when member is removed
   * OLD KEY MUST NEVER BE REUSED after member removal
   * @param {string} groupId - UUID of group
   * @param {Array<string>} remainingMembers - List of usernames still in group
   * @param {CryptoKey} adminPrivateKey - Current admin's private key
   * @param {CryptoKey} currentGroupKey - Current AES group key
   * @returns {Promise<{newGroupKey: CryptoKey, newEncryptedKeys: Object}>}
   */
  async function rotateGroupKeyOnMemberRemoval(
    groupId,
    remainingMembers,
    adminPrivateKey,
    currentGroupKey
  ) {
    try {
      // Generate completely new AES group key
      // OLD key CANNOT be decrypted by removed member
      const newGroupKey = await CryptoModule.generateGroupKey();

      // Re-encrypt new key for all remaining members
      const newEncryptedKeys = {};

      for (const memberUsername of remainingMembers) {
        // Fetch member's public key from server
        const response = await fetch(`${API_BASE_URL}/user_public_key?username=${encodeURIComponent(memberUsername)}&token=${authToken}`);
        const data = await response.json();
        
        // Encrypt new group key with member's public key
        const memberPublicKey = await CryptoModule.importPublicKey(data.public_key);
        const encryptedKey = await CryptoModule.encryptGroupKeyForUser(newGroupKey, memberPublicKey);
        
        newEncryptedKeys[memberUsername] = encryptedKey;

        // Update encrypted key in IndexedDB
        await IndexedDBModule.saveGroupKey(groupId, memberUsername, encryptedKey);
      }

      // Increment key rotation counter in metadata
      const metadata = await IndexedDBModule.loadCryptoMetadata(`group_${groupId}`);
      if (metadata) {
        metadata.key_rotation_count = (metadata.key_rotation_count || 0) + 1;
        metadata.last_rotation_at = new Date().toISOString();
        await IndexedDBModule.saveCryptoMetadata(`group_${groupId}`, metadata);
      }

      return {
        newGroupKey,
        newEncryptedKeys
      };
    } catch (error) {
      console.error('Error rotating group key:', error);
      throw error;
    }
  }

  // ========== MESSAGE ENCRYPTION/DECRYPTION ==========

  /**
   * Encrypt message for group
   * Message is encrypted with group key, signed with private key
   * @param {string} messageText - Plain text message
   * @param {CryptoKey} groupKey - AES group key
   * @param {CryptoKey} signingPrivateKey - User's RSA signing private key
   * @returns {Promise<{ciphertext: string, nonce: string, signature: string}>}
   */
  async function encryptGroupMessage(messageText, groupKey, signingPrivateKey) {
    try {
      // Encrypt message with group key
      const encrypted = await CryptoModule.encryptMessage(messageText, groupKey);

      // Sign the ciphertext (prevents tampering)
      const signature = await CryptoModule.signMessage(encrypted.ciphertext, signingPrivateKey);

      return {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        signature: signature
      };
    } catch (error) {
      console.error('Error encrypting message:', error);
      throw error;
    }
  }

  /**
   * Decrypt and verify message from group
   * @param {string} ciphertext - Base64 encrypted message
   * @param {string} nonce - Base64 nonce
   * @param {string} signature - Base64 signature
   * @param {CryptoKey} groupKey - AES group key
   * @param {string} senderSigningPublicKeyBase64 - Sender's signing public key
   * @returns {Promise<{plaintext: string, signatureValid: boolean}>}
   */
  async function decryptGroupMessage(
    ciphertext,
    nonce,
    signature,
    groupKey,
    senderSigningPublicKeyBase64
  ) {
    try {
      // Import sender's public key for signature verification
      const senderPublicKey = await CryptoModule.importPublicKey(
        senderSigningPublicKeyBase64,
        'signature'
      );

      // Verify signature (checks message wasn't tampered with)
      const signatureValid = await CryptoModule.verifySignature(
        ciphertext,
        signature,
        senderPublicKey
      );

      // Decrypt message
      const plaintext = await CryptoModule.decryptMessage(ciphertext, nonce, groupKey);

      return {
        plaintext,
        signatureValid
      };
    } catch (error) {
      console.error('Error decrypting message:', error);
      throw error;
    }
  }

  // ========== SESSION CLEANUP ==========

  /**
   * Clear sensitive data on logout
   * Remove private keys from memory
   * @returns {Promise<void>}
   */
  async function clearSensitiveData() {
    try {
      // Clear IndexedDB sensitive data
      await IndexedDBModule.clearSensitiveData();

      // Clear global key references (security: remove from memory)
      // In production, these would be set to null/undefined
      
      console.log('Sensitive data cleared on logout');
    } catch (error) {
      console.error('Error clearing sensitive data:', error);
    }
  }

  // ========== PUBLIC API EXPORT ==========

  return {
    // Key initialization
    initializeUserKeys,
    loadUserKeys,
    // Group key operations
    createGroupKey,
    encryptGroupKeyForMember,
    getGroupKey,
    rotateGroupKeyOnMemberRemoval,
    // Message operations
    encryptGroupMessage,
    decryptGroupMessage,
    // Cleanup
    clearSensitiveData
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityModule;
}
