/* ========== API CONFIGURATION ========== */
/* Base URL for all API requests to Flask backend */
const API_BASE_URL = "http://localhost:5000";

/* ========== GLOBAL STATE ========== */
/* Store current logged in username */
let currentUsername = null;
/* Store authentication token from login */
let authToken = null;
/* Store currently selected chat/group name */
let currentChatName = null;

/* ========== INITIALIZATION ========== */
/* Initialize application when page loads */
document.addEventListener("DOMContentLoaded", function() {
  /* Call main initialization function */
  initializeApp();
});

/* ========== MAIN INIT FUNCTION ========== */
/* Main initialization function that runs on page load */
function initializeApp() {
  /* Check if user has valid token in localStorage */
  const savedToken = localStorage.getItem("authToken");
  /* Check if username is saved in localStorage */
  const savedUsername = localStorage.getItem("username");

  /* If both token and username exist, show dashboard */
  if (savedToken && savedUsername) {
    /* Store token in memory */
    authToken = savedToken;
    /* Store username in memory */
    currentUsername = savedUsername;
    /* Call function to show dashboard */
    showDashboard();
    /* Call function to load chat rooms */
    loadChatRooms();
  } else {
    /* Show auth screen if no token found */
    showAuthScreen();
  }

  /* Attach event listeners for auth tabs */
  attachAuthTabListeners();
  /* Attach event listeners for login form */
  attachLoginFormListener();
  /* Attach event listeners for register form */
  attachRegisterFormListener();
  /* Attach event listeners for dashboard controls */
  attachDashboardListeners();
  /* Attach event listeners for chat controls */
  attachChatListeners();
}

/* ========== AUTH TAB SWITCHING ========== */
/* Attach click listeners to login and register tab buttons */
function attachAuthTabListeners() {
  /* Get login tab button element */
  const loginTabBtn = document.getElementById("loginTabBtn");
  /* Get register tab button element */
  const registerTabBtn = document.getElementById("registerTabBtn");
  /* Get login form element */
  const loginForm = document.getElementById("loginForm");
  /* Get register form element */
  const registerForm = document.getElementById("registerForm");

  /* Add click listener to login tab button */
  loginTabBtn.addEventListener("click", function() {
    /* Remove active class from register button */
    registerTabBtn.classList.remove("active");
    /* Add active class to login button */
    loginTabBtn.classList.add("active");
    /* Remove active class from register form */
    registerForm.classList.remove("active");
    /* Add active class to login form */
    loginForm.classList.add("active");
  });

  /* Add click listener to register tab button */
  registerTabBtn.addEventListener("click", function() {
    /* Remove active class from login button */
    loginTabBtn.classList.remove("active");
    /* Add active class to register button */
    registerTabBtn.classList.add("active");
    /* Remove active class from login form */
    loginForm.classList.remove("active");
    /* Add active class to register form */
    registerForm.classList.add("active");
  });
}

/* ========== LOGIN FORM HANDLING ========== */
/* Attach submit listener to login form */
function attachLoginFormListener() {
  /* Get login form element */
  const loginForm = document.getElementById("loginForm");

  /* Add submit event listener to login form */
  loginForm.addEventListener("submit", async function(event) {
    /* Prevent default form submission behavior */
    event.preventDefault();

    /* Get username input value */
    const username = document.getElementById("loginUsername").value.trim();
    /* Get password input value */
    const password = document.getElementById("loginPassword").value.trim();

    /* Validate that username is not empty */
    if (!username) {
      /* Show error if username is empty */
      alert("Username cannot be empty");
      /* Exit function early */
      return;
    }

    /* Validate that password is not empty */
    if (!password) {
      /* Show error if password is empty */
      alert("Password cannot be empty");
      /* Exit function early */
      return;
    }

    /* Call function to handle login with username and password */
    await handleLogin(username, password);
  });
}

/* ========== LOGIN LOGIC ========== */
/* Handle login request to backend */
async function handleLogin(username, password) {
  try {
    /* Send POST request to login endpoint */
    const response = await fetch(`${API_BASE_URL}/login`, {
      /* Set HTTP method to POST */
      method: "POST",
      /* Set request headers for JSON */
      headers: {
        /* Specify content type as JSON */
        "Content-Type": "application/json"
      },
      /* Convert request body to JSON string */
      body: JSON.stringify({
        /* Include username in request */
        username: username,
        /* Include password in request */
        password: password
      })
    });

    /* Check if response status is not OK */
    if (!response.ok) {
      /* Parse error response as JSON */
      const error = await response.json();
      /* Show error message to user */
      alert(`Login failed: ${error.message || "Unknown error"}`);
      /* Exit function early */
      return;
    }

    /* Parse response as JSON */
    const data = await response.json();

    /* Check if response contains a token */
    if (!data.token) {
      /* Show error if token is missing */
      alert("Login failed: No token received");
      /* Exit function early */
      return;
    }

    /* Store token in memory */
    authToken = data.token;
    /* Store username in memory */
    currentUsername = username;
    /* Store token in localStorage for persistence */
    localStorage.setItem("authToken", authToken);
    /* Store username in localStorage for persistence */
    localStorage.setItem("username", currentUsername);

    /* Clear login form fields */
    document.getElementById("loginUsername").value = "";
    /* Clear password field */
    document.getElementById("loginPassword").value = "";

    /* Call function to show dashboard */
    showDashboard();
    /* Call function to load chat rooms */
    loadChatRooms();

  } catch (error) {
    /* Log error to console for debugging */
    console.error("Login error:", error);
    /* Show error message to user */
    alert(`Login error: ${error.message}`);
  }
}

/* ========== REGISTER FORM HANDLING ========== */
/* Attach submit listener to register form */
function attachRegisterFormListener() {
  /* Get register form element */
  const registerForm = document.getElementById("registerForm");

  /* Add submit event listener to register form */
  registerForm.addEventListener("submit", async function(event) {
    /* Prevent default form submission behavior */
    event.preventDefault();

    /* Get username input value */
    const username = document.getElementById("registerUsername").value.trim();
    /* Get password input value */
    const password = document.getElementById("registerPassword").value.trim();
    /* Get confirm password input value */
    const confirmPassword = document.getElementById("registerConfirmPassword").value.trim();

    /* Validate that username is not empty */
    if (!username) {
      /* Show error if username is empty */
      alert("Username cannot be empty");
      /* Exit function early */
      return;
    }

    /* Validate that password is not empty */
    if (!password) {
      /* Show error if password is empty */
      alert("Password cannot be empty");
      /* Exit function early */
      return;
    }

    /* Check if passwords match */
    if (password !== confirmPassword) {
      /* Show error if passwords don't match */
      alert("Passwords do not match");
      /* Exit function early */
      return;
    }

    /* Validate password length */
    if (password.length < 6) {
      /* Show error if password is too short */
      alert("Password must be at least 6 characters");
      /* Exit function early */
      return;
    }

    /* Call function to handle registration */
    await handleRegister(username, password);
  });
}

/* ========== REGISTER LOGIC ========== */
/* Handle register request to backend */
async function handleRegister(username, password) {
  try {
    /* Send POST request to register endpoint */
    const response = await fetch(`${API_BASE_URL}/register`, {
      /* Set HTTP method to POST */
      method: "POST",
      /* Set request headers for JSON */
      headers: {
        /* Specify content type as JSON */
        "Content-Type": "application/json"
      },
      /* Convert request body to JSON string */
      body: JSON.stringify({
        /* Include username in request */
        username: username,
        /* Include password in request */
        password: password
      })
    });

    /* Check if response status is not OK */
    if (!response.ok) {
      /* Parse error response as JSON */
      const error = await response.json();
      /* Show error message to user */
      alert(`Registration failed: ${error.message || "Unknown error"}`);
      /* Exit function early */
      return;
    }

    /* Parse response as JSON */
    const data = await response.json();

    /* Show success message */
    alert("Registration successful! Please log in.");

    /* Clear register form fields */
    document.getElementById("registerUsername").value = "";
    /* Clear password field */
    document.getElementById("registerPassword").value = "";
    /* Clear confirm password field */
    document.getElementById("registerConfirmPassword").value = "";

    /* Get login tab button element */
    const loginTabBtn = document.getElementById("loginTabBtn");
    /* Get register tab button element */
    const registerTabBtn = document.getElementById("registerTabBtn");
    /* Get login form element */
    const loginForm = document.getElementById("loginForm");
    /* Get register form element */
    const registerForm = document.getElementById("registerForm");

    /* Switch to login form after successful registration */
    registerTabBtn.classList.remove("active");
    /* Add active class to login button */
    loginTabBtn.classList.add("active");
    /* Remove active class from register form */
    registerForm.classList.remove("active");
    /* Add active class to login form */
    loginForm.classList.add("active");

  } catch (error) {
    /* Log error to console for debugging */
    console.error("Register error:", error);
    /* Show error message to user */
    alert(`Registration error: ${error.message}`);
  }
}

/* ========== UI STATE MANAGEMENT ========== */
/* Show authentication screen and hide dashboard */
function showAuthScreen() {
  /* Get auth screen element */
  const authScreen = document.getElementById("authScreen");
  /* Get dashboard element */
  const dashboard = document.getElementById("dashboard");

  /* Add hidden class to dashboard to hide it */
  dashboard.classList.add("hidden");
  /* Remove hidden class from auth screen to show it */
  authScreen.classList.remove("hidden");
}

/* Show dashboard and hide authentication screen */
function showDashboard() {
  /* Get auth screen element */
  const authScreen = document.getElementById("authScreen");
  /* Get dashboard element */
  const dashboard = document.getElementById("dashboard");

  /* Add hidden class to auth screen to hide it */
  authScreen.classList.add("hidden");
  /* Remove hidden class from dashboard to show it */
  dashboard.classList.remove("hidden");

  /* Get current username display element */
  const currentUsernameElement = document.getElementById("currentUsername");
  /* Set display text to current username */
  currentUsernameElement.textContent = `Logged in as: ${currentUsername}`;
}

/* Show control panel and hide chat view */
function showControlPanel() {
  /* Get control panel element */
  const controlPanel = document.getElementById("controlPanel");
  /* Get chat view element */
  const chatView = document.getElementById("chatView");
  /* Get chat header element */
  const chatHeader = document.getElementById("chatHeader");

  /* Remove hidden class from control panel to show it */
  controlPanel.classList.remove("hidden");
  /* Add hidden class to chat view to hide it */
  chatView.classList.add("hidden");
  /* Remove active class from chat header to hide it */
  chatHeader.classList.remove("active");
}

/* Show chat view and hide control panel */
function showChatView() {
  const controlPanel = document.getElementById("controlPanel");
  const chatView = document.getElementById("chatView");
  const chatHeader = document.getElementById("chatHeader");

  controlPanel.classList.add("hidden");

  chatView.classList.remove("hidden");
  chatView.style.display = "flex";   //  FORCE SHOW

  chatHeader.classList.add("active");
}

/* ========== DASHBOARD LISTENERS ========== */
/* Attach event listeners to dashboard controls */
function attachDashboardListeners() {
  /* Get logout button element */
  const logoutBtn = document.getElementById("logoutBtn");
  /* Get add friend button element */
  const addFriendBtn = document.getElementById("addFriendBtn");
  /* Get create group button element */
  const createGroupBtn = document.getElementById("createGroupBtn");

  /* Add click listener to logout button */
  logoutBtn.addEventListener("click", handleLogout);

  /* Add click listener to add friend button */
  addFriendBtn.addEventListener("click", function() {
    /* Get add friend form element */
    const addFriendForm = document.getElementById("addFriendForm");
    /* Toggle hidden class to show/hide form */
    addFriendForm.classList.toggle("hidden");
  });

  /* Add click listener to create group button */
  createGroupBtn.addEventListener("click", function() {
    /* Get create group form element */
    const createGroupForm = document.getElementById("createGroupForm");
    /* Toggle hidden class to show/hide form */
    createGroupForm.classList.toggle("hidden");
  });

  /* Get cancel add friend button element */
  const cancelAddFriendBtn = document.getElementById("cancelAddFriendBtn");
  /* Add click listener to cancel add friend button */
  cancelAddFriendBtn.addEventListener("click", function() {
    /* Get add friend form element */
    const addFriendForm = document.getElementById("addFriendForm");
    /* Add hidden class to hide form */
    addFriendForm.classList.add("hidden");
  });

  /* Get cancel create group button element */
  const cancelCreateGroupBtn = document.getElementById("cancelCreateGroupBtn");
  /* Add click listener to cancel create group button */
  cancelCreateGroupBtn.addEventListener("click", function() {
    /* Get create group form element */
    const createGroupForm = document.getElementById("createGroupForm");
    /* Add hidden class to hide form */
    createGroupForm.classList.add("hidden");
  });

  /* Get confirm add friend button element */
  const confirmAddFriendBtn = document.getElementById("confirmAddFriendBtn");
  /* Add click listener to confirm add friend button */
  confirmAddFriendBtn.addEventListener("click", function() {
    /* Get friend username input element */
    const friendUsername = document.getElementById("friendUsername").value.trim();

    /* Validate that friend username is not empty */
    if (!friendUsername) {
      /* Show error if friend username is empty */
      alert("Please enter a friend username");
      /* Exit function early */
      return;
    }

    /* Show success message (UI only for now) */
    alert(`Friend request sent to ${friendUsername}`);

    /* Clear friend username input */
    document.getElementById("friendUsername").value = "";
    /* Get add friend form element */
    const addFriendForm = document.getElementById("addFriendForm");
    /* Add hidden class to hide form */
    addFriendForm.classList.add("hidden");
  });

  /* Get confirm create group button element */
  const confirmCreateGroupBtn = document.getElementById("confirmCreateGroupBtn");
  /* Add click listener to confirm create group button */
  confirmCreateGroupBtn.addEventListener("click", async function() {
    /* Get group name input value */
    const groupName = document.getElementById("groupName").value.trim();
    /* Get group members input value */
    const groupMembers = document.getElementById("groupMembers").value.trim();

    /* Validate that group name is not empty */
    if (!groupName) {
      /* Show error if group name is empty */
      alert("Please enter a group name");
      /* Exit function early */
      return;
    }

    /* Call function to handle group creation */
    await handleCreateGroup(groupName, groupMembers);
  });
}

/* ========== CREATE GROUP LOGIC ========== */
/* Handle creating a new group */
async function handleCreateGroup(groupName, memberString) {
  try {
    /* Parse comma-separated members into array */
    const members = memberString.split(",").map(m => m.trim()).filter(m => m);

    /* Send POST request to create group endpoint */
    const response = await fetch(`${API_BASE_URL}/group_add`, {
      /* Set HTTP method to POST */
      method: "POST",
      /* Set request headers for JSON */
      headers: {
        /* Specify content type as JSON */
        "Content-Type": "application/json"
      },
      /* Convert request body to JSON string */
      body: JSON.stringify({
        /* Include group name in request */
        groupname: groupName,
        /* Include member list in request */
        members: members,
        /* Include authentication token in request */
        temp_token: authToken
      })
    });

    /* Check if response status is not OK */
    if (!response.ok) {
      /* Parse error response as JSON */
      const error = await response.json();
      /* Show error message to user */
      alert(`Failed to create group: ${error.message || "Unknown error"}`);
      /* Exit function early */
      return;
    }

    /* Show success message */
    alert("Group created successfully!");

    /* Clear group name input */
    document.getElementById("groupName").value = "";
    /* Clear group members input */
    document.getElementById("groupMembers").value = "";
    /* Get create group form element */
    const createGroupForm = document.getElementById("createGroupForm");
    /* Add hidden class to hide form */
    createGroupForm.classList.add("hidden");

    /* Call function to reload chat rooms */
    loadChatRooms();

  } catch (error) {
    /* Log error to console for debugging */
    console.error("Create group error:", error);
    /* Show error message to user */
    alert(`Error creating group: ${error.message}`);
  }
}

/* ========== LOGOUT LOGIC ========== */
/* Handle user logout */
function handleLogout() {
  /* Remove token from localStorage */
  localStorage.removeItem("authToken");
  /* Remove username from localStorage */
  localStorage.removeItem("username");

  /* Clear token from memory */
  authToken = null;
  /* Clear username from memory */
  currentUsername = null;
  /* Clear current chat name from memory */
  currentChatName = null;

  /* Show authentication screen */
  showAuthScreen();
}

/* ========== CHAT LIST MANAGEMENT ========== */
/* Load all available chat rooms from backend */
async function loadChatRooms() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/rooms?token=${authToken}`
    );

    if (!response.ok) {
      console.error("Failed to load rooms");
      return;
    }

    const data = await response.json();
    const groups = data.groups || [];

    const chatList = document.getElementById("chatList");
    chatList.innerHTML = "";

    if (groups.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No groups or chats";
      chatList.appendChild(emptyState);
      showControlPanel();
      return;
    }

    for (let group of groups) {
      const chatItem = document.createElement("div");
      chatItem.className = "chat-item";
      chatItem.setAttribute("data-chat", group);
      chatItem.textContent = group;
      chatList.appendChild(chatItem);
    }

    if (!currentChatName) {
    showControlPanel();
    }

  } catch (error) {
    console.error("Error loading chat rooms:", error);
  }
}

/* ========== CHAT LISTENERS ========== */
/* Attach event listeners to chat controls */
function attachChatListeners() {
  /* Use event delegation for chat list items since they load dynamically */
  document.addEventListener("click", function(event) {
    /* Check if clicked element is a chat item */
    const chatItem = event.target.closest(".chat-item");

    /* If chat item was clicked */
    if (chatItem) {
      /* Get chat name from data attribute */
      const chatName = chatItem.getAttribute("data-chat");

      /* Remove active class from all chat items */
      document.querySelectorAll(".chat-item").forEach(item => {
        /* Remove active class from each chat item */
        item.classList.remove("active");
      });

      /* Add active class to clicked chat item */
      chatItem.classList.add("active");

      /* Store current chat name in memory */
      currentChatName = chatName;

      /* Get chat name heading element */
      const chatNameElement = document.getElementById("chatName");
      /* Set heading text to selected chat name */
      chatNameElement.textContent = chatName;

      /* Show chat view */
      showChatView();

      /* Call function to load messages for selected chat */
      loadMessages(chatName);
    }
  });

  /* Get message form element */
  const messageForm = document.getElementById("messageForm");
  /* Add submit event listener to message form */
  messageForm.addEventListener("submit", async function(event) {
    /* Prevent default form submission behavior */
    event.preventDefault();

    /* Validate that a chat is selected */
    if (!currentChatName) {
      /* Show error if no chat selected */
      alert("Please select a chat first");
      /* Exit function early */
      return;
    }

    /* Get message input element */
    const messageInput = document.getElementById("messageInput");
    /* Get message text from input */
    const messageText = messageInput.value.trim();

    /* Validate that message is not empty */
    if (!messageText) {
      /* Exit function early if message is empty */
      return;
    }

    /* Call function to send message */
    await sendMessage(currentChatName, messageText);

    /* Clear message input field */
    messageInput.value = "";
  });

  /* Get delete chat button element */
  const deleteChatBtn = document.getElementById("deleteChatBtn");
  /* Add click listener to delete chat button */
  deleteChatBtn.addEventListener("click", async function() {
  const confirmed = confirm(`Are you sure you want to delete ${currentChatName}?`);

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/group_delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        group: currentChatName,
        temp_token: authToken
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Failed to delete group");
      return;
    }

    alert("Group deleted successfully");

    currentChatName = null;
    showControlPanel();
    loadChatRooms();

  } catch (error) {
    console.error("Delete error:", error);
    alert("Error deleting group");
  }
  const backBtn = document.getElementById("backBtn");

backBtn.addEventListener("click", function () {
  currentChatName = null;
  showControlPanel();
});
});
}

/* ========== MESSAGE MANAGEMENT ========== */
/* Load all messages for a specific chat */

async function loadMessages(chatName) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/messages?group=${encodeURIComponent(chatName)}&token=${authToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to load messages:", error);
      return;
    }

    const data = await response.json();

    renderMessages(data.messages || []);

  } catch (error) {
    console.error("Error loading messages:", error);
  }
}


/* ========== RENDER MESSAGES ========== */
/* Render messages in the message container */
function renderMessages(messages) {
  /* Get message container element */
  const messageContainer = document.getElementById("messageContainer");
  /* Clear existing messages */
  messageContainer.innerHTML = "";

  /* Loop through each message in the array */
  for (let msg of messages) {
    /* Create new div element for message */
    const messageDiv = document.createElement("div");
    /* Add message class for styling */
    messageDiv.className = "message";

    /* Check if message is from current user */
    if (msg.sender === currentUsername) {
      /* Add own class to style own messages differently */
      messageDiv.classList.add("own");
    }

    /* Create sender name element */
    const senderDiv = document.createElement("div");
    /* Add message-sender class for styling */
    senderDiv.className = "message-sender";
    /* Set text content to sender name */
    senderDiv.textContent = msg.sender;

    /* Create message text element */
    const textDiv = document.createElement("div");
    /* Add message-text class for styling */
    textDiv.className = "message-text";
    /* Set text content to message text */
    textDiv.textContent = msg.text || msg.ciphertext || "";

    /* Create timestamp element */
    const timeDiv = document.createElement("div");
    /* Add message-timestamp class for styling */
    timeDiv.className = "message-timestamp";
    /* Convert timestamp to readable format */
    const timestamp = new Date(msg.timestamp);
    /* Format timestamp as time string */
    timeDiv.textContent = timestamp.toLocaleTimeString();

    /* Append sender to message div */
    messageDiv.appendChild(senderDiv);
    /* Append text to message div */
    messageDiv.appendChild(textDiv);
    /* Append timestamp to message div */
    messageDiv.appendChild(timeDiv);

    /* Append message to message container */
    messageContainer.appendChild(messageDiv);
  }

  /* Scroll to bottom of message container to show latest message */
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

/* ========== SEND MESSAGE ========== */
/* Send a message to the current chat */
async function sendMessage(chatName, messageText) {
  try {
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ciphertext: messageText,
        group: chatName,
        temp_token: authToken
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Failed to send message: ${error.message || "Unknown error"}`);
      return;
    }

    // Reload messages after sending
    await loadMessages(chatName);

  } catch (error) {
    console.error("Error sending message:", error);
    alert("Error sending message");
  }
}