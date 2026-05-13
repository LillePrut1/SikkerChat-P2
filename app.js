/* ========== API CONFIGURATION ========== */
const API_BASE_URL = "http://localhost:5000";

/* ========== GLOBAL STATE ========== */
let currentUsername = null;
let authToken = null;
let currentChatName = null;

let appState = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  groups: [],
  currentMessages: []
};

/* ========== INITIALIZATION ========== */
document.addEventListener("DOMContentLoaded", function() {
  initializeApp();
});

function initializeApp() {
  const savedToken = localStorage.getItem("authToken");
  const savedUsername = localStorage.getItem("username");

  if (savedToken && savedUsername) {
    authToken = savedToken;
    currentUsername = savedUsername;
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
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
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
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Registration failed: ${error.message}`);
      return;
    }

    alert("Registration successful! Please log in.");
    document.getElementById("registerUsername").value = "";
    document.getElementById("registerPassword").value = "";
    document.getElementById("registerConfirmPassword").value = "";

    document.getElementById("loginTabBtn").click();

  } catch (error) {
    console.error("Register error:", error);
    alert("Registration error");
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
    chatItem.setAttribute("data-chat", group);
    chatItem.textContent = group;
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
  logoutBtn.addEventListener("click", () => {
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
    const response = await fetch(`${API_BASE_URL}/group_add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        groupname: groupName,
        members: members
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    alert("Group created!");
    document.getElementById("groupName").value = "";
    document.getElementById("createGroupForm").classList.add("hidden");
    loadDashboardData();

  } catch (error) {
    console.error("Error creating group:", error);
    alert("Error creating group");
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
    openChat(chatName);
  }
}

function openChat(chatName) {
  currentChatName = chatName;
  document.querySelectorAll(".chat-item").forEach(item => {
    item.classList.remove("active");
  });
  document.querySelector(`[data-chat="${chatName}"]`).classList.add("active");

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
    renderMessages();

  } catch (error) {
    console.error("Error loading messages:", error);
  }
}

function renderMessages() {
  const messageContainer = document.getElementById("messageContainer");
  messageContainer.innerHTML = "";

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
    textDiv.textContent = msg.text || msg.ciphertext || "";

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-timestamp";
    const timestamp = new Date(msg.timestamp);
    timeDiv.textContent = timestamp.toLocaleTimeString();

    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);
    messageContainer.appendChild(messageDiv);
  }

  messageContainer.scrollTop = messageContainer.scrollHeight;
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
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temp_token: authToken,
        ciphertext: messageText,
        group: chatName
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.message}`);
      return;
    }

    await loadMessages(chatName);

  } catch (error) {
    console.error("Error sending message:", error);
    alert("Error sending message");
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