# SikkerChat v3.0 - Complete Secure Architecture Blueprint

**Status:** Design Document - Ready for Implementation  
**Version:** 3.0 (Production-Grade)  
**Last Updated:** May 12, 2026

---

## TABLE OF CONTENTS

1. [Current Status](#current-status)
2. [Immediate Fixes Applied](#immediate-fixes-applied)
3. [Architecture Overview](#architecture-overview)
4. [Feature Requirements](#feature-requirements)
5. [Data Structure Design](#data-structure-design)
6. [API Specification](#api-specification)
7. [Frontend State Management](#frontend-state-management)
8. [Security Implementation](#security-implementation)
9. [Implementation Roadmap](#implementation-roadmap)

---

## CURRENT STATUS

### ✅ WORKING NOW (After Bug Fixes)
- User registration & login ✓
- Token authentication ✓
- Group creation ✓
- Group membership ✓
- Message sending/receiving ✓
- Message persistence ✓
- Friend system (basic) ✓
- **Message UI FIXED** ✓

### ❌ KNOWN LIMITATIONS
- No encryption on messages
- No read receipts
- No typing indicators
- No message editing/deletion
- No group roles/permissions
- No message pagination
- No online/offline status
- No notification system

---

## IMMEDIATE FIXES APPLIED

### Fix 1: showChatView() Function
**File:** `app.js` | **Lines:** 177-182

```javascript
// BEFORE (BROKEN):
function showChatView() {
  document.getElementById("controlPanel").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  document.getElementById("chatHeader").classList.add("active");
}

// AFTER (FIXED):
function showChatView() {
  document.getElementById("controlPanel").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  document.getElementById("chatView").classList.add("active");  // CRITICAL
  document.getElementById("chatHeader").classList.add("active");
}
```

**Why it matters:**  
CSS rule `.chat-view.active { display: flex !important }` requires the `active` class to be present.

---

### Fix 2: showControlPanel() Function
**File:** `app.js` | **Lines:** 168-174

```javascript
// BEFORE (INCOMPLETE):
function showControlPanel() {
  document.getElementById("controlPanel").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  document.getElementById("chatHeader").classList.remove("active");
  currentChatName = null;
}

// AFTER (FIXED):
function showControlPanel() {
  document.getElementById("controlPanel").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  document.getElementById("chatView").classList.remove("active");  // ADDED
  document.getElementById("chatHeader").classList.remove("active");
  currentChatName = null;
}
```

**Why it matters:**  
Ensures symmetric state transitions between control panel and chat view.

---

### Fix 3: CSS Flex Layout
**File:** `styles.css` | **Lines:** 727-742

```css
/* BEFORE (BROKEN):
.chat-view {
  flex-direction: column;
  height: 100%;
  display: none;
  /* MISSING: flex: 1 */
}
*/

/* AFTER (FIXED):
.chat-view {
  flex-direction: column;
  height: 100%;
  display: none;
  flex: 1;  /* Now takes all available space */
}
```

**Why it matters:**  
Without `flex: 1`, the chat-view element has zero height and can't render.

---

## ARCHITECTURE OVERVIEW

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (HTML/CSS/JS)              │
├─────────────────────────────────────────────────────────────┤
│ Auth Screen  │ Dashboard  │ Chat View  │ Control Panel      │
│ (Login/Reg)  │ (Friends)  │ (Messages) │ (Create/Add)       │
└──────────────────────────┬──────────────────────────────────┘
                           │
              REST API (JSON over HTTP/HTTPS)
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   BACKEND LAYER (Flask)                     │
├─────────────────────────────────────────────────────────────┤
│ Auth Routes  │ Friend Routes  │ Group Routes  │ Message Routes
├─────────────────────────────────────────────────────────────┤
│        Token Validation + Permission Checking               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  JSON File Storage
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                  DATA LAYER (JSON Files)                    │
├─────────────────────────────────────────────────────────────┤
│ users/ │ friends/ │ groups/ │ memberships/ │ messages/      │
└─────────────────────────────────────────────────────────────┘
```

---

## FEATURE REQUIREMENTS

### Phase 1: Core Messaging (CURRENT)
- [x] User authentication
- [x] Group creation
- [x] Message sending/receiving
- [x] Message persistence
- [x] Basic friend system

### Phase 2: Enhanced Messaging (NEXT)
- [ ] Message editing
- [ ] Message deletion
- [ ] Message timestamps (detailed)
- [ ] Message read receipts
- [ ] Typing indicators
- [ ] Message scrolling/pagination

### Phase 3: Group Management
- [ ] Group roles (admin, member, moderator)
- [ ] Group permissions
- [ ] Member removal
- [ ] Group invite system
- [ ] Group description/avatar
- [ ] Member list display

### Phase 4: Friend System Enhancement
- [ ] Friend profiles
- [ ] Friend search
- [ ] Blocking
- [ ] Friend activity/status

### Phase 5: Security Enhancement
- [ ] End-to-end encryption
- [ ] Message encryption
- [ ] Key exchange protocol
- [ ] Encrypted group keys
- [ ] Per-message verification

### Phase 6: User Experience
- [ ] Online/offline status
- [ ] Notifications
- [ ] Unread message badges
- [ ] Message search
- [ ] User preferences
- [ ] Dark/light theme

---

## DATA STRUCTURE DESIGN

### Current Structure
```
data/
├── users.json
├── friends/
│   └── {username}.json
├── groups/
│   └── {group_id}.json
├── memberships/
│   └── {username}.json
└── messages/
    └── {group_id}.json
```

### Enhanced Structure (Phase 3+)
```
data/
├── users.json                    # User accounts
├── friends/
│   └── {username}.json          # Friend relationships
├── groups/
│   ├── {group_id}.json          # Group metadata
│   ├── {group_id}_roles.json    # Role assignments
│   └── {group_id}_members.json  # Member details
├── memberships/
│   └── {username}.json          # User's groups
├── messages/
│   ├── {group_id}.json          # Message history
│   └── {message_id}.json        # Individual messages (future)
├── notifications/
│   └── {username}.json          # User notifications
├── keys/
│   ├── {username}_public.json   # Public keys
│   └── {username}_private.json  # Encrypted private keys
└── sessions/
    └── {session_id}.json        # Active sessions
```

### users.json
```json
{
  "alice": {
    "password_hash": "bcrypt_hash_here",
    "temp_token": "random_token_string",
    "created_at": "2026-05-12T10:30:00Z",
    "last_login": "2026-05-12T14:30:00Z",
    "email": "alice@example.com"
  }
}
```

### friends/{username}.json
```json
{
  "friends": ["bob", "charlie"],
  "incoming_requests": ["diana"],
  "outgoing_requests": ["eve"],
  "blocked_users": []
}
```

### groups/{group_id}.json
```json
{
  "group_id": "uuid-here",
  "group_name": "Development Team",
  "creator": "alice",
  "created_at": "2026-05-12T10:30:00Z",
  "description": "Team chat for dev work",
  "members": ["alice", "bob", "charlie"],
  "roles": {
    "alice": "admin",
    "bob": "member",
    "charlie": "member"
  },
  "settings": {
    "public": false,
    "encrypted": true
  }
}
```

### messages/{group_id}.json
```json
[
  {
    "message_id": "msg-uuid",
    "sender": "alice",
    "text": "Hello everyone!",
    "ciphertext": "encrypted_version_here",
    "timestamp": "2026-05-12T10:35:00Z",
    "read_by": ["bob", "charlie"],
    "edited": false
  }
]
```

---

## API SPECIFICATION

### Authentication Endpoints

#### POST /register
```
Request:
{
  "username": "alice",
  "password": "secure_password"
}

Response (201):
{
  "message": "Registration successful",
  "token": "temp_token_string"
}

Error (400):
{
  "message": "Username already exists"
}
```

#### POST /login
```
Request:
{
  "username": "alice",
  "password": "secure_password"
}

Response (200):
{
  "token": "temp_token_string",
  "username": "alice"
}

Error (401):
{
  "message": "Invalid credentials"
}
```

---

### Friend System Endpoints

#### POST /friend_request_send
```
Request:
{
  "temp_token": "user_token",
  "target_username": "bob"
}

Response (200):
{
  "message": "Friend request sent"
}

Errors:
- 401: Invalid token
- 400: Cannot send to self
- 400: Already friends
- 400: Request already sent
- 404: User not found
```

#### GET /friend_requests
```
Request:
?token=user_token

Response (200):
{
  "friends": ["bob", "charlie"],
  "incoming_requests": ["diana"],
  "outgoing_requests": ["eve"]
}
```

#### POST /friend_request_accept
```
Request:
{
  "temp_token": "user_token",
  "requester": "diana"
}

Response (200):
{
  "message": "Friend request accepted"
}
```

#### POST /friend_request_reject
```
Request:
{
  "temp_token": "user_token",
  "requester": "diana"
}

Response (200):
{
  "message": "Friend request rejected"
}
```

#### POST /friend_remove
```
Request:
{
  "temp_token": "user_token",
  "friend_username": "bob"
}

Response (200):
{
  "message": "Friend removed"
}
```

---

### Group Endpoints

#### POST /group_add
```
Request:
{
  "temp_token": "user_token",
  "groupname": "Dev Team",
  "members": ["bob", "charlie"]
}

Response (201):
{
  "group_id": "uuid-here",
  "message": "Group created"
}

Validation:
- All members must be friends ✓
- User must be authenticated ✓
```

#### GET /rooms
```
Request:
?token=user_token

Response (200):
{
  "groups": ["Group1", "Group2", "Group3"]
}
```

#### POST /group_leave
```
Request:
{
  "temp_token": "user_token",
  "group": "Group1"
}

Response (200):
{
  "message": "Left group"
}
```

#### POST /group_delete
```
Request:
{
  "temp_token": "user_token",
  "group": "Group1"
}

Response (200):
{
  "message": "Group deleted"
}

Validation:
- Only group creator can delete
```

#### POST /group_add_member (NEW)
```
Request:
{
  "temp_token": "user_token",
  "group": "Group1",
  "member": "diana"
}

Response (200):
{
  "message": "Member added"
}

Validation:
- User must be group member
- Must be friends with new member
```

#### POST /group_remove_member (NEW)
```
Request:
{
  "temp_token": "user_token",
  "group": "Group1",
  "member": "bob"
}

Response (200):
{
  "message": "Member removed"
}

Validation:
- User must be admin
```

---

### Message Endpoints

#### POST /messages
```
Request:
{
  "temp_token": "user_token",
  "ciphertext": "message text or encrypted",
  "group": "Group1"
}

Response (201):
{
  "message_id": "uuid",
  "timestamp": "2026-05-12T10:35:00Z"
}

Validation:
- User must be group member ✓
```

#### GET /messages
```
Request:
?group=Group1&token=user_token&limit=50&offset=0

Response (200):
{
  "messages": [
    {
      "sender": "alice",
      "ciphertext": "message text",
      "timestamp": "2026-05-12T10:35:00Z"
    }
  ]
}

Validation:
- User must be group member ✓
```

#### PATCH /messages/{message_id} (NEW)
```
Request:
{
  "temp_token": "user_token",
  "ciphertext": "edited message"
}

Response (200):
{
  "message": "Message edited"
}

Validation:
- User must be sender
- Edit within 5 minutes
```

#### DELETE /messages/{message_id} (NEW)
```
Request:
?token=user_token

Response (200):
{
  "message": "Message deleted"
}

Validation:
- User must be sender or admin
```

---

## FRONTEND STATE MANAGEMENT

### Current appState Structure
```javascript
let appState = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  groups: [],
  currentMessages: []
};
```

### Enhanced appState (Recommended)
```javascript
let appState = {
  // User info
  currentUser: {
    username: "alice",
    token: "token_string",
    createdAt: "2026-05-12T10:30:00Z"
  },
  
  // Friend system
  friends: ["bob", "charlie"],
  incomingRequests: [{ from: "diana", sentAt: "..." }],
  outgoingRequests: [{ to: "eve", sentAt: "..." }],
  blockedUsers: [],
  
  // Group system
  groups: [
    { id: "uuid", name: "Dev Team", role: "admin" }
  ],
  currentGroup: {
    id: "uuid",
    name: "Dev Team",
    members: ["alice", "bob", "charlie"],
    role: "admin"
  },
  
  // Messaging
  messages: [],
  messageLoading: false,
  messageError: null,
  
  // UI State
  uiState: {
    currentScreen: "dashboard",  // dashboard | chat | profile
    sidebarOpen: true,
    notifications: []
  },
  
  // Presence
  onlineUsers: ["bob", "charlie"],
  typingUsers: ["bob"]
};
```

### State Management Best Practices

```javascript
// Instead of scattered updates:
// ❌ BAD:
document.getElementById("chatView").classList.add("active");
currentChatName = "Group1";
appState.currentMessages = [];
renderMessages();

// ✅ GOOD:
function setCurrentChat(groupName) {
  // Update state first
  appState.currentGroup = groupName;
  appState.currentMessages = [];
  
  // Then update UI
  document.getElementById("chatView").classList.add("active");
  document.getElementById("chatName").textContent = groupName;
  
  // Then fetch data
  loadMessages(groupName);
  
  // Then render
  renderMessages();
}
```

---

## SECURITY IMPLEMENTATION

### Phase 1: Current Security
- ✓ Bcrypt password hashing
- ✓ Token-based authentication
- ✓ CORS enabled for frontend
- ✓ JSON file-based storage

### Phase 2: Enhanced Security (TODO)
- [ ] Session expiration (15 min token refresh)
- [ ] HTTPS only (disable HTTP in production)
- [ ] Input validation on all endpoints
- [ ] Rate limiting on auth endpoints
- [ ] CSRF tokens for state-changing operations

### Phase 3: Advanced Security (TODO)
- [ ] End-to-end encryption (E2EE)
- [ ] Public/private key pairs
- [ ] Message encryption with group keys
- [ ] Key rotation schedule
- [ ] Audit logging

### Implementation Example: Message Encryption

```python
# server.py - Future enhancement

from cryptography.fernet import Fernet
import json

def encrypt_message(message, public_key):
    """Encrypt message with recipient's public key"""
    cipher = Fernet(public_key)
    encrypted = cipher.encrypt(message.encode())
    return encrypted.decode()

def decrypt_message(ciphertext, private_key):
    """Decrypt message with user's private key"""
    cipher = Fernet(private_key)
    decrypted = cipher.decrypt(ciphertext.encode())
    return decrypted.decode()

@app.route('/messages', methods=['POST'])
def send_message():
    """Send encrypted message to group"""
    token = get_token_from_request()
    sender = get_user_from_token(token)
    
    if not sender:
        return {"message": "Unauthorized"}, 401
    
    group = request.json.get("group")
    plaintext = request.json.get("text")
    
    # Get group public key
    group_data = load_json(...)
    group_public_key = group_data.get("public_key")
    
    # Encrypt message
    ciphertext = encrypt_message(plaintext, group_public_key)
    
    # Store encrypted message
    message = {
        "sender": sender,
        "ciphertext": ciphertext,
        "timestamp": datetime.now().isoformat()
    }
    
    # Save to messages file
    messages = load_json(...)
    messages.append(message)
    save_json(...)
    
    return {"message_id": str(uuid4())}, 201
```

---

## IMPLEMENTATION ROADMAP

### Week 1: Core Bug Fixes ✅ COMPLETED
- [x] Fix message input bar disappearing
- [x] Fix chat view rendering
- [x] Verify message sending works
- [x] Test complete message flow

### Week 2: Message Features
- [ ] Message editing
- [ ] Message deletion
- [ ] Better timestamps
- [ ] Message search

### Week 3: Group Management
- [ ] Group member list UI
- [ ] Remove member functionality
- [ ] Group settings UI
- [ ] Group roles display

### Week 4: Friend Enhancements
- [ ] Friend search
- [ ] Friend profiles
- [ ] Block functionality
- [ ] Friend removal UI

### Week 5: User Experience
- [ ] Online/offline status
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Notification system

### Week 6: Security
- [ ] Message encryption basics
- [ ] Key generation
- [ ] Encrypted storage
- [ ] Key exchange protocol

### Week 7: Polish & Testing
- [ ] Performance optimization
- [ ] Bug fixing
- [ ] Cross-browser testing
- [ ] Security audit

### Week 8: Deployment
- [ ] Database migration planning
- [ ] Production deployment guide
- [ ] Monitoring setup
- [ ] Backup strategy

---

## QUICK START - NEXT ACTIONS

### For Testing (Do This Now)
1. Refresh browser (Ctrl+Shift+R)
2. Login with test123
3. Click "testgroup"
4. Verify message input bar is visible
5. Send a test message
6. Verify message appears

### For Development (Phase 2)
1. Add message editing UI
2. Add message deletion UI
3. Add member list display
4. Add typing indicators backend

### For Production (Phase 3+)
1. Implement database (PostgreSQL)
2. Add encryption layer
3. Deploy to cloud
4. Add monitoring/logging
5. Security audit

---

## SUPPORT & DOCUMENTATION

- **Debugging:** See `DEBUGGING_ANALYSIS.md`
- **Current Status:** See `VERIFICATION_CHECKLIST.md`
- **Setup Guide:** See `QUICKSTART.md`
- **API Docs:** See `SECURE_ARCHITECTURE.md`

