# SikkerChat - Visual Architecture & Flow Diagrams

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     HTML/CSS/JavaScript                      │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │          Auth Screen (Login/Register)              │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │            Dashboard (Friends/Groups)               │    │  │
│  │  │                                                      │    │  │
│  │  │  ┌─────────────────────────────────────────────┐    │    │  │
│  │  │  │       Chat View (Messages/Input)            │    │    │  │
│  │  │  │  ┌──────────────────────────────────────┐  │    │    │  │
│  │  │  │  │   Message Container                │  │    │    │  │
│  │  │  │  │  (displays messages)               │  │    │    │  │
│  │  │  │  └──────────────────────────────────────┘  │    │    │  │
│  │  │  │  ┌──────────────────────────────────────┐  │    │    │  │
│  │  │  │  │   Message Input Section              │  │    │    │  │
│  │  │  │  │  (input bar + send button)          │  │    │    │  │
│  │  │  │  └──────────────────────────────────────┘  │    │    │  │
│  │  │  └─────────────────────────────────────────────┘    │    │  │
│  │  │                                                      │    │  │
│  │  │  ┌─────────────────────────────────────────────┐    │    │  │
│  │  │  │      Control Panel (Options)               │    │    │  │
│  │  │  │  (Add Friend / Create Group buttons)       │    │    │  │
│  │  │  └─────────────────────────────────────────────┘    │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                   HTTP REST API (JSON)
                             │
┌────────────────────────────┴─────────────────────────────────────────┐
│                          FLASK BACKEND                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Route Handlers                            │  │
│  │                                                              │  │
│  │  POST /login      ────→ Authenticate user                  │  │
│  │  POST /register   ────→ Create new user                    │  │
│  │  POST /messages   ────→ Save message                       │  │
│  │  GET /messages    ────→ Load message history              │  │
│  │  POST /group_add  ────→ Create group                      │  │
│  │  GET /rooms       ────→ Load user's groups                │  │
│  │                                                              │  │
│  │  + Friend routes, group management, etc.                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                       │
│                   File I/O Operations                               │
│                             │                                       │
│  ┌──────────────────────────┴─────────────────────────────────┐    │
│  │        JSON File Storage (data/ directory)                │    │
│  │                                                            │    │
│  │  ├─ users.json          (account info)                   │    │
│  │  ├─ friends/             (friend relationships)           │    │
│  │  ├─ groups/              (group metadata)                │    │
│  │  ├─ memberships/         (user-to-groups)               │    │
│  │  └─ messages/            (message history)              │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Chat View State Machine

```
                    ┌─────────────────────┐
                    │    DASHBOARD        │
                    │  (Control Panel)    │
                    └──────────┬──────────┘
                               │
                  User clicks group in sidebar
                               │
                               ▼
        ┌──────────────────────────────────────────┐
        │   openChat(groupName) called             │
        │   ├─ Set currentChatName                 │
        │   ├─ Mark group as active                │
        │   └─ Call showChatView()                 │
        └──────────────────┬───────────────────────┘
                           │
        ┌──────────────────┴───────────────────────┐
        │      showChatView() Logic                 │
        ├─ Hide controlPanel (.hidden)             │
        ├─ Remove chatView .hidden class           │
        ├─ Add chatView .active class ✓ FIXED     │
        └─ Add chatHeader .active class            │
        │                  │                        │
        │      CSS Evaluation:                      │
        │   .chat-view.active { display: flex }   │
        │      flex: 1 makes it expand ✓ FIXED    │
        │                  │                        │
        └──────────────────┴───────────────────────┘
                           │
        ┌──────────────────┴───────────────────────┐
        │   loadMessages(groupName) called         │
        │   ├─ Fetch from API /messages            │
        │   ├─ Update appState.currentMessages     │
        │   └─ Call renderMessages()               │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │      CHAT VIEW - ACTIVE                  │
        │  ┌──────────────────────────────────┐   │
        │  │ Messages displayed               │   │
        │  └──────────────────────────────────┘   │
        │  ┌──────────────────────────────────┐   │
        │  │ Input bar visible & ready ✓      │   │
        │  └──────────────────────────────────┘   │
        └────────────────┬───────────────────────┘
                        │
         User types message and clicks Send
                        │
                        ▼
        ┌──────────────────────────────────────────┐
        │   sendMessage(groupName, text)           │
        │   ├─ POST to API /messages               │
        │   └─ Call loadMessages() to refresh      │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │      CHAT VIEW - STILL ACTIVE            │
        │  (User stays in chat, not kicked out)    │
        │  ├─ Input cleared                        │
        │  ├─ New message appears                  │
        │  └─ Ready for next message               │
        └────────────────┬───────────────────────┘
                        │
           User clicks Back button
                        │
                        ▼
        ┌──────────────────────────────────────────┐
        │   showControlPanel() called              │
        │   ├─ Show controlPanel (.hidden removed) │
        │   ├─ Hide chatView (.hidden added)       │
        │   ├─ Remove chatView .active class ✓    │
        │   └─ Reset currentChatName = null        │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │    DASHBOARD        │
                    │  (Control Panel)    │
                    └─────────────────────┘
```

---

## CSS Layout Flex Diagram

```
main-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

┌──────────────────────────────────────────────────┐
│           main-content (100% height)             │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │       chat-header (fixed: 50px)           │  │
│  │  testgroup | [Leave] [Delete] [Back]      │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │   FLEX ITEM 1: control-panel (flex: 1)   │  │
│  │   OR                                      │  │
│  │   FLEX ITEM 2: chat-view (flex: 1)       │  │
│  │                                          │  │
│  │   When control-panel shown:              │  │
│  │   ├─ control-panel [flex: 1] → 100%      │  │
│  │   └─ chat-view [display: none] → 0%      │  │
│  │                                          │  │
│  │   When chat-view shown (active):         │  │
│  │   ├─ control-panel [display: none] → 0%  │  │
│  │   └─ chat-view [flex: 1] → 100%          │  │
│  │       ├─ message-container [flex: 1]     │  │
│  │       │  ├─ [Message 1]                  │  │
│  │       │  ├─ [Message 2]                  │  │
│  │       │  ├─ [overflow-y: auto]           │  │
│  │       │  └─ [scrollable]                 │  │
│  │       └─ message-input-section           │  │
│  │          ├─ [Input field]                │  │
│  │          └─ [Send button]                │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User clicks "testgroup" in sidebar                         │
│  2. attachChatListeners() detects click (event delegation)     │
│  3. Calls openChat("testgroup")                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │   Update Frontend State   │
        ├─────────────┬─────────────┤
        │                           │
        ▼                           ▼
    currentChatName =          appState
    "testgroup"                 (no change)
        │                           │
        └─────────────┬─────────────┘
                      │
        ┌─────────────┴──────────────────┐
        │   Update UI (showChatView())   │
        ├─────────────┬──────────────────┤
        │                                │
        ├─ Hide controlPanel            │
        ├─ Show chatView                │
        ├─ Add .active class ✓ FIXED  │
        └─ CSS flex layout activates    │
                      │
        ┌─────────────┴─────────────────────────┐
        │   Load Data (loadMessages())          │
        ├─────────────┬───────────────────────┤
        │                                     │
        ▼                                     │
    HTTP GET /messages?group=testgroup       │
        │                                     │
        ▼                                     │
    Backend searches messages/testgroup.json  │
        │                                     │
        ▼                                     │
    Returns JSON array of messages           │
        │                                     │
        ▼                                     │
    JavaScript receives response             │
        │                                     │
        ├─ appState.currentMessages = data   │
        │                                     │
        ▼                                     │
    renderMessages() called
        │
        ├─ Clear messageContainer
        ├─ Loop through appState.currentMessages
        ├─ Create DOM elements for each message
        ├─ Add sender, text, timestamp
        ├─ Append to container
        └─ Scroll to bottom
        │
        ▼
    ┌──────────────────────────────────────┐
    │   USER SEES:                         │
    │  ┌──────────────────────────────┐   │
    │  │ Chat View                    │   │
    │  │ - Previous messages displayed│   │
    │  │ - Input bar at bottom visible│   │
    │  │ - Ready to type message      │   │
    │  └──────────────────────────────┘   │
    └──────────────────────────────────────┘
        │
        │ User types "Hello!" and clicks Send
        │
        ▼
    ┌──────────────────────────────────────┐
    │   Send Message (sendMessage())       │
    ├──────────────────────────────────────┤
    │                                      │
    ├─ Get message from input field        │
    ├─ POST to API /messages               │
    │  {                                   │
    │    temp_token: "...",               │
    │    ciphertext: "Hello!",            │
    │    group: "testgroup"               │
    │  }                                   │
    │                                      │
    ▼                                      │
    Backend receives POST                  │
    │                                      │
    ├─ Validates token                    │
    ├─ Validates user is group member     │
    ├─ Creates message object             │
    ├─ Appends to data/messages/testgroup │
    │                                      │
    ▼                                      │
    Returns 201 Created                    │
    │                                      │
    ├─ Clear input field                   │
    ├─ Call loadMessages() to refresh      │
    │                                      │
    ▼                                      │
    Messages reload (same flow as above)
    │
    ▼
    New message appears in chat
    User stays in chat view ✓ (not kicked out)
```

---

## Bug Fix Impact Visualization

```
BEFORE FIX (BROKEN):

User Click
    ↓
openChat()
    ↓
showChatView() ← BUG #1: Doesn't add .active class
    ├─ remove .hidden ✓
    ├─ add .active ✗ MISSING
    └─ CSS rule doesn't trigger ✗
        │
        ▼
    CSS Calculation:
    ├─ .chat-view { display: none; }
    ├─ .chat-view.active { display: flex !important; }
    │  BUT .active class not added!
    └─ Result: display: none ✗ WINS
        │
        ▼
    Chat View NOT VISIBLE ❌
    loadMessages() loads data but
    User can't see messages ❌
    Input bar invisible ❌


AFTER FIX (WORKING):

User Click
    ↓
openChat()
    ↓
showChatView() ✓ FIXED: Now adds .active class
    ├─ remove .hidden ✓
    ├─ add .active ✓ FIXED!
    └─ CSS rule triggers ✓
        │
        ▼
    CSS Calculation:
    ├─ .chat-view { display: none; flex: 1; }
    ├─ .chat-view.active { display: flex !important; }
    │  .active class IS added! ✓
    └─ Result: display: flex !important ✓ WINS
        │
        ▼
    Chat View VISIBLE ✅
    flex: 1 allocates space ✅
    Layout expands properly ✅
    Messages display ✅
    Input bar visible ✅
    User can type/send ✅
```

---

## Frontend State Management Model

```
┌───────────────────────────────────────┐
│   Global Variables & appState         │
├───────────────────────────────────────┤
│                                       │
│  currentUsername: "alice"             │
│  authToken: "token_string..."         │
│  currentChatName: "testgroup"         │
│                                       │
│  appState: {                          │
│    friends: ["bob", "charlie"],      │
│    groups: ["testgroup", "team"],    │
│    currentMessages: [{...}],         │
│    incomingRequests: [],             │
│    outgoingRequests: []              │
│  }                                   │
│                                       │
└───────────────────────────────────────┘
         │                  │
         │                  │
    ┌────▼──────────┐   ┌──▼────────────┐
    │ Event Handler │   │ Data Loader   │
    ├───────────────┤   ├───────────────┤
    │               │   │               │
    │ attachChatL.. │   │ loadMessages()│
    │ → openChat()  │   │ renderMessages
    │ → showChatV.. │   │               │
    │ → sendMessage │   │               │
    │               │   │               │
    └────┬──────────┘   └──┬────────────┘
         │                  │
         └──────┬───────────┘
                │
        ┌───────▼──────────────────┐
        │   Render Functions       │
        ├──────────────────────────┤
        │                          │
        │ renderDashboard()        │
        │ renderFriendsList()      │
        │ renderGroupsList()       │
        │ renderMessages()         │
        │ renderRequestsList()     │
        │                          │
        └──────────┬───────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │   DOM Manipulation       │
        ├──────────────────────────┤
        │                          │
        │ Update HTML elements     │
        │ Update CSS classes       │
        │ Add/remove listeners     │
        │ Modify styles            │
        │                          │
        └──────────┬───────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │   Browser Renders        │
        ├──────────────────────────┤
        │                          │
        │ Layout calculation       │
        │ CSS rules applied        │
        │ Elements positioned      │
        │ Content displayed        │
        │                          │
        └──────────────────────────┘
```

---

## Message Rendering Pipeline

```
┌─────────────────────────┐
│  loadMessages() called   │ ← triggered by openChat() or sendMessage()
└────────────┬────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ HTTP GET /messages         │
    │ ?group=testgroup&token=..  │
    └────────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────────────┐
        │ Backend processes request      │
        │ - Validates token             │
        │ - Checks group membership     │
        │ - Loads messages file         │
        │ - Returns JSON array          │
        └────────────┬───────────────────┘
                     │
                     ▼
            ┌────────────────────────────┐
            │ Frontend receives response  │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ appState.currentMessages   │
            │ = data.messages            │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ renderMessages() called    │
            └────────────┬───────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
    Clear container              Loop through messages
    innerHTML = ""               for (let msg of appState...)
        │                            │
        │                            ▼
        │                        Create <div class="message">
        │                            │
        │                            ├─ <div class="message-sender">
        │                            │  sender name
        │                            │
        │                            ├─ <div class="message-text">
        │                            │  message content
        │                            │
        │                            └─ <div class="message-timestamp">
        │                               time
        │
        ▼
    ┌──────────────────────────────┐
    │ appendChild to container      │
    └────────────┬─────────────────┘
                 │
                 ▼
    ┌──────────────────────────────┐
    │ Scroll to bottom             │
    │ container.scrollTop =        │
    │   container.scrollHeight     │
    └────────────┬─────────────────┘
                 │
                 ▼
    ┌──────────────────────────────┐
    │ Browser renders messages     │
    │ User sees chat content       │
    └──────────────────────────────┘
```

---

## Complete User Journey Map

```
                    ┌──────────────┐
                    │   START      │
                    │   (Homepage) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Login/Reg   │
                    │  Screen      │
                    └──────┬───────┘
                           │
              Enter credentials and submit
                           │
                    ┌──────▼───────────────────┐
                    │  Backend Auth            │
                    │  - Validate password     │
                    │  - Generate token       │
                    │  - Save token to local  │
                    └──────┬───────────────────┘
                           │
                    ┌──────▼───────┐
                    │  Dashboard   │
                    │  (Friends)   │ ← showDashboard() called
                    │  (Groups)    │ ← showControlPanel() called
                    │  (Requests)  │ ← renderDashboard() called
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    Add Friend      Create Group      Click Group
        │                  │                  │
        ▼                  ▼                  ▼
    ┌──────────┐    ┌────────────┐    ┌───────────────┐
    │Send Friend│   │Select       │   │openChat()     │
    │Request    │   │Members      │   │showChatView() │← BUG FIXED HERE
    │dialog     │   │Name group   │   │loadMessages() │
    │           │   │Create       │   │renderMessages │
    └──────────┘    └────────────┘    └───────────────┘
        │                  │                  │
        │                  │            ┌─────▼──────────┐
        │                  │            │  CHAT VIEW     │
        │                  │            │  (Messages)    │
        │                  │            │  (Input bar)   │
        │                  │            │  (Buttons)     │
        │                  │            └─────┬──────────┘
        │                  │                  │
        │                  │          Type message & Send
        │                  │                  │
        │                  │          ┌───────▼────────┐
        │                  │          │sendMessage()   │
        │                  │          │POST /messages  │
        │                  │          │loadMessages()  │
        │                  │          │renderMessages  │
        │                  │          └───────┬────────┘
        │                  │                  │
        │                  │          ┌───────▼────────┐
        │                  │          │Message appears │
        │                  │          │Stay in chat ✓  │
        │                  │          └───────┬────────┘
        │                  │                  │
        │                  │          Click Back
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────────┐
                    │ Return to       │
                    │ Dashboard       │ ← showControlPanel() called
                    │ Control Panel   │
                    └──────┬──────────┘
                           │
                           ▼
                    (Loop back to Dashboard options)
```

---

**All diagrams created:** May 12, 2026  
**Status:** Ready for reference and documentation

