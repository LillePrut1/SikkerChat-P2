/* ========== API CONFIGURATION ========== */
const API_BASE_URL = "http://localhost:5000";

/* ========== GLOBAL STATE ========== */
let currentUsername = null;
let authToken = null;
let currentChatName = null;
let currentChatId = null;
let userPrivateKey = null; // RSA private key (loaded in memory after login)
let userPublicKey = null; // RSA public key (for reference)
let userSigningPrivateKey = null; // RSA signing private key
let userSigningPublicKey = null; // RSA signing public key
let groupKeys = {}; // Cache of decrypted group keys: { groupName: CryptoKey }
let groupIdByName = {}; // Map group name -> group id for key resolution
let dbReady = false; // Flag to track IndexedDB initialization

let appState = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  groups: [],
  currentMessages: []
};

let authListenersAttached = false;
let messagePollingInterval = null; // Track polling interval for auto-refresh
let lastMessageCount = 0; // Track message count to detect new messages
let lastMessageId = null; // Track last message ID to detect changes
let eventListenersAttached = false;
let isRegistering = false;
let isLoggingIn = false;

/* ========== INITIALIZATION ========== */
document.addEventListener("DOMContentLoaded", async function() {
  // Initialize IndexedDB first (crypto key storage)
  try {
    await IndexedDBModule.initializeDatabase();
    dbReady = true;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    alert("Failed to initialize secure storage");
    return;
  }
  
  initializeApp();
});

function initializeApp() {
  const savedToken = localStorage.getItem("authToken");
  const savedUsername = localStorage.getItem("username");

  if (savedToken && savedUsername) {
    authToken = savedToken;
    currentUsername = savedUsername;
    // Session recovered from localStorage - need to restore private keys with password
    showSessionRecoveryPrompt();
  } else {
    showAuthScreen();
    attachAuthListeners();
  }
}

function showSessionRecoveryPrompt() {
  // Hide dashboard elements but keep auth screen visible
  const authScreen = document.getElementById("authScreen");
  const dashboard = document.getElementById("dashboard");
  
  authScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");

  // Create a temporary overlay for password prompt
  let overlay = document.getElementById("sessionRecoveryOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sessionRecoveryOverlay";
    overlay.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 8px; text-align: center; max-width: 400px;">
      <h2>Session Recovered</h2>
      <p>Enter your password to restore your encryption keys:</p>
      <input type="password" id="sessionPassword" placeholder="Password" style="width: 100%; padding: 8px; margin: 10px 0; box-sizing: border-box;">
      <button id="restoreSessionBtn" style="width: 100%; padding: 10px; margin-top: 10px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px;">Restore Session</button>
      <button id="logoutSessionBtn" style="width: 100%; padding: 10px; margin-top: 10px; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 4px;">Logout</button>
    </div>
  `;

  document.getElementById("restoreSessionBtn").addEventListener("click", async () => {
    const password = document.getElementById("sessionPassword").value.trim();
    if (!password) {
      alert("Please enter your password");
      return;
    }
    await restoreSessionWithPassword(password, overlay);
  });

  document.getElementById("logoutSessionBtn").addEventListener("click", () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    authToken = null;
    currentUsername = null;
    userPrivateKey = null;
    userSigningPrivateKey = null;
    overlay.remove();
    authListenersAttached = false; // Reset flag to allow re-attaching listeners
    initializeApp();
  });
}

async function restoreSessionWithPassword(password, overlay) {
  try {
    // Load and decrypt private keys with password
    const encryptedPrivateKeyData = await IndexedDBModule.loadPrivateKey(currentUsername);
    const encryptedSigningPrivateKeyData = await IndexedDBModule.loadSigningPrivateKey(currentUsername);

    if (!encryptedPrivateKeyData) {
      alert("Private keys not found. Please log in again.");
      localStorage.removeItem("authToken");
      localStorage.removeItem("username");
      authToken = null;
      currentUsername = null;
      if (overlay) overlay.remove();
      authListenersAttached = false;
      location.reload();
      return;
    }

    // Decrypt private keys with password
    const keyData = typeof encryptedPrivateKeyData === 'string' 
      ? JSON.parse(encryptedPrivateKeyData) 
      : encryptedPrivateKeyData;
    
    const decryptedPrivateKeyBase64 = await IndexedDBModule.decryptPrivateKeyWithPassword(keyData, password);
    userPrivateKey = await CryptoModule.importPrivateKey(decryptedPrivateKeyBase64);

    if (encryptedSigningPrivateKeyData) {
      const signingKeyData = typeof encryptedSigningPrivateKeyData === 'string'
        ? JSON.parse(encryptedSigningPrivateKeyData)
        : encryptedSigningPrivateKeyData;
      
      const decryptedSigningPrivateKeyBase64 = await IndexedDBModule.decryptPrivateKeyWithPassword(signingKeyData, password);
      userSigningPrivateKey = await CryptoModule.importPrivateKey(decryptedSigningPrivateKeyBase64, 'sign');
    }

    // Session restored successfully - remove overlay and show dashboard
    if (overlay) overlay.remove();
    showDashboard();
    loadDashboardData();
    attachEventListeners();
  } catch (error) {
    console.error("Failed to restore session:", error);
    alert("Incorrect password or failed to restore session");
  }
}

/* ========== AUTH SCREEN ========== */
function attachAuthListeners() {
  if (authListenersAttached) {
    return;
  }

  const loginTabBtn = document.getElementById("loginTabBtn");
  const registerTabBtn = document.getElementById("registerTabBtn");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  loginTabBtn.addEventListener("click", () => {
    registerTabBtn.classList.remove("active");
    loginTabBtn.classList.add("active");
    registerForm.classList.remove("active");
    loginForm.classList.add("active");
    clearAuthStatus();
  });

  registerTabBtn.addEventListener("click", () => {
    loginTabBtn.classList.remove("active");
    registerTabBtn.classList.add("active");
    loginForm.classList.remove("active");
    registerForm.classList.add("active");
    clearAuthStatus();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isLoggingIn) {
      return;
    }

    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!username || !password) {
      setAuthStatus("Please fill all fields", "error");
      return;
    }

    setAuthStatus("Authenticating...", "info");
    await handleLogin(username, password);
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isRegistering) {
      return;
    }

    const username = document.getElementById("registerUsername").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    const confirmPassword = document.getElementById("registerConfirmPassword").value.trim();

    if (!username || !password) {
      setAuthStatus("Please fill all fields", "error");
      return;
    }

    if (password !== confirmPassword) {
      setAuthStatus("Passwords do not match", "error");
      return;
    }

    if (password.length < 6) {
      setAuthStatus("Password must be at least 6 characters", "error");
      return;
    }

    await handleRegister(username, password);
  });

  authListenersAttached = true;
}

async function handleLogin(username, password) {
  const loginBtn = document.getElementById("loginBtn");
  if (isLoggingIn) {
    return;
  }
  isLoggingIn = true;
  loginBtn.disabled = true;

  try {
    // ========== STEP 1: AUTHENTICATE WITH SERVER ==========
    console.log("[LOGIN] Step 1: Authenticating with server...");
    let loginPublicKeyBase64 = null;
    let loginSignaturePublicKeyBase64 = null;

    // NOTE: We cannot derive public keys from encrypted keys before login
    // because they're encrypted with the password which we're about to verify.
    // The server will handle key validation based on what we send after decryption.

    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        public_key: loginPublicKeyBase64,
        signature_public_key: loginSignaturePublicKeyBase64
      })
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      console.error("[LOGIN] Server authentication failed:", error);
      setAuthStatus(`Login failed: ${error.message}`, "error");
      return;
    }

    const data = await response.json().catch((error) => {
      console.error("[LOGIN] Failed to parse login response JSON:", error);
      throw new Error("Invalid server response during login");
    });
    
    console.log("[LOGIN] Full server response:", data);
    console.log("[LOGIN] data.username =", data.username, "typeof:", typeof data.username);
    
    authToken = data.token;
    if (!authToken) {
      console.error("[LOGIN] Login response missing token:", data);
      setAuthStatus("Login failed: invalid server response", "error");
      return;
    }

    // Use the server's canonical username (handles case-insensitive lookups)
    currentUsername = data.username || username;
    console.log("[LOGIN] Using canonical username from server:", currentUsername, "typeof:", typeof currentUsername);
    
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("username", currentUsername);
    console.log("[LOGIN] Step 1 OK: Server authenticated, token received");
    setAuthStatus("Login successful, loading keys...", "info");

    // ========== STEP 2: LOAD ENCRYPTED PRIVATE KEYS FROM INDEXEDDB ==========
    console.log("[LOGIN] Step 2: Loading encrypted private keys from IndexedDB...");
    // Load encrypted private key from IndexedDB and decrypt with password
    // The private key is kept in memory for this session for crypto operations
    try {
      console.log("[LOGIN] Step 2a: Loading encryption private key for username:", currentUsername);
      const encryptedPrivateKeyData = await IndexedDBModule.loadPrivateKey(currentUsername);
      console.log("[LOGIN] Step 2b: Loading signing private key for username:", currentUsername);
      const encryptedSigningPrivateKeyData = await IndexedDBModule.loadSigningPrivateKey(currentUsername);

      console.log("[LOGIN] Step 2c: Load results:", {
        hasEncryptionKey: !!encryptedPrivateKeyData,
        hasSigningKey: !!encryptedSigningPrivateKeyData
      });

      // ========== STEP 3: DECRYPT PRIVATE KEYS ==========
      if (encryptedPrivateKeyData) {
        try {
          console.log("[LOGIN] Step 3: Decrypting encryption private key...");
          // Parse encrypted key data and decrypt with password
          const keyData = typeof encryptedPrivateKeyData === 'string' 
            ? JSON.parse(encryptedPrivateKeyData) 
            : encryptedPrivateKeyData;
          
          console.log("[LOGIN] Step 3a: Parsed encryption key structure:", {
            hasEncryptedData: !!keyData.encryptedData,
            hasSalt: !!keyData.salt,
            hasIv: !!keyData.iv
          });
          
          const decryptedPrivateKeyBase64 = await IndexedDBModule.decryptPrivateKeyWithPassword(keyData, password);
          console.log("[LOGIN] Step 3b: Decryption successful, importing CryptoKey...");
          
          // ========== STEP 4: IMPORT PRIVATE KEYS AS CRYPTOKEYS ==========
          // Import the decrypted private key
          userPrivateKey = await CryptoModule.importPrivateKey(decryptedPrivateKeyBase64);
          console.log("[LOGIN] Step 3c: Successfully imported encryption private key (CryptoKey)");
        } catch (decryptError) {
          console.error("[LOGIN] FAILED to decrypt/import encryption private key:", decryptError);
          setAuthStatus("Incorrect password or corrupted key data", "error");
          localStorage.removeItem("authToken");
          localStorage.removeItem("username");
          showAuthScreen();
          attachAuthListeners();
          return;
        }
      } else {
        console.error("[LOGIN] CRITICAL: No encryption private key found in IndexedDB for username:", username);
        console.error("[LOGIN] This user has not registered yet, or registration failed to save keys.");
        setAuthStatus("Private key not found. Please register first.", "error");
        localStorage.removeItem("authToken");
        localStorage.removeItem("username");
        showAuthScreen();
        attachAuthListeners();
        return;
      }

      if (encryptedSigningPrivateKeyData) {
        try {
          console.log("[LOGIN] Step 3d: Decrypting signing private key...");
          // Parse encrypted key data and decrypt with password
          const signingKeyData = typeof encryptedSigningPrivateKeyData === 'string'
            ? JSON.parse(encryptedSigningPrivateKeyData)
            : encryptedSigningPrivateKeyData;
          
          const decryptedSigningPrivateKeyBase64 = await IndexedDBModule.decryptPrivateKeyWithPassword(signingKeyData, password);
          console.log("[LOGIN] Step 3e: Signing key decryption successful, importing...");
          
          // Import the decrypted signing private key
          userSigningPrivateKey = await CryptoModule.importPrivateKey(decryptedSigningPrivateKeyBase64, 'sign');
          console.log("[LOGIN] Step 3f: Successfully imported signing private key (CryptoKey)");
        } catch (decryptError) {
          console.warn("[LOGIN] Non-fatal: Failed to decrypt signing private key:", decryptError);
          // Non-fatal - continue without signing key
        }
      }
    } catch (dbError) {
      console.error("[LOGIN] CRITICAL DB ERROR during key loading:", dbError);
      console.error("[LOGIN] Stack trace:", dbError.stack);
      setAuthStatus("Failed to load encryption keys: " + dbError.message, "error");
      localStorage.removeItem("authToken");
      localStorage.removeItem("username");
      showAuthScreen();
      attachAuthListeners();
      return;
    }

    // ========== STEP 5: LOAD PUBLIC KEYS FROM SERVER ==========
    console.log("[LOGIN] Step 4: Loading public keys from server...");
    try {
      const publicKeyResponse = await fetch(
        `${API_BASE_URL}/public_key?username=${encodeURIComponent(currentUsername)}&token=${authToken}`
      );
      if (publicKeyResponse.ok) {
        const publicKeyData = await publicKeyResponse.json();
        if (publicKeyData.public_key) {
          userPublicKey = await CryptoModule.importPublicKey(publicKeyData.public_key);
          console.log("[LOGIN] Step 4a: Successfully loaded and imported encryption public key");
        }
      }
    } catch (publicKeyError) {
      console.warn("[LOGIN] Non-fatal: Could not load public key after login:", publicKeyError);
    }

    try {
      const signaturePublicKeyResponse = await fetch(
        `${API_BASE_URL}/public_key?username=${encodeURIComponent(currentUsername)}&type=signature&token=${authToken}`
      );
      if (signaturePublicKeyResponse.ok) {
        const signatureKeyData = await signaturePublicKeyResponse.json();
        if (signatureKeyData.public_key) {
          userSigningPublicKey = await CryptoModule.importPublicKey(signatureKeyData.public_key, 'signature');
          console.log("[LOGIN] Step 4b: Successfully loaded and imported signing public key");
        }
      }
    } catch (signatureError) {
      console.warn("[LOGIN] Non-fatal: Could not load signature public key after login:", signatureError);
    }

    if (!userPublicKey && loginPublicKeyBase64) {
      try {
        userPublicKey = await CryptoModule.importPublicKey(loginPublicKeyBase64);
      } catch (fallbackError) {
        console.warn("[LOGIN] Failed to import derived public key after login:", fallbackError);
      }
    }

    if (!userSigningPublicKey && loginSignaturePublicKeyBase64) {
      try {
        userSigningPublicKey = await CryptoModule.importPublicKey(loginSignaturePublicKeyBase64, 'signature');
      } catch (fallbackError) {
        console.warn("[LOGIN] Failed to import derived signing public key after login:", fallbackError);
      }
    }

    console.log("[LOGIN] Step 5: Login flow complete!");
    console.log("[LOGIN] Keys loaded:", {
      hasPrivateKey: !!userPrivateKey,
      hasPublicKey: !!userPublicKey,
      hasSigningPrivateKey: !!userSigningPrivateKey,
      hasSigningPublicKey: !!userSigningPublicKey
    });
    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";

    showDashboard();
    setAuthStatus("Login successful. Loading dashboard...", "info");
    await loadDashboardData();
    attachEventListeners();

  } catch (error) {
    console.error("Login error:", error);
    setAuthStatus("Login error: " + error.message, "error");
  } finally {
    isLoggingIn = false;
    loginBtn.disabled = false;
  }
}

async function handleRegister(username, password) {
  const registerBtn = document.getElementById("registerBtn");
  if (isRegistering) {
    return;
  }
  isRegistering = true;
  registerBtn.disabled = true;
  setAuthStatus("Generating encryption keys and preparing registration...", "info");

  if (!dbReady) {
    setAuthStatus("Database not ready. Please refresh the page and try again.", "error");
    isRegistering = false;
    registerBtn.disabled = false;
    return;
  }

  try {
    // ========== INPUT VALIDATION ==========
    console.log("[REGISTER] Step 1: Validating input...");
    const usernameValidation = SanitizeModule.validateUsername(username);
    if (!usernameValidation.isValid) {
      setAuthStatus("Username error: " + usernameValidation.error, "error");
      return;
    }

    const passwordValidation = SanitizeModule.validatePassword(password);
    if (!passwordValidation.isValid) {
      setAuthStatus("Password error: " + passwordValidation.error, "error");
      return;
    }
    console.log("[REGISTER] Step 1 OK: Input validated");

    // ========== CLEAN UP OLD KEYS (if corrupted) ==========
    console.log("[REGISTER] Step 2: Checking for old keys...");
    try {
      console.log("[REGISTER] Deleting any old/corrupted keys for user:", username);
      await IndexedDBModule.deleteUserKeys(username);
      console.log("[REGISTER] Old keys cleaned up");
    } catch (cleanupError) {
      console.warn("[REGISTER] Could not clean old keys (this is OK if user is new):", cleanupError);
    }

    // ========== KEY GENERATION ==========
    console.log("[REGISTER] Step 3: Generating new key pairs...");
    setAuthStatus("Generating encryption keys. This may take a few seconds.", "info");

    const keyPair = await CryptoModule.generateKeyPair();
    userPublicKey = keyPair.publicKey;
    const privateKey = keyPair.privateKey;
    console.log("[REGISTER] Step 3b: RSA-OAEP key pair generated");

    console.log("[REGISTER] Step 3c: Generating RSA-PSS signing key pair...");
    const signatureKeyPair = await CryptoModule.generateSignatureKeyPair();
    userSigningPublicKey = signatureKeyPair.publicKey;
    userSigningPrivateKey = signatureKeyPair.privateKey;
    console.log("[REGISTER] Step 3d: RSA-PSS key pair generated");

    // ========== EXPORT KEYS ==========
    console.log("[REGISTER] Step 4: Exporting keys for storage...");
    const publicKeyBase64 = await CryptoModule.exportPublicKey(keyPair.publicKey);
    const signaturePublicKeyBase64 = await CryptoModule.exportPublicKey(signatureKeyPair.publicKey);
    const privateKeyBase64 = await CryptoModule.exportPrivateKey(keyPair.privateKey);
    const signingPrivateKeyBase64 = await CryptoModule.exportPrivateKey(signatureKeyPair.privateKey);
    console.log("[REGISTER] Step 4: Keys exported successfully");

    // ========== SEND REGISTRATION TO SERVER ==========
    console.log("[REGISTER] Step 5: Sending registration to server...");
    setAuthStatus("Submitting registration to server...", "info");

    const response = await retryWithBackoff(async (attempt, totalAttempts) => {
      if (attempt > 1) {
        setAuthStatus(`Retrying registration (${attempt}/${totalAttempts})...`, "info");
      }

      const retryResponse = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: username, 
          password: password,
          public_key: publicKeyBase64,
          signature_public_key: signaturePublicKeyBase64
        })
      });

      if (!retryResponse.ok) {
        if (retryResponse.status >= 500) {
          const error = await parseErrorResponse(retryResponse);
          throw new Error(error.message || `Server error ${retryResponse.status}`);
        }
        return retryResponse;
      }
      return retryResponse;
    }, 3, 750);

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      console.error("[REGISTER] Server rejected registration:", error);
      setAuthStatus(`Registration failed: ${error.message}`, "error");
      return;
    }
    console.log("[REGISTER] Step 5 OK: Server accepted registration");

    // ========== ENCRYPT AND STORE PRIVATE KEYS ==========
    console.log("[REGISTER] Step 6: Encrypting and storing private keys...");
    setAuthStatus("Encrypting and storing private keys locally...", "info");
    try {
      console.log("[REGISTER] Step 6a: Encrypting encryption private key with password...");
      const encryptedKeyData = await IndexedDBModule.encryptPrivateKeyWithPassword(
        privateKeyBase64,
        password,
        username
      );
      console.log("[REGISTER] Step 6b: Encryption private key encrypted, data structure:", {
        hasEncryptedData: !!encryptedKeyData.encryptedData,
        hasSalt: !!encryptedKeyData.salt,
        hasIv: !!encryptedKeyData.iv,
        encryptedDataLength: encryptedKeyData.encryptedData.length
      });

      console.log("[REGISTER] Step 6c: Encrypting signing private key with password...");
      const encryptedSigningKeyData = await IndexedDBModule.encryptPrivateKeyWithPassword(
        signingPrivateKeyBase64,
        password,
        username
      );
      console.log("[REGISTER] Step 6d: Signing private key encrypted");

      console.log("[REGISTER] Step 6e: Saving encrypted keys to IndexedDB...");
      await IndexedDBModule.savePrivateKey(
        username,
        encryptedKeyData,
        encryptedSigningKeyData,
        {
          created_at: new Date().toISOString(),
          key_version: 1
        }
      );
      console.log("[REGISTER] Step 6f: Keys saved to IndexedDB");

      console.log("[REGISTER] Step 6g: Verifying saved keys...");
      const verifyKey = await IndexedDBModule.loadPrivateKey(username);
      console.log("[REGISTER] Step 6h: Verification result - Key loaded:", !!verifyKey);
      
      if (!verifyKey) {
        console.error("[REGISTER] CRITICAL: Private key was NOT saved!");
        setAuthStatus("ERROR: Private key was NOT saved. Please try again.", "error");
        return;
      }
      console.log("[REGISTER] Step 6i: Verification PASSED - Keys persisted successfully");
    } catch (keyStorageError) {
      console.error('[REGISTER] CRITICAL ERROR during key storage:', keyStorageError);
      console.error('[REGISTER] Stack trace:', keyStorageError.stack);
      setAuthStatus('Failed to store encryption keys securely', "error");
      return;
    }

    console.log("[REGISTER] Registration COMPLETE!");
    setAuthStatus("Registration successful! Please log in.", "success");
    document.getElementById("registerUsername").value = "";
    document.getElementById("registerPassword").value = "";
    document.getElementById("registerConfirmPassword").value = "";

    userPublicKey = null;

    document.getElementById("loginTabBtn").click();

  } catch (error) {
    console.error("[REGISTER] CRITICAL EXCEPTION:", error);
    console.error("[REGISTER] Stack trace:", error.stack);
    setAuthStatus("Registration error: " + error.message, "error");
  } finally {
    isRegistering = false;
    registerBtn.disabled = false;
  }
}

async function fetchUserPublicKey(username, keyType = 'encrypt') {
  try {
    const typeParam = keyType === 'signature' ? 'signature' : 'encryption';
    const response = await fetch(
      `${API_BASE_URL}/public_key?username=${encodeURIComponent(username)}&type=${typeParam}&token=${authToken}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch public key: ${response.status}`);
    }
    const data = await response.json();
    return await CryptoModule.importPublicKey(data.public_key, keyType === 'signature' ? 'signature' : 'encrypt');
  } catch (error) {
    console.warn("Failed to fetch public key for", username, error);
    return null;
  }
}

async function fetchEncryptedGroupKeyFromServer(groupName, groupId) {
  try {
    // Use groupId if available, otherwise fall back to old endpoint
    const endpoint = groupId 
      ? `${API_BASE_URL}/group_key_load?group_id=${encodeURIComponent(groupId)}&token=${authToken}`
      : `${API_BASE_URL}/group_key?group=${encodeURIComponent(groupName)}&token=${authToken}`;
    
    const response = await fetch(endpoint);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.encrypted_group_key || null;
  } catch (error) {
    console.error("Failed to fetch encrypted group key from server:", error);
    return null;
  }
}

async function loadGroupKeyForChat(groupName, groupId) {
  const resolvedGroupId = groupId || groupIdByName[groupName];

  // Try raw AES key first
  if (resolvedGroupId) {
    const rawKeyBase64 = await IndexedDBModule.loadGroupKey(resolvedGroupId);
    if (rawKeyBase64) {
      return await CryptoModule.importGroupKey(rawKeyBase64);
    }
  }

  // Fallback: fetch encrypted group key from server and decrypt with private key
  const encryptedKeyBase64 = await fetchEncryptedGroupKeyFromServer(groupName, resolvedGroupId);
  if (!encryptedKeyBase64) {
    return null;
  }

  if (!userPrivateKey) {
    console.error("Private key not loaded. Please log in again.");
    return null;
  }

  try {
    const decryptedGroupKey = await CryptoModule.decryptGroupKey(encryptedKeyBase64, userPrivateKey);
    if (resolvedGroupId) {
      const rawKeyBase64 = await CryptoModule.exportGroupKey(decryptedGroupKey);
      await IndexedDBModule.saveGroupKey(resolvedGroupId, rawKeyBase64);
    }
    return decryptedGroupKey;
  } catch (decryptError) {
    console.error("Failed to decrypt group key from server:", decryptError);
    return null;
  }
}

/* ========== UI STATE MANAGEMENT ========== */
function showAuthScreen() {
  document.getElementById("authScreen").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
  clearAuthStatus();
}

function showDashboard() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("currentUsername").textContent = `Logged in as: ${currentUsername}`;
}

function showControlPanel() {
  // Stop message polling when leaving chat view
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval);
    messagePollingInterval = null;
  }

  document.getElementById("controlPanel").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  document.getElementById("chatView").classList.remove("active");
  document.getElementById("chatHeader").classList.remove("active");
  currentChatName = null;
}

function showChatView() {
  document.getElementById("controlPanel").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  document.getElementById("chatView").classList.add("active");
  document.getElementById("chatHeader").classList.add("active");
}

/* ========== LOAD DASHBOARD DATA ========== */
async function loadDashboardData() {
  let dashboardDataLoaded = false;

  try {
    const requestsResponse = await fetch(
      `${API_BASE_URL}/friend_requests?token=${authToken}`
    );

    if (requestsResponse.ok) {
      const requestsData = await requestsResponse.json();
      appState.friends = requestsData.friends || [];
      appState.incomingRequests = requestsData.incoming_requests || [];
      appState.outgoingRequests = requestsData.outgoing_requests || [];
    }

    const groupsResponse = await fetch(
      `${API_BASE_URL}/rooms?token=${authToken}`
    );

    if (groupsResponse.ok) {
      const groupsData = await groupsResponse.json();
      appState.groups = groupsData.groups || [];
      groupIdByName = appState.groups.reduce((map, group) => {
        if (group && group.group_name && group.group_id) {
          map[group.group_name] = group.group_id;
        }
        return map;
      }, {});
    }

    dashboardDataLoaded = true;
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    setAuthStatus("Logged in, but dashboard data could not be loaded.", "error");
  } finally {
    renderDashboard();
    showControlPanel();
    if (dashboardDataLoaded) {
      setAuthStatus("Dashboard loaded successfully.", "success");
    }
  }
}

function renderDashboard() {
  renderFriendsList();
  renderRequestsList();
  renderGroupsList();
}

function renderFriendsList() {
  const friendsList = document.getElementById("friendsList");
  friendsList.innerHTML = "";

  if (appState.friends.length === 0) {
    friendsList.innerHTML = '<p class="empty-state">No friends</p>';
    return;
  }

  for (let friend of appState.friends) {
    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `<span class="friend-name">${friend}</span>`;
    friendsList.appendChild(friendItem);
  }
}

function renderRequestsList() {
  const requestsList = document.getElementById("requestsList");
  const requestCount = document.getElementById("requestCount");
  requestsList.innerHTML = "";

  const totalRequests = appState.incomingRequests.length + appState.outgoingRequests.length;
  
  if (totalRequests > 0) {
    requestCount.textContent = totalRequests;
    requestCount.style.display = "inline-block";
  } else {
    requestCount.style.display = "none";
  }

  if (appState.incomingRequests.length === 0 && appState.outgoingRequests.length === 0) {
    requestsList.innerHTML = '<p class="empty-state">No requests</p>';
    return;
  }

  for (let requester of appState.incomingRequests) {
    const requestItem = document.createElement("div");
    requestItem.className = "request-item";
    requestItem.innerHTML = `
      <div class="request-info">
        <span class="request-from">${requester} (incoming)</span>
      </div>
      <div class="request-actions">
        <button class="btn btn-small btn-primary" data-action="accept" data-user="${requester}">Accept</button>
        <button class="btn btn-small btn-secondary" data-action="reject" data-user="${requester}">Reject</button>
      </div>
    `;
    requestsList.appendChild(requestItem);
  }

  for (let target of appState.outgoingRequests) {
    const requestItem = document.createElement("div");
    requestItem.className = "request-item";
    requestItem.innerHTML = `
      <div class="request-info">
        <span class="request-to">${target} (outgoing)</span>
      </div>
    `;
    requestsList.appendChild(requestItem);
  }

  requestsList.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const action = e.target.getAttribute("data-action");
      const user = e.target.getAttribute("data-user");
      await handleRequestAction(action, user);
    });
  });
}

function renderGroupsList() {
  const chatList = document.getElementById("chatList");
  chatList.innerHTML = "";

  if (appState.groups.length === 0) {
    chatList.innerHTML = '<p class="empty-state">No groups</p>';
    return;
  }

  for (let group of appState.groups) {
    const chatItem = document.createElement("div");
    chatItem.className = "chat-item";
    const groupName = group.group_name || group;
    const groupId = group.group_id || "";
    chatItem.setAttribute("data-chat", groupName);
    chatItem.setAttribute("data-group-id", groupId);
    chatItem.textContent = groupName;
    chatList.appendChild(chatItem);
  }
}

/* ========== FRIEND REQUEST HANDLING ========== */
async function handleRequestAction(action, requester) {
  try {
    const endpoint = action === "accept" ? "/friend_request_accept" : "/friend_request_reject";
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        requester: requester
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    alert(`Request ${action}ed`);
    loadDashboardData();

  } catch (error) {
    console.error("Error handling request:", error);
    alert("Error processing request");
  }
}

/* ========== EVENT LISTENERS ========== */
function attachEventListeners() {
  if (eventListenersAttached) {
    return;
  }

  attachLogoutListener();
  attachAddFriendListeners();
  attachCreateGroupListeners();
  attachChatListeners();
  attachMessageListeners();
  attachLeaveGroupListener();
  attachDeleteGroupListener();
  attachBackButtonListener();
  eventListenersAttached = true;
}

function setAuthStatus(message, type = "info") {
  const statusEl = document.getElementById("authStatus");
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message || "";
  statusEl.className = `auth-status ${message ? type : "hidden"}`;
  if (!message) {
    statusEl.classList.add("hidden");
  }
}

function clearAuthStatus() {
  setAuthStatus("");
}

async function retryWithBackoff(operation, attempts = 3, initialDelayMs = 500) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt, attempts);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      setAuthStatus(`Registration attempt ${attempt} failed, retrying in ${Math.round(delayMs / 1000)}s...`, "info");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function parseErrorResponse(response) {
  if (!response || typeof response.clone !== "function") {
    return { message: `HTTP ${response.status}` };
  }

  const clone = response.clone();
  try {
    return await clone.json();
  } catch (err) {
    try {
      const text = await clone.text();
      return { message: text || `HTTP ${response.status}` };
    } catch (_innerErr) {
      return { message: `HTTP ${response.status}` };
    }
  }
}

function attachLogoutListener() {
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", async () => {
    console.log("[LOGOUT] Starting logout sequence for:", currentUsername);
    
    // Stop any active message polling
    if (messagePollingInterval) {
      clearInterval(messagePollingInterval);
      messagePollingInterval = null;
    }
    
    // ========== STEP 1: CLEAR IN-MEMORY KEYS ==========
    // CRITICAL: Clear only RAM references, NOT persistent IndexedDB storage
    console.log("[LOGOUT] Step 1: Clearing in-memory keys from RAM...");
    userPrivateKey = null;  // Clear decrypted private key (RAM only)
    userPublicKey = null;   // Clear public key reference (RAM only)
    userSigningPrivateKey = null;  // Clear signing private key (RAM only)
    userSigningPublicKey = null;   // Clear signing public key (RAM only)
    currentChatId = null;   // Clear current chat session
    groupKeys = {};         // Clear cached group keys (RAM only)
    console.log("[LOGOUT] Step 1 OK: In-memory keys cleared");
    
    // ========== STEP 2: CLEAR SESSION CACHE (but keep persistent encrypted keys) ==========
    console.log("[LOGOUT] Step 2: Clearing session cache from IndexedDB...");
    // Clear IndexedDB session data
    // IMPORTANT: This only clears temporary session cache, NOT the persistent encrypted private key!
    try {
      const username = currentUsername;
      await IndexedDBModule.clearSensitiveData(username);
      console.log("[LOGOUT] Step 2 OK: Session cache cleared (encrypted keys PRESERVED)");
    } catch (error) {
      console.error("[LOGOUT] Error clearing session cache:", error);
      // Non-fatal - continue with logout
    }
    
    // ========== STEP 3: CLEAR SESSION STORAGE ==========
    console.log("[LOGOUT] Step 3: Clearing session tokens...");
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    authToken = null;
    currentUsername = null;
    currentChatName = null;
    console.log("[LOGOUT] Step 3 OK: Session tokens cleared");
    
    console.log("[LOGOUT] Logout COMPLETE - User can log in again without re-registering");
    showAuthScreen();
    attachAuthListeners();
  });
}

function attachAddFriendListeners() {
  const addFriendBtn = document.getElementById("addFriendBtn");
  const addFriendForm = document.getElementById("addFriendForm");
  const cancelAddFriendBtn = document.getElementById("cancelAddFriendBtn");
  const confirmAddFriendBtn = document.getElementById("confirmAddFriendBtn");

  addFriendBtn.addEventListener("click", () => {
    addFriendForm.classList.toggle("hidden");
  });

  cancelAddFriendBtn.addEventListener("click", () => {
    addFriendForm.classList.add("hidden");
    document.getElementById("friendUsername").value = "";
  });

  confirmAddFriendBtn.addEventListener("click", async () => {
    const friendUsername = document.getElementById("friendUsername").value.trim();

    if (!friendUsername) {
      alert("Please enter a username");
      return;
    }

    await sendFriendRequest(friendUsername);
  });
}

async function sendFriendRequest(targetUsername) {
  try {
    const response = await fetch(`${API_BASE_URL}/friend_request_send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        target_username: targetUsername
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    alert("Friend request sent!");
    document.getElementById("friendUsername").value = "";
    document.getElementById("addFriendForm").classList.add("hidden");
    loadDashboardData();

  } catch (error) {
    console.error("Error sending friend request:", error);
    alert("Error sending request");
  }
}

function attachCreateGroupListeners() {
  const createGroupBtn = document.getElementById("createGroupBtn");
  const createGroupForm = document.getElementById("createGroupForm");
  const cancelCreateGroupBtn = document.getElementById("cancelCreateGroupBtn");
  const confirmCreateGroupBtn = document.getElementById("confirmCreateGroupBtn");

  createGroupBtn.addEventListener("click", () => {
    populateFriendCheckboxes();
    createGroupForm.classList.toggle("hidden");
  });

  cancelCreateGroupBtn.addEventListener("click", () => {
    createGroupForm.classList.add("hidden");
    document.getElementById("groupName").value = "";
  });

  confirmCreateGroupBtn.addEventListener("click", async () => {
    const groupName = document.getElementById("groupName").value.trim();
    const checkboxes = document.querySelectorAll("#groupMembers input[type='checkbox']:checked");
    const members = Array.from(checkboxes).map(cb => cb.value);

    if (!groupName) {
      alert("Please enter a group name");
      return;
    }

    await createGroup(groupName, members);
  });
}

function populateFriendCheckboxes() {
  const groupMembers = document.getElementById("groupMembers");
  groupMembers.innerHTML = "";

  if (appState.friends.length === 0) {
    groupMembers.innerHTML = '<p class="empty-state">No friends to add</p>';
    return;
  }

  for (let friend of appState.friends) {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `
      <input type="checkbox" value="${friend}" />
      <span>${friend}</span>
    `;
    groupMembers.appendChild(label);
  }
}

async function createGroup(groupName, members) {
  try {
    const groupValidation = SanitizeModule.validateGroupName(groupName);
    if (!groupValidation.isValid) {
      alert("Group name error: " + groupValidation.error);
      return;
    }

    // Generate AES-GCM key for this group
    const groupKey = await CryptoModule.generateGroupKey();

    // Ensure we have the current user's public key to encrypt the group key for ourselves
    if (!userPublicKey) {
      userPublicKey = await fetchUserPublicKey(currentUsername);
      if (!userPublicKey) {
        alert("Unable to load your public key for group encryption.");
        return;
      }
    }

    const encryptedGroupKeys = [];
    const selfEncryptedKey = await CryptoModule.encryptGroupKeyForUser(groupKey, userPublicKey);
    encryptedGroupKeys.push({
      username: currentUsername,
      encrypted_group_key: selfEncryptedKey
    });

    for (let memberUsername of members) {
      try {
        if (!memberUsername || memberUsername.toLowerCase() === currentUsername.toLowerCase()) {
          continue;
        }

        const memberPublicKey = await fetchUserPublicKey(memberUsername);
        if (!memberPublicKey) {
          alert(`Could not load public key for ${memberUsername}. Group creation aborted.`);
          return;
        }

        const encryptedKey = await CryptoModule.encryptGroupKeyForUser(groupKey, memberPublicKey);
        encryptedGroupKeys.push({
          username: memberUsername,
          encrypted_group_key: encryptedKey
        });
      } catch (error) {
        console.error("Failed to encrypt key for member:", memberUsername, error);
        alert(`Failed to encrypt group key for ${memberUsername}. Group creation aborted.`);
        return;
      }
    }

    // Keep raw group key in memory until the group exists on the server
    const groupKeyBase64 = await CryptoModule.exportGroupKey(groupKey);
    groupKeys[groupName] = groupKey;

    // Send group creation request with encrypted group key for creator
    // The server will store encrypted group keys for all members
    const response = await fetch(`${API_BASE_URL}/group_create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        group_name: groupName,
        encrypted_group_key: selfEncryptedKey
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    const responseData = await response.json();
    const groupId = responseData.group_id;
    
    // Save group key locally
    if (groupId) {
      await IndexedDBModule.saveGroupKey(groupId, groupKeyBase64);
      groupIdByName[groupName] = groupId;
      currentChatId = groupId;
    }

    // Add members to group (server will handle key re-encryption)
    for (let memberUsername of members) {
      try {
        if (!memberUsername || memberUsername.toLowerCase() === currentUsername.toLowerCase()) {
          continue;
        }

        const memberEncryptedKey = encryptedGroupKeys.find(k => k.username === memberUsername);
        if (!memberEncryptedKey) {
          continue;
        }

        const addMemberResponse = await fetch(`${API_BASE_URL}/group_add_member`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            temp_token: authToken,
            group_id: groupId,
            username: memberUsername,
            encrypted_group_key: memberEncryptedKey.encrypted_group_key
          })
        });

        if (!addMemberResponse.ok) {
          const error = await addMemberResponse.json();
          console.warn(`Failed to add ${memberUsername} to group: ${error.message}`);
        }
      } catch (error) {
        console.warn(`Error adding member ${memberUsername}:`, error);
      }
    }

    alert("Group created!");
    document.getElementById("groupName").value = "";
    document.getElementById("createGroupForm").classList.add("hidden");
    
    // Wait for dashboard to reload before proceeding
    await loadDashboardData();
    
    // Automatically open the newly created group
    openChat(groupName, groupId);

  } catch (error) {
    console.error("Error creating group:", error);
    alert("Error creating group: " + error.message);
  }
}


let chatListenerAttached = false;
function attachChatListeners() {
  if (chatListenerAttached) return;
  document.addEventListener("click", chatClickHandler);
  chatListenerAttached = true;
}

function chatClickHandler(e) {
  const chatItem = e.target.closest(".chat-item");
  if (chatItem) {
    const chatName = chatItem.getAttribute("data-chat");
    const groupId = chatItem.getAttribute("data-group-id");
    openChat(chatName, groupId);
  }
}

function openChat(chatName, groupId) {
  // Stop existing polling when switching chats
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval);
    messagePollingInterval = null;
  }

  // Reset message tracking for new chat
  lastMessageCount = 0;
  lastMessageId = null;

  currentChatName = chatName;
  currentChatId = groupId || groupIdByName[chatName] || null;
  document.querySelectorAll(".chat-item").forEach(item => {
    item.classList.remove("active");
  });
  const activeItem = document.querySelector(`[data-chat="${chatName}"]`);
  if (activeItem) {
    activeItem.classList.add("active");
  }

  document.getElementById("chatName").textContent = chatName;
  showChatView();
  loadMessages(chatName);

  // Start polling for new messages every 3 seconds
  messagePollingInterval = setInterval(() => {
    loadMessages(chatName);
  }, 3000);
}

async function loadMessages(chatName) {
  try {
    // Use group ID instead of group name for message retrieval
    const response = await fetch(
      `${API_BASE_URL}/messages_get?group_id=${encodeURIComponent(currentChatId)}&token=${authToken}`
    );

    if (!response.ok) {
      console.error("Failed to load messages");
      return;
    }

    const data = await response.json();
    const newMessages = data.messages || [];
    
    // Only re-render if messages changed (new message arrived)
    const newMessageCount = newMessages.length;
    const currentLastMessageId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : null;
    
    // Check if we have new messages or if existing messages changed
    if (newMessageCount !== lastMessageCount || currentLastMessageId !== lastMessageId) {
      appState.currentMessages = newMessages;
      lastMessageCount = newMessageCount;
      lastMessageId = currentLastMessageId;
      
      // renderMessages is now async due to decryption
      await renderMessages();
    }
  } catch (error) {
    console.error("Error loading messages:", error);
  }
}

async function renderMessages() {
  const messageContainer = document.getElementById("messageContainer");
  messageContainer.innerHTML = "";

  // Get group key for current chat
  let groupKey = groupKeys[currentChatName];
  if (!groupKey) {
    try {
      groupKey = await loadGroupKeyForChat(currentChatName, currentChatId);
      if (groupKey) {
        groupKeys[currentChatName] = groupKey; // Cache in memory
      }
    } catch (error) {
      console.error("Failed to load group key for decryption:", error);
      messageContainer.innerHTML = '<p style="color: red;">Error: Could not load encryption key</p>';
      return;
    }
  }

  for (let msg of appState.currentMessages) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";

    const senderName = msg.sender || msg.from || "Unknown";
    if (senderName === currentUsername) {
      messageDiv.classList.add("own");
    }

    const senderDiv = document.createElement("div");
    senderDiv.className = "message-sender";
    senderDiv.textContent = senderName;

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";

    // Decrypt message if we have ciphertext and nonce
    let displayText = "[Unable to decrypt message]";
    const ciphertextValue = msg.ciphertext || msg.encrypted_message || msg.text;
    const nonceValue = msg.nonce;
    if (ciphertextValue && nonceValue && groupKey) {
      try {
        // Decrypt the message using the group key
        const decryptedText = await CryptoModule.decryptMessage(
          ciphertextValue,
          msg.nonce,
          groupKey
        );

        displayText = decryptedText;

        if (msg.signature) {
          try {
            const senderSigningPublicKey = await fetchUserPublicKey(msg.sender, 'signature');
            if (senderSigningPublicKey) {
              const messageToVerify = `${ciphertextValue}:${msg.nonce}`;
              const validSignature = await CryptoModule.verifySignature(
                messageToVerify,
                msg.signature,
                senderSigningPublicKey
              );
              if (!validSignature) {
                displayText = `[Invalid signature] ${displayText}`;
              }
            }
          } catch (verifyError) {
            console.warn('Signature verification failed for', msg.sender, verifyError);
          }
        }
      } catch (decryptError) {
        console.error("Error decrypting message:", decryptError);
        displayText = "[Decryption failed]";
      }
    } else if (msg.text) {
      // Fallback for plaintext messages or legacy stored data
      displayText = msg.text;
    }

    // Sanitize the decrypted text before displaying
    textDiv.textContent = displayText;

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-timestamp";
    const timestamp = new Date(msg.timestamp);
    timeDiv.textContent = timestamp.toLocaleTimeString();

    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);
    messageContainer.appendChild(messageDiv);
  }

  // Use requestAnimationFrame to ensure DOM has been painted before scrolling
  requestAnimationFrame(() => {
    messageContainer.scrollTop = messageContainer.scrollHeight;
  });
}

function attachMessageListeners() {
  const messageForm = document.getElementById("messageForm");
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentChatName) {
      alert("Please select a chat first");
      return;
    }

    if (!currentChatId) {
      alert("Chat ID not found. Please refresh and select the chat again.");
      return;
    }

    const messageInput = document.getElementById("messageInput");
    const messageText = messageInput.value.trim();

    if (!messageText) {
      return;
    }

    await sendMessage(currentChatName, messageText);
    messageInput.value = "";
  });
}

async function sendMessage(chatName, messageText) {
  try {
    // Validate input
    const messageValidation = SanitizeModule.validateMessage(messageText);
    if (!messageValidation.isValid) {
      alert("Message error: " + messageValidation.error);
      return;
    }

    // Get or load group key for this group
    let groupKey = groupKeys[chatName];
    if (!groupKey) {
      try {
        groupKey = await loadGroupKeyForChat(chatName, currentChatId);
        if (groupKey) {
          groupKeys[chatName] = groupKey; // Cache in memory
        } else {
          alert("Error: Group key not found. Unable to send message.");
          return;
        }
      } catch (error) {
        console.error("Failed to load group key:", error);
        alert("Error: Could not load encryption key for this group");
        return;
      }
    }

    // Encrypt message with group key
    const { ciphertext, nonce } = await CryptoModule.encryptMessage(messageText, groupKey);

    // Sign the message ciphertext and nonce so recipients can verify sender authenticity
    let signature = null;
    if (userSigningPrivateKey) {
      const messageToSign = `${ciphertext}:${nonce}`;
      signature = await CryptoModule.signMessage(messageToSign, userSigningPrivateKey);
    }

    // Send encrypted message to server
    const response = await fetch(`${API_BASE_URL}/message_send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        group_id: currentChatId,
        encrypted_message: ciphertext,  // Encrypted message
        nonce: nonce,
        signature: signature
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    // Message sent successfully, refresh message list
    await loadMessages(chatName);

  } catch (error) {
    console.error("Error sending message:", error);
    alert("Error sending message: " + error.message);
  }
}

function attachLeaveGroupListener() {
  const leaveGroupBtn = document.getElementById("leaveGroupBtn");
  leaveGroupBtn.addEventListener("click", async () => {
    if (!currentChatName) {
      alert("No group selected");
      return;
    }

    const confirmed = confirm(`Are you sure you want to leave ${currentChatName}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/group_leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temp_token: authToken,
          group_id: currentChatId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.message}`);
        return;
      }

      alert("Left group successfully");
      showControlPanel();
      loadDashboardData();

    } catch (error) {
      console.error("Error leaving group:", error);
      alert("Error leaving group");
    }
  });
}

function attachDeleteGroupListener() {
  const deleteChatBtn = document.getElementById("deleteChatBtn");
  deleteChatBtn.addEventListener("click", async () => {
    if (!currentChatName) {
      alert("No group selected");
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete ${currentChatName}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/group_delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temp_token: authToken,
          group: currentChatName
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.message}`);
        return;
      }

      alert("Group deleted successfully");
      showControlPanel();
      loadDashboardData();

    } catch (error) {
      console.error("Error deleting group:", error);
      alert("Error deleting group");
    }
  });
}

function attachBackButtonListener() {
  const backBtn = document.getElementById("backBtn");
  backBtn.addEventListener("click", () => {
    showControlPanel();
  });
}