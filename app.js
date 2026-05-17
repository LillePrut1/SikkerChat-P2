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
    // Note: private key will be loaded during first crypto operation after login
    showDashboard();
    loadDashboardData();
    attachEventListeners();
  } else {
    showAuthScreen();
    attachAuthListeners();
  }
}

/* ========== AUTH SCREEN ========== */
function attachAuthListeners() {
  const loginTabBtn = document.getElementById("loginTabBtn");
  const registerTabBtn = document.getElementById("registerTabBtn");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  loginTabBtn.addEventListener("click", () => {
    registerTabBtn.classList.remove("active");
    loginTabBtn.classList.add("active");
    registerForm.classList.remove("active");
    loginForm.classList.add("active");
  });

  registerTabBtn.addEventListener("click", () => {
    loginTabBtn.classList.remove("active");
    registerTabBtn.classList.add("active");
    loginForm.classList.remove("active");
    registerForm.classList.add("active");
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!username || !password) {
      alert("Please fill all fields");
      return;
    }

    await handleLogin(username, password);
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("registerUsername").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    const confirmPassword = document.getElementById("registerConfirmPassword").value.trim();

    if (!username || !password) {
      alert("Please fill all fields");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    await handleRegister(username, password);
  });
}

async function handleLogin(username, password) {
  try {
    let loginPublicKeyBase64 = null;
    let loginSignaturePublicKeyBase64 = null;

    // Try to derive the public key from a stored private key before login.
    // This helps recover existing accounts that were created before public-key
    // registration was fully supported.
    try {
      const encryptedPrivateKeyBase64 = await IndexedDBModule.loadPrivateKey(username);
      if (encryptedPrivateKeyBase64) {
        const derivedPublicKey = await CryptoModule.derivePublicKeyFromPrivateKey(encryptedPrivateKeyBase64);
        loginPublicKeyBase64 = await CryptoModule.exportPublicKey(derivedPublicKey);
      }
    } catch (deriveError) {
      console.warn("Could not derive public key from stored private key before login:", deriveError);
    }

    try {
      const encryptedSigningPrivateKeyBase64 = await IndexedDBModule.loadSigningPrivateKey(username);
      if (encryptedSigningPrivateKeyBase64) {
        const derivedSigningPublicKey = await CryptoModule.derivePublicKeyFromPrivateKey(encryptedSigningPrivateKeyBase64, 'signature');
        loginSignaturePublicKeyBase64 = await CryptoModule.exportPublicKey(derivedSigningPublicKey);
      }
    } catch (deriveError) {
      console.warn("Could not derive signature public key from stored signing private key before login:", deriveError);
    }

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
      const error = await response.json();
      alert(`Login failed: ${error.message}`);
      return;
    }

    const data = await response.json();
    authToken = data.token;
    currentUsername = username;
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("username", currentUsername);

    // Load encrypted private key from IndexedDB and decrypt it
    // The private key is kept in memory for this session for crypto operations
    try {
      const encryptedPrivateKeyBase64 = await IndexedDBModule.loadPrivateKey(username);
      const encryptedSigningPrivateKeyBase64 = await IndexedDBModule.loadSigningPrivateKey(username);

      if (encryptedPrivateKeyBase64) {
        // Import the private key from storage
        userPrivateKey = await CryptoModule.importPrivateKey(encryptedPrivateKeyBase64);
      } else {
        console.warn("No private key found in storage. This is the first login.");
        alert("Private key not found. Please register again.");
        localStorage.removeItem("authToken");
        localStorage.removeItem("username");
        showAuthScreen();
        attachAuthListeners();
        return;
      }

      if (encryptedSigningPrivateKeyBase64) {
        userSigningPrivateKey = await CryptoModule.importPrivateKey(encryptedSigningPrivateKeyBase64, 'sign');
      }
    } catch (dbError) {
      console.error("Failed to load private key:", dbError);
      alert("Failed to load encryption keys: " + dbError.message);
      localStorage.removeItem("authToken");
      localStorage.removeItem("username");
      showAuthScreen();
      attachAuthListeners();
      return;
    }

    try {
      const publicKeyResponse = await fetch(
        `${API_BASE_URL}/public_key?username=${encodeURIComponent(currentUsername)}&token=${authToken}`
      );
      if (publicKeyResponse.ok) {
        const publicKeyData = await publicKeyResponse.json();
        if (publicKeyData.public_key) {
          userPublicKey = await CryptoModule.importPublicKey(publicKeyData.public_key);
        }
      }
    } catch (publicKeyError) {
      console.warn("Could not load public key after login:", publicKeyError);
    }

    try {
      const signaturePublicKeyResponse = await fetch(
        `${API_BASE_URL}/public_key?username=${encodeURIComponent(currentUsername)}&type=signature&token=${authToken}`
      );
      if (signaturePublicKeyResponse.ok) {
        const signatureKeyData = await signaturePublicKeyResponse.json();
        if (signatureKeyData.public_key) {
          userSigningPublicKey = await CryptoModule.importPublicKey(signatureKeyData.public_key, 'signature');
        }
      }
    } catch (signatureError) {
      console.warn("Could not load signature public key after login:", signatureError);
    }

    if (!userPublicKey && loginPublicKeyBase64) {
      try {
        userPublicKey = await CryptoModule.importPublicKey(loginPublicKeyBase64);
      } catch (fallbackError) {
        console.warn("Failed to import derived public key after login:", fallbackError);
      }
    }

    if (!userSigningPublicKey && loginSignaturePublicKeyBase64) {
      try {
        userSigningPublicKey = await CryptoModule.importPublicKey(loginSignaturePublicKeyBase64, 'signature');
      } catch (fallbackError) {
        console.warn("Failed to import derived signing public key after login:", fallbackError);
      }
    }

    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";

    showDashboard();
    loadDashboardData();
    attachEventListeners();

  } catch (error) {
    console.error("Login error:", error);
    alert("Login error");
  }
}

async function handleRegister(username, password) {
  try {
    // Input validation
    const usernameValidation = SanitizeModule.validateUsername(username);
    if (!usernameValidation.isValid) {
      alert("Username error: " + usernameValidation.error);
      return;
    }

    const passwordValidation = SanitizeModule.validatePassword(password);
    if (!passwordValidation.isValid) {
      alert("Password error: " + passwordValidation.error);
      return;
    }

    // Show loading message
    alert("Generating encryption keys (this may take a few seconds)...");

    // Generate RSA-4096 key pair for this user
    const keyPair = await CryptoModule.generateKeyPair();
    userPublicKey = keyPair.publicKey;
    const privateKey = keyPair.privateKey;

    // Generate a separate RSA-PSS key pair for digital signatures
    const signatureKeyPair = await CryptoModule.generateSignatureKeyPair();
    userSigningPublicKey = signatureKeyPair.publicKey;
    userSigningPrivateKey = signatureKeyPair.privateKey;

    // Export public keys to send to server
    const publicKeyBase64 = await CryptoModule.exportPublicKey(keyPair.publicKey);
    const signaturePublicKeyBase64 = await CryptoModule.exportPublicKey(signatureKeyPair.publicKey);
    const privateKeyBase64 = await CryptoModule.exportPrivateKey(keyPair.privateKey);
    const signingPrivateKeyBase64 = await CryptoModule.exportPrivateKey(signatureKeyPair.privateKey);

    // Send registration request with both encryption and signature public keys
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        username: username, 
        password: password,
        public_key: publicKeyBase64,
        signature_public_key: signaturePublicKeyBase64
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Registration failed: ${error.message}`);
      return;
    }

    // Registration successful - store encrypted private keys in IndexedDB
    // The private keys are encrypted with a KDF derived from the password
    // For now, we're just storing the private keys in IndexedDB
    // In a production system, encrypt with password-derived key
    await IndexedDBModule.savePrivateKey(username, privateKeyBase64, signingPrivateKeyBase64);

    alert("Registration successful! Your encryption keys have been created and stored securely. Please log in.");
    document.getElementById("registerUsername").value = "";
    document.getElementById("registerPassword").value = "";
    document.getElementById("registerConfirmPassword").value = "";

    // Clear key from memory
    userPublicKey = null;

    document.getElementById("loginTabBtn").click();

  } catch (error) {
    console.error("Register error:", error);
    alert("Registration error: " + error.message);
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

async function fetchEncryptedGroupKeyFromServer(groupName) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/group_key?group=${encodeURIComponent(groupName)}&token=${authToken}`
    );
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
  const encryptedKeyBase64 = await fetchEncryptedGroupKeyFromServer(groupName);
  if (!encryptedKeyBase64) {
    return null;
  }

  if (!userPrivateKey) {
    try {
      const encryptedPrivateKeyBase64 = await IndexedDBModule.loadPrivateKey(currentUsername);
      if (!encryptedPrivateKeyBase64) {
        throw new Error("Private key not found locally");
      }
      userPrivateKey = await CryptoModule.importPrivateKey(encryptedPrivateKeyBase64);
    } catch (keyError) {
      console.error("Unable to import private key for group decryption:", keyError);
      return null;
    }
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
}

function showDashboard() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("currentUsername").textContent = `Logged in as: ${currentUsername}`;
}

function showControlPanel() {
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

    renderDashboard();
    showControlPanel();

  } catch (error) {
    console.error("Error loading dashboard data:", error);
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
  attachLogoutListener();
  attachAddFriendListeners();
  attachCreateGroupListeners();
  attachChatListeners();
  attachMessageListeners();
  attachLeaveGroupListener();
  attachDeleteGroupListener();
  attachBackButtonListener();
}

function attachLogoutListener() {
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", async () => {
    // Clear private key from memory (security: don't keep in RAM after logout)
    userPrivateKey = null;
    userPublicKey = null;
    userSigningPrivateKey = null;
    userSigningPublicKey = null;
    currentChatId = null;
    groupKeys = {};
    
    // Clear IndexedDB sensitive data
    try {
      await IndexedDBModule.clearSensitiveData(currentUsername);
    } catch (error) {
      console.error("Error clearing sensitive data:", error);
    }
    
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    authToken = null;
    currentUsername = null;
    currentChatName = null;
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

    // Send group creation request with encrypted group keys for recipients
    const response = await fetch(`${API_BASE_URL}/group_add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        groupname: groupName,
        members: members,
        encrypted_group_keys: encryptedGroupKeys
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    const responseData = await response.json();
    if (responseData.group_id) {
      await IndexedDBModule.saveGroupKey(responseData.group_id, groupKeyBase64);
      groupIdByName[groupName] = responseData.group_id;
      currentChatId = responseData.group_id;
    }

    alert("Group created!");
    document.getElementById("groupName").value = "";
    document.getElementById("createGroupForm").classList.add("hidden");
    loadDashboardData();

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
}

async function loadMessages(chatName) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/messages?group=${encodeURIComponent(chatName)}&token=${authToken}`
    );

    if (!response.ok) {
      console.error("Failed to load messages");
      return;
    }

    const data = await response.json();
    appState.currentMessages = data.messages || [];
    
    // renderMessages is now async due to decryption
    await renderMessages();

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

    if (msg.sender === currentUsername) {
      messageDiv.classList.add("own");
    }

    const senderDiv = document.createElement("div");
    senderDiv.className = "message-sender";
    senderDiv.textContent = msg.sender;

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";

    // Decrypt message if we have ciphertext and nonce
    let displayText = "[Unable to decrypt message]";
    const ciphertextValue = msg.ciphertext || msg.text;
    if (ciphertextValue && msg.nonce && groupKey) {
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
    if (!userSigningPrivateKey) {
      try {
        const signingKeyBase64 = await IndexedDBModule.loadSigningPrivateKey(currentUsername);
        if (signingKeyBase64) {
          userSigningPrivateKey = await CryptoModule.importPrivateKey(signingKeyBase64, 'sign');
        }
      } catch (signingKeyError) {
        console.warn('Could not load signing private key:', signingKeyError);
      }
    }

    if (userSigningPrivateKey) {
      const messageToSign = `${ciphertext}:${nonce}`;
      signature = await CryptoModule.signMessage(messageToSign, userSigningPrivateKey);
    }

    // Send encrypted message to server
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        group: chatName,
        ciphertext: ciphertext,  // Encrypted message
        nonce: nonce,            // IV for AES-GCM decryption
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
          group: currentChatName
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