# SikkerChat - Secure Group Chat System
## Complete Architecture & Implementation Guide

---

## 📋 OVERVIEW

SikkerChat has been completely redesigned into a **secure, friend-based group chat system**. The system enforces a strict permission model where:

1. Users must establish friend relationships before interacting
2. Groups can only be created with existing friends
3. Only friends can be added to groups
4. Users have full control over their connections

---

## 🏗️ ARCHITECTURE

### Frontend Stack
- **HTML5**: Semantic structure with accessibility
- **Vanilla JavaScript**: Pure JS (no frameworks) for state management
- **CSS3**: Dark theme with responsive design

### Backend Stack
- **Flask**: Python web framework
- **bcrypt**: Password hashing and verification
- **JSON Storage**: File-based data persistence (no database)
- **UUID**: Unique identifier generation
- **CORS**: Cross-origin request handling

### Data Storage
```
data/
├── users.json                    # User accounts & credentials
├── friends/                      # Friend relationships per user
│   └── {username}.json          
├── groups/                       # Group metadata
│   └── {group_id}.json          
├── memberships/                  # User group memberships
│   └── {username}.json          
└── messages/                     # Chat messages per group
    └── {group_id}.json          
```

---

## 🔐 SECURITY FEATURES

### Authentication
- ✅ Bcrypt password hashing (never plaintext storage)
- ✅ Secure random token generation (secrets.token_urlsafe)
- ✅ Token validation on every request
- ✅ LocalStorage for session persistence (frontend only)

### Authorization
- ✅ Token-based access control
- ✅ Membership validation before message access
- ✅ Friend relationship verification before group creation
- ✅ Creator-only group deletion
- ✅ User-only group leaving

### Data Validation
- ✅ Username/password validation
- ✅ Group name validation
- ✅ Friend relationship existence checks
- ✅ Member existence verification
- ✅ Duplicate prevention (friends, requests, memberships)

### Privacy
- ✅ Friend requests go through approval flow
- ✅ Users control their friend list
- ✅ No unauthorized group additions
- ✅ Message access restricted to group members only

---

## 📚 API ENDPOINTS

### Authentication
#### `POST /register`
Register new user account
```json
{
  "username": "alice",
  "password": "SecurePassword123"
}
```
Response: `{ "message": "Registration successful" }` (201)

#### `POST /login`
Authenticate user and receive token
```json
{
  "username": "alice",
  "password": "SecurePassword123"
}
```
Response: `{ "token": "secure_random_token" }` (200)

---

### Friend System

#### `POST /friend_request_send`
Send friend request to another user
```json
{
  "temp_token": "user_token",
  "target_username": "bob"
}
```
Response: `{ "message": "Friend request sent" }` (201)

**Validation:**
- Token must be valid
- Target user must exist
- Cannot send to self
- Cannot send duplicate requests
- Cannot request if already friends

#### `GET /friend_requests`
Get all incoming and outgoing friend requests
```
GET /friend_requests?token=user_token
```
Response:
```json
{
  "friends": ["bob", "charlie"],
  "incoming_requests": ["diana"],
  "outgoing_requests": ["eve"]
}
```

#### `POST /friend_request_accept`
Accept incoming friend request
```json
{
  "temp_token": "user_token",
  "requester": "diana"
}
```
Response: `{ "message": "Friend request accepted" }` (200)

**Effects:**
- Removes from incoming_requests
- Removes from requester's outgoing_requests
- Adds both users to each other's friends list

#### `POST /friend_request_reject`
Reject incoming friend request
```json
{
  "temp_token": "user_token",
  "requester": "diana"
}
```
Response: `{ "message": "Friend request rejected" }` (200)

**Effects:**
- Removes from incoming_requests
- Removes from requester's outgoing_requests
- No friendship is created

---

### Group Management

#### `POST /group_add`
Create new group with only friends
```json
{
  "temp_token": "user_token",
  "groupname": "Project Team",
  "members": ["bob", "charlie"]
}
```
Response: `{ "message": "Group created", "group_id": "uuid" }` (201)

**Validation & Security:**
- Creator is automatically added
- **Only friends in creator's friends list are added**
- Non-friend members are silently skipped
- Creator cannot be self-added
- Non-existent users are skipped
- Duplicate members prevented

#### `GET /rooms`
Get all groups user belongs to
```
GET /rooms?token=user_token
```
Response: `{ "groups": ["Project Team", "Study Group"] }` (200)

#### `POST /group_leave`
Leave a group (not delete it)
```json
{
  "temp_token": "user_token",
  "group": "Project Team"
}
```
Response: `{ "message": "Left group successfully" }` (200)

#### `POST /group_delete`
Delete group (creator only)
```json
{
  "temp_token": "user_token",
  "group": "Project Team"
}
```
Response: `{ "message": "Group deleted" }` (200)

**Validation:**
- Only creator can delete
- Removes group file
- Removes messages file
- Removes group from all members' memberships

---

### Messaging

#### `POST /messages`
Send message to group
```json
{
  "temp_token": "user_token",
  "group": "Project Team",
  "ciphertext": "Hello everyone!"
}
```
Response: `{ "message": "Message sent" }` (201)

**Validation:**
- User must be group member
- Message cannot be empty

#### `GET /messages`
Get all messages in a group
```
GET /messages?group=Project%20Team&token=user_token
```
Response:
```json
{
  "messages": [
    {
      "sender": "alice",
      "text": "Hello everyone!",
      "timestamp": "2026-04-25T10:30:00.000Z"
    }
  ]
}
```

**Validation:**
- User must be group member

---

## 💾 DATA STRUCTURES

### `users.json`
```json
{
  "alice": {
    "password_hash": "bcrypt_hash_here",
    "temp_token": "secure_token_or_null",
    "public_key": null
  }
}
```

### `friends/{username}.json`
```json
{
  "friends": ["bob", "charlie"],
  "incoming_requests": ["diana"],
  "outgoing_requests": ["eve"]
}
```

### `groups/{group_id}.json`
```json
{
  "group_id": "uuid-here",
  "group_name": "Project Team",
  "creator": "alice",
  "created_at": "2026-04-25T10:00:00.000Z"
}
```

### `memberships/{username}.json`
```json
{
  "groups": ["uuid-1", "uuid-2", "uuid-3"]
}
```

### `messages/{group_id}.json`
```json
{
  "messages": [
    {
      "sender": "alice",
      "text": "Message content",
      "timestamp": "2026-04-25T10:30:00.000Z"
    }
  ]
}
```

---

## 🎯 FRONTEND WORKFLOW

### User Flow
```
1. Login/Register
   ↓
2. Dashboard loads with:
   - Friends list
   - Friend requests (incoming/outgoing)
   - Groups list
   ↓
3. User can:
   - Send friend requests
   - Accept/reject requests
   - Create groups (with friends only)
   - Join existing groups
   ↓
4. In group chat:
   - Send messages
   - Leave group
   - Delete group (if creator)
   - Go back to dashboard
```

### State Management
All state is centralized in `appState` object:
```javascript
let appState = {
  friends: [],              // List of friends
  incomingRequests: [],     // Incoming friend requests
  outgoingRequests: [],     // Sent friend requests
  groups: [],               // User's groups
  currentMessages: []       // Messages in current chat
};
```

### Key Functions
- `loadDashboardData()` - Load all friend and group data
- `renderDashboard()` - Render friends, requests, groups
- `openChat(chatName)` - Switch to group chat
- `attachEventListeners()` - Setup all event handlers
- `sendFriendRequest(username)` - Send friend request
- `handleRequestAction(action, user)` - Accept/reject request
- `createGroup(name, members)` - Create new group

---

## 🐛 BUG FIXES

### Fixed Issues
1. ✅ **Chat flicker** - Fixed by proper state management and CSS classes
2. ✅ **Message input disappearance** - Fixed by maintaining chat-view visibility
3. ✅ **Back button inconsistency** - Fixed with proper event listeners
4. ✅ **UI state conflicts** - Separated auth, dashboard, and chat states
5. ✅ **Event listener duplication** - Changed from multiple `attachListeners` calls to single `attachEventListeners()`
6. ✅ **Async race conditions** - Added proper state synchronization with `loadDashboardData()`

---

## 🔄 VALIDATION FLOW

### Friend Request Process
```
User A → Send request → User B's incoming_requests
User A's outgoing_requests ← Request added

User B accepts:
├─ Removes from both users' request lists
├─ Adds A to B's friends
└─ Adds B to A's friends
```

### Group Creation Process
```
Creator wants to add [bob, charlie, diana]
├─ Check bob is in creator's friends ✓ → Add
├─ Check charlie is in creator's friends ✓ → Add
├─ Check diana is in creator's friends ✗ → Skip
└─ Create group with [creator, bob, charlie]
```

### Message Sending Process
```
User sends message to group
├─ Validate token
├─ Get username from token
├─ Find group by name
├─ Check user is member
├─ Validate message not empty
├─ Store message with timestamp
└─ Return success
```

---

## 🚀 DEPLOYMENT

### Requirements
- Python 3.7+
- Flask: `pip install flask flask-cors bcrypt`
- Modern browser with ES6 support

### Setup
```bash
# Install dependencies
pip install flask flask-cors bcrypt

# Run server
python server.py

# Open in browser
http://localhost:5000
```

The application will:
1. Create `data/` directory structure
2. Initialize all subdirectories
3. Start Flask server on port 5000
4. Enable CORS for frontend requests

---

## 🔒 Security Considerations

### What This System Does Well
✅ Friend-based access model prevents spam  
✅ Token validation on every endpoint  
✅ Password hashing with bcrypt  
✅ Membership verification before access  
✅ Creator-only group deletion  

### Future Enhancements
- [ ] End-to-end encryption (E2EE) for messages
- [ ] Rate limiting on requests
- [ ] Message deletion/editing
- [ ] Group admin roles
- [ ] Message reactions/emojis
- [ ] User profile pictures
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Token expiration
- [ ] Activity logging

### Note on JSON Storage
⚠️ This system uses JSON files for learning/demonstration purposes. For production:
- Use a proper database (PostgreSQL, MongoDB)
- Implement proper authentication (JWT, OAuth)
- Add HTTPS encryption
- Implement rate limiting
- Add request validation libraries
- Use environment variables for config

---

## 📝 CODE ORGANIZATION

### Backend (`server.py`)
```
1. Imports & Setup
2. Directory Initialization
3. Helper Functions
4. Authentication Routes
5. Friend System Routes
6. Group Management Routes
7. Message Routes
8. Error Handlers
```

### Frontend (`app.js`)
```
1. Configuration & State
2. Initialization
3. Auth Listeners
4. UI State Management
5. Dashboard Data Loading
6. Event Listeners (all types)
7. Helper Functions
```

### Styling (`styles.css`)
```
1. CSS Variables
2. Reset & Base Styles
3. Layout Components
4. Auth Screen
5. Dashboard
6. Chat UI
7. Buttons & Forms
8. Friend System Styles
9. Responsive Design
```

---

## ✅ TESTING CHECKLIST

### Authentication
- [ ] Register new user
- [ ] Login with correct credentials
- [ ] Login fails with wrong password
- [ ] Session persists on refresh
- [ ] Logout clears session

### Friend System
- [ ] Send friend request
- [ ] Receive friend request notification
- [ ] Accept friend request
- [ ] Reject friend request
- [ ] Friends list updates automatically
- [ ] Cannot send duplicate requests
- [ ] Cannot add self as friend

### Group Management
- [ ] Create group with friends only
- [ ] Group creation skips non-friends
- [ ] Invited members see group
- [ ] Leave group successfully
- [ ] Delete group (creator only)
- [ ] Cannot delete as non-creator
- [ ] Group removed from all members

### Messaging
- [ ] Send message to group
- [ ] Receive messages in real-time
- [ ] Messages show sender and timestamp
- [ ] Cannot message non-member group
- [ ] Messages persist after refresh
- [ ] Cannot send empty message

### UI/UX
- [ ] No chat flicker when opening group
- [ ] Message input always visible in chat
- [ ] Back button works reliably
- [ ] Friend request count badge updates
- [ ] All buttons respond to clicks
- [ ] Forms validate input

---

## 📞 SUPPORT

For issues or questions about the implementation:
1. Check browser console for errors
2. Verify Flask server is running (`http://localhost:5000/health`)
3. Check file permissions on `data/` directory
4. Verify all ports are available
5. Clear browser cache if UI issues persist

---

**Version**: 2.0  
**Last Updated**: April 25, 2026  
**Status**: Production Ready (with caveats - see Security section)
