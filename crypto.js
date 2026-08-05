/* ========== CRYPTO MODULE ==========
 * Implements WebCrypto API for end-to-end encryption
 * Provides RSA-OAEP + AES-GCM envelope encryption
 * All cryptography is performed client-side using window.crypto.subtle
 * =========================================== */

const CryptoModule = (() => {
  // ========== ALGORITHM CONFIGURATION ==========
  
  // RSA-OAEP key generation parameters
  const RSA_ALGORITHM = {
    name: 'RSA-OAEP',
    modulusLength: 4096, // 4096-bit RSA keys for strong asymmetric encryption
    publicExponent: new Uint8Array([1, 0, 1]), // Standard public exponent (65537)
    hash: 'SHA-256' // Use SHA-256 for the hash function
  };

  // RSA-OAEP encryption parameters
  const RSA_ENCRYPT_ALGORITHM = { name: 'RSA-OAEP' };

  // AES-GCM group key generation parameters
  const AES_ALGORITHM = {
    name: 'AES-GCM',
    length: 256 // 256-bit AES key for symmetric group encryption
  };

  // AES-GCM encryption/decryption parameters
  const AES_ENCRYPT_ALGORITHM = { name: 'AES-GCM' };

  // RSA-PSS signature key generation parameters
  const SIGNATURE_KEY_ALGORITHM = {
    name: 'RSA-PSS',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-512'
  };

  // RSA-PSS signature algorithm parameters for sign/verify
  const SIGNATURE_ALGORITHM = {
    name: 'RSA-PSS',
    saltLength: 32,
    hash: 'SHA-512'
  };

  // ========== UTILITY FUNCTIONS ==========

  /**
   * Convert ArrayBuffer to Base64 string
   * @param {ArrayBuffer} buffer - Data to encode
   * @returns {string} Base64 encoded string
   */
  function arrayBufferToBase64(buffer) {
    // Convert ArrayBuffer to byte array for iteration
    const bytes = new Uint8Array(buffer);
    // Build string from byte codes
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Convert binary string to Base64
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer
   * @param {string} base64 - Base64 encoded string
   * @returns {ArrayBuffer} Decoded binary data
   */
  function base64ToArrayBuffer(base64) {
    // Decode Base64 to binary string
    const binary = atob(base64);
    // Create byte array
    const bytes = new Uint8Array(binary.length);
    // Fill byte array with character codes
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // Return as ArrayBuffer
    return bytes.buffer;
  }

  /**
   * Generate random nonce for AES-GCM
   * @returns {Uint8Array} 12-byte random nonce
   */
  function generateNonce() {
    // Generate 12 random bytes (96 bits) - standard for GCM
    return window.crypto.getRandomValues(new Uint8Array(12));
  }

  /**
   * Convert text string to Uint8Array
   * @param {string} text - Text to encode
   * @returns {Uint8Array} UTF-8 encoded bytes
   */
  function stringToBytes(text) {
    // Create TextEncoder for UTF-8 conversion
    const encoder = new TextEncoder();
    // Encode string to UTF-8 bytes
    return encoder.encode(text);
  }

  /**
   * Convert Uint8Array to text string
   * @param {Uint8Array} bytes - Bytes to decode
   * @returns {string} Decoded UTF-8 text
   */
  function bytesToString(bytes) {
    // Create TextDecoder for UTF-8 conversion
    const decoder = new TextDecoder('utf-8');
    // Decode bytes to string
    return decoder.decode(bytes);
  }

  // ========== RSA KEY PAIR GENERATION ==========

  /**
   * Generate RSA key pair for user
   * RSA-OAEP is used for asymmetric encryption of group keys
   * Private keys are NEVER sent to server
   * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
   */
  async function generateKeyPair() {
    try {
      // Generate RSA-OAEP key pair using WebCrypto
      // Extractable: true allows exporting public key to server
      const keyPair = await window.crypto.subtle.generateKey(
        RSA_ALGORITHM,
        true, // extractable - needed for publicKey export only
        ['encrypt', 'decrypt'] // operations: RSA-OAEP only supports encrypt/decrypt
      );
      // Return generated key pair
      return keyPair;
    } catch (error) {
      // Log generation errors
      console.error('Error generating key pair:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  async function generateSignatureKeyPair() {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        SIGNATURE_KEY_ALGORITHM,
        true,
        ['sign', 'verify']
      );
      return keyPair;
    } catch (error) {
      console.error('Error generating signature key pair:', error);
      throw error;
    }
  }

  // ========== AES GROUP KEY GENERATION ==========

  /**
   * Generate AES-GCM key for group messages
   * Each group has ONE shared key, encrypted with member public keys
   * This is envelope encryption: group_key encrypted with member's public key
   * @returns {Promise<CryptoKey>} 256-bit AES-GCM key
   */
  async function generateGroupKey() {
    try {
      // Generate random 256-bit AES key using WebCrypto
      const groupKey = await window.crypto.subtle.generateKey(
        AES_ALGORITHM,
        true, // extractable - needed to re-encrypt for other members
        ['encrypt', 'decrypt'] // operations for message encryption/decryption
      );
      // Return generated group key
      return groupKey;
    } catch (error) {
      // Log generation errors
      console.error('Error generating group key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  // ========== PUBLIC KEY EXPORT/IMPORT ==========

  /**
   * Export public key to send to server
   * Server stores this so others can encrypt group keys for this user
   * NEVER export private key
   * @param {CryptoKey} publicKey - RSA public key
   * @returns {Promise<string>} Base64 encoded public key (JWK format)
   */
  async function exportPublicKey(publicKey) {
    try {
      // Export public key in JSON Web Key format
      // JWK is standard format for key interchange
      const jwk = await window.crypto.subtle.exportKey('jwk', publicKey);
      // Remove key_ops field to avoid import conflicts
      // Different implementations may set this field differently
      delete jwk.key_ops;
      // Convert to JSON string
      const keyString = JSON.stringify(jwk);
      // Encode as Base64 for transport
      return arrayBufferToBase64(stringToBytes(keyString));
    } catch (error) {
      // Log export errors
      console.error('Error exporting public key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Import public key from server (from another user)
   * Used to encrypt group keys when adding members
   * @param {string} publicKeyBase64 - Base64 encoded public key (JWK format)
   * @returns {Promise<CryptoKey>} Imported RSA public key
   */
  async function importPublicKey(publicKeyBase64, keyType = 'encrypt') {
    try {
      // Decode Base64 to get JWK string
      const keyBytes = new Uint8Array(base64ToArrayBuffer(publicKeyBase64));
      // Convert bytes to UTF-8 string
      const keyString = bytesToString(keyBytes);
      // Parse JSON to get JWK object
      const jwk = JSON.parse(keyString);
      const algorithm = keyType === 'signature' ? SIGNATURE_ALGORITHM : RSA_ALGORITHM;
      const usages = keyType === 'signature' ? ['verify'] : ['encrypt'];
      // Import JWK as CryptoKey for encryption or signature verification
      const publicKey = await window.crypto.subtle.importKey(
        'jwk', // format: JSON Web Key
        jwk, // key data
        algorithm, // algorithm specification
        true, // extractable
        usages
      );
      // Return imported public key
      return publicKey;
    } catch (error) {
      // Log import errors
      console.error('Error importing public key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Derive an RSA public key from a private key stored in JWK Base64 format.
   * This is useful for recovering public key material when a user account
   * has a private key locally but the server has not yet stored the public key.
   * @param {string} privateKeyBase64 - Base64 encoded private key JWK
   * @returns {Promise<CryptoKey>} Derived RSA public key
   */
  async function derivePublicKeyFromPrivateKey(privateKeyBase64, keyType = 'encrypt') {
    try {
      const keyBytes = new Uint8Array(base64ToArrayBuffer(privateKeyBase64));
      const keyString = bytesToString(keyBytes);
      const privateJwk = JSON.parse(keyString);

      const publicJwk = {
        kty: privateJwk.kty,
        n: privateJwk.n,
        e: privateJwk.e,
        alg: privateJwk.alg,
        ext: privateJwk.ext !== undefined ? privateJwk.ext : true
      };

      const algorithm = keyType === 'signature' ? SIGNATURE_ALGORITHM : RSA_ALGORITHM;
      const usages = keyType === 'signature' ? ['verify'] : ['encrypt'];

      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        publicJwk,
        algorithm,
        true,
        usages
      );

      return publicKey;
    } catch (error) {
      console.error('Error deriving public key from private key:', error);
      throw error;
    }
  }

  // ========== GROUP KEY ENVELOPE ENCRYPTION ==========

  /**
   * Encrypt group key with user's public key
   * This is called when adding a member to a group
   * @param {CryptoKey} groupKey - The AES group key to encrypt
   * @param {CryptoKey} userPublicKey - User's RSA public key
   * @returns {Promise<string>} Base64 encoded encrypted group key
   */
  async function encryptGroupKeyForUser(groupKey, userPublicKey) {
    try {
      // Export group key to raw bytes for encryption
      const groupKeyBytes = await window.crypto.subtle.exportKey('raw', groupKey);
      // Encrypt group key with user's public RSA key
      // Uses RSA-OAEP which is semantically secure
      const encryptedKey = await window.crypto.subtle.encrypt(
        RSA_ENCRYPT_ALGORITHM,
        userPublicKey,
        groupKeyBytes
      );
      // Encode encrypted key as Base64 for storage
      return arrayBufferToBase64(encryptedKey);
    } catch (error) {
      // Log encryption errors
      console.error('Error encrypting group key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Decrypt group key with user's private key
   * This is called when receiving messages from a group
   * @param {string} encryptedGroupKeyBase64 - Base64 encoded encrypted group key
   * @param {CryptoKey} privateKey - User's RSA private key
   * @returns {Promise<CryptoKey>} Decrypted AES group key
   */
  async function decryptGroupKey(encryptedGroupKeyBase64, privateKey) {
    try {
      // Decode Base64 to get encrypted bytes
      const encryptedKey = new Uint8Array(base64ToArrayBuffer(encryptedGroupKeyBase64));
      // Decrypt with user's private RSA key
      const groupKeyBytes = await window.crypto.subtle.decrypt(
        RSA_ENCRYPT_ALGORITHM,
        privateKey,
        encryptedKey
      );
      // Import decrypted bytes as AES key
      const groupKey = await window.crypto.subtle.importKey(
        'raw', // format: raw 256-bit key material
        groupKeyBytes,
        AES_ALGORITHM,
        true, // extractable - may need to re-encrypt for others
        ['encrypt', 'decrypt'] // operations: both encrypt and decrypt
      );
      // Return imported group key
      return groupKey;
    } catch (error) {
      // Log decryption errors
      console.error('Error decrypting group key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  // ========== MESSAGE ENCRYPTION/DECRYPTION ==========

  /**
   * Encrypt message with AES-GCM group key
   * Each message uses a fresh random nonce
   * @param {string} plaintext - Message to encrypt
   * @param {CryptoKey} groupKey - AES group key
   * @returns {Promise<{ciphertext: string, nonce: string}>} Encrypted message and nonce
   */
  async function encryptMessage(plaintext, groupKey) {
    try {
      // Generate fresh random nonce for this message
      // Using unique nonce for each message is CRITICAL for GCM security
      const nonce = generateNonce();
      // Convert plaintext string to bytes
      const plaintextBytes = stringToBytes(plaintext);
      // Encrypt with AES-GCM using group key and nonce
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          ...AES_ENCRYPT_ALGORITHM,
          iv: nonce // initialization vector (nonce) for GCM
        },
        groupKey,
        plaintextBytes
      );
      // Return Base64 encoded ciphertext and nonce
      return {
        ciphertext: arrayBufferToBase64(ciphertext),
        nonce: arrayBufferToBase64(nonce)
      };
    } catch (error) {
      // Log encryption errors
      console.error('Error encrypting message:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Decrypt message with AES-GCM group key
   * @param {string} ciphertextBase64 - Base64 encoded ciphertext
   * @param {string} nonceBase64 - Base64 encoded nonce
   * @param {CryptoKey} groupKey - AES group key
   * @returns {Promise<string>} Decrypted plaintext message
   */
  async function decryptMessage(ciphertextBase64, nonceBase64, groupKey) {
    try {
      // Decode Base64 to get ciphertext bytes
      const ciphertext = new Uint8Array(base64ToArrayBuffer(ciphertextBase64));
      // Decode Base64 to get nonce bytes
      const nonce = new Uint8Array(base64ToArrayBuffer(nonceBase64));
      // Decrypt with AES-GCM using group key and nonce
      const plaintextBytes = await window.crypto.subtle.decrypt(
        {
          ...AES_ENCRYPT_ALGORITHM,
          iv: nonce // initialization vector (nonce) must match encryption
        },
        groupKey,
        ciphertext
      );
      // Convert decrypted bytes to UTF-8 string
      const plaintext = bytesToString(plaintextBytes);
      // Return decrypted message
      return plaintext;
    } catch (error) {
      // Log decryption errors - likely indicates tampering or wrong key
      console.error('Error decrypting message:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  // ========== DIGITAL SIGNATURES ==========

  /**
   * Sign message with user's private key
   * Allows recipients to verify sender authenticity
   * @param {string} message - Message to sign
   * @param {CryptoKey} privateKey - User's RSA private key
   * @returns {Promise<string>} Base64 encoded signature
   */
  async function signMessage(message, privateKey) {
    try {
      // Convert message to bytes
      const messageBytes = stringToBytes(message);
      // Sign with RSA-PSS using private key
      // RSA-PSS is deterministic-free and secure for long-term signatures
      const signature = await window.crypto.subtle.sign(
        SIGNATURE_ALGORITHM,
        privateKey,
        messageBytes
      );
      // Encode signature as Base64 for transmission
      return arrayBufferToBase64(signature);
    } catch (error) {
      // Log signature errors
      console.error('Error signing message:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Verify message signature with sender's public key
   * @param {string} message - Original message that was signed
   * @param {string} signatureBase64 - Base64 encoded signature
   * @param {CryptoKey} publicKey - Sender's RSA public key
   * @returns {Promise<boolean>} True if signature is valid, false otherwise
   */
  async function verifySignature(message, signatureBase64, publicKey) {
    try {
      // Convert message to bytes
      const messageBytes = stringToBytes(message);
      // Decode Base64 to get signature bytes
      const signature = new Uint8Array(base64ToArrayBuffer(signatureBase64));
      // Verify signature with sender's public key
      const isValid = await window.crypto.subtle.verify(
        SIGNATURE_ALGORITHM,
        publicKey,
        signature,
        messageBytes
      );
      // Return verification result
      return isValid;
    } catch (error) {
      // Log verification errors
      console.error('Error verifying signature:', error);
      // Return false if verification fails (invalid signature or public key)
      return false;
    }
  }

  // ========== KEY EXPORT/IMPORT FOR STORAGE ==========

  /**
   * Export private key for encrypted storage in IndexedDB
   * Private key is encrypted with user's password/passphrase
   * @param {CryptoKey} privateKey - User's RSA private key
   * @returns {Promise<string>} Base64 encoded private key (JWK format)
   */
  async function exportPrivateKey(privateKey) {
    try {
      // Export private key in JSON Web Key format
      const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
      // Remove key_ops field to avoid import conflicts
      // Different implementations may set this field differently
      delete jwk.key_ops;
      // Convert to JSON string
      const keyString = JSON.stringify(jwk);
      // Encode as Base64 for storage
      return arrayBufferToBase64(stringToBytes(keyString));
    } catch (error) {
      // Log export errors
      console.error('Error exporting private key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Import private key from encrypted storage
   * @param {string} privateKeyBase64 - Base64 encoded private key (JWK format)
   * @returns {Promise<CryptoKey>} Imported RSA private key
   */
  async function importPrivateKey(privateKeyBase64, keyType = 'decrypt') {
    try {
      // Decode Base64 to get JWK string
      const keyBytes = new Uint8Array(base64ToArrayBuffer(privateKeyBase64));
      // Convert bytes to UTF-8 string
      const keyString = bytesToString(keyBytes);
      // Parse JSON to get JWK object
      const jwk = JSON.parse(keyString);
      const algorithm = keyType === 'sign' ? SIGNATURE_ALGORITHM : RSA_ALGORITHM;
      const usages = keyType === 'sign' ? ['sign'] : ['decrypt'];
      // Import JWK as CryptoKey for decryption or signing
      const privateKey = await window.crypto.subtle.importKey(
        'jwk', // format: JSON Web Key
        jwk, // key data
        algorithm, // algorithm specification
        true, // extractable - needed for exporting again if needed
        usages
      );
      // Return imported private key
      return privateKey;
    } catch (error) {
      // Log import errors
      console.error('Error importing private key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Export group key for encrypted storage
   * @param {CryptoKey} groupKey - AES group key
   * @returns {Promise<string>} Base64 encoded group key (raw format)
   */
  async function exportGroupKey(groupKey) {
    try {
      // Export group key as raw 256-bit key material
      const keyBytes = await window.crypto.subtle.exportKey('raw', groupKey);
      // Encode as Base64 for storage
      return arrayBufferToBase64(keyBytes);
    } catch (error) {
      // Log export errors
      console.error('Error exporting group key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Import group key from storage
   * @param {string} groupKeyBase64 - Base64 encoded group key
   * @returns {Promise<CryptoKey>} Imported AES group key
   */
  async function importGroupKey(groupKeyBase64) {
    try {
      // Decode Base64 to get key bytes
      const keyBytes = new Uint8Array(base64ToArrayBuffer(groupKeyBase64));
      // Import raw 256-bit key material as AES key
      const groupKey = await window.crypto.subtle.importKey(
        'raw', // format: raw key material
        keyBytes,
        AES_ALGORITHM,
        true, // extractable - may need to re-encrypt
        ['encrypt', 'decrypt'] // operations: both
      );
      // Return imported group key
      return groupKey;
    } catch (error) {
      // Log import errors
      console.error('Error importing group key:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }

  // ========== PUBLIC API EXPORT ==========

  // Return public interface of crypto module
  return {
    // Key pair generation
    generateKeyPair,
    generateSignatureKeyPair,
    // Group key generation
    generateGroupKey,
    // Public key operations
    exportPublicKey,
    importPublicKey,
    // Envelope encryption (group key + asymmetric)
    encryptGroupKeyForUser,
    decryptGroupKey,
    // Message encryption (AES-GCM)
    encryptMessage,
    decryptMessage,
    // Digital signatures
    signMessage,
    verifySignature,
    // Key storage export/import
    exportPrivateKey,
    importPrivateKey,
    derivePublicKeyFromPrivateKey,
    exportGroupKey,
    importGroupKey
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoModule;
}
