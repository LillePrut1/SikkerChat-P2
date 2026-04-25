# Quick Start Guide - SikkerChat

## 🚀 Getting Started in 5 Minutes

### Step 1: Start the Server
```bash
cd SikkerChat-P22
python server.py
```

You should see:
```
 * Running on http://localhost:5000
 * Debug mode: on
```

### Step 2: Open the Application
Open your browser and navigate to:
```
file:///path/to/SikkerChat-P22/index.html
```

Or use a local server:
```bash
python -m http.server 8000
# Then open: http://localhost:8000
```

### Step 3: Create Test Accounts

**Account 1:**
- Username: `alice`
- Password: `password123`

**Account 2:**
- Username: `bob`
- Password: `password123`

Click **Register** tab and create both accounts.

---

## 📋 Test Workflow

### Test 1: Friend System
1. **Login as Alice**
   - Click "Add Friend"
   - Enter: `bob`
   - Click "Send Request"

2. **Login as Bob**
   - Refresh dashboard
   - See "Requests" section with Alice's request
   - Click "Accept"

3. **Check Results:**
   - Both should see each other in "Friends" list
   - Request count badge should clear

### Test 2: Group Creation
1. **As Alice**
   - Click "Create Group"
   - Name: `Project Alpha`
   - Select: `bob` (checkbox)
   - Click "Create Group"

2. **Verify:**
   - Group appears in "Groups" section for both

### Test 3: Messaging
1. **As Alice**
   - Click on `Project Alpha`
   - Type: "Hello Bob!"
   - Click Send

2. **As Bob**
   - Click on `Project Alpha`
   - See Alice's message
   - Type: "Hi Alice!"
   - Click Send

3. **As Alice**
   - See Bob's message

### Test 4: Leave & Delete
1. **As Bob**
   - In group chat
   - Click "Leave Group"
   - Confirm

2. **As Alice**
   - Click "Delete Group" (only option as creator)
   - Confirm

3. **Verify:**
   - Group removed from both users' groups list

---

## 🔍 What You're Testing

### Security Features Being Verified
✅ Friends can only be added with consent  
✅ Only friends can be in groups  
✅ Groups are permission-controlled  
✅ Messages only visible to members  
✅ Creators control group lifecycle  

### System Features
✅ Real-time UI updates  
✅ No flicker between states  
✅ Persistent sessions  
✅ Proper error handling  

---

## 🐛 Troubleshooting

### "Failed to connect to server"
- Check Flask is running: `http://localhost:5000/health`
- Verify port 5000 is available
- Check CORS is enabled in server.py

### "Login fails"
- Check username/password exactly match registration
- Clear browser cache
- Check `data/users.json` exists

### "Groups not showing"
- Refresh the page (F5)
- Check `data/groups/` directory has files
- Try creating a new group

### "Messages not loading"
- Verify you're a group member
- Check `data/messages/` has group message files
- Try sending a message first

### "Friend requests not showing"
- Check `data/friends/` has your user file
- Refresh dashboard (Ctrl+R)
- Try opening Friend Requests tab

---

## 📁 Data Files You Should See

After running tests, check `data/` directory:
```
data/
├── users.json              ← Your accounts
├── friends/
│   ├── alice.json         ← Alice's friends
│   └── bob.json           ← Bob's friends
├── groups/
│   └── {uuid}.json        ← Group metadata
├── memberships/
│   ├── alice.json         ← Alice's group memberships
│   └── bob.json           ← Bob's group memberships
└── messages/
    └── {uuid}.json        ← Messages in groups
```

---

## 🎮 Advanced Testing

### Test with 3+ Users
1. Create charlie account
2. Have alice send request to charlie
3. Charlie accepts
4. Create group with alice, bob, charlie
5. All three should see group and messages

### Test Reject Request
1. Alice sends request to diana
2. Diana rejects request
3. Verify request disappears from both sides
4. Try to create group with diana (should fail silently, skip member)

### Test Authorization
Try sending request without token:
```bash
curl -X POST http://localhost:5000/group_add \
  -H "Content-Type: application/json" \
  -d '{"groupname":"test"}'
# Should get: "Token required" error
```

---

## 📊 Expected Behavior

### First Login
- ✅ Friends list is empty
- ✅ No requests
- ✅ No groups
- ✅ "Add Friend" button visible
- ✅ "Create Group" button visible

### After Friend Request
- ✅ Request appears in recipient's "Requests"
- ✅ Request count badge shows "1"
- ✅ Sender sees outgoing request

### After Accept
- ✅ Both users see each other in "Friends"
- ✅ Request disappears
- ✅ Badge clears

### Group Creation
- ✅ Only friends available to select
- ✅ Non-friends are skipped silently
- ✅ Group appears immediately
- ✅ All members see it

### In Chat
- ✅ Messages appear with sender name
- ✅ Messages show timestamp
- ✅ Own messages highlighted differently
- ✅ Message input always visible
- ✅ Back button returns to dashboard

---

## 🔑 Key Differences from Old System

| Feature | Old | New |
|---------|-----|-----|
| Add users | Anyone, no consent | Friends only with acceptance |
| Friend system | None | Full request/accept flow |
| Group creation | Free-form text | Select from friends |
| Permissions | Basic membership | Strict validation |
| UI stability | Flickering | Solid, no flicker |
| State management | Scattered | Centralized in appState |

---

## ✅ You're Done When:

- [x] Both accounts created
- [x] Friend requests working
- [x] Groups only include friends
- [x] Messages send/receive
- [x] No UI flicker
- [x] Back button works
- [x] Leave/delete work
- [x] All files in `data/` directory

---

## 📞 Next Steps

### If Everything Works:
1. ✅ System is production-ready (locally)
2. 📝 Review `SECURE_ARCHITECTURE.md` for details
3. 🔐 Consider the security enhancements in that doc
4. 🚀 Deploy or extend as needed

### If Issues Occur:
1. Check Flask console for error messages
2. Check browser console (F12 → Console tab)
3. Verify file permissions in `data/` directory
4. Check network tab to see API responses
5. Clear localStorage: `localStorage.clear()` in console

---

**Good luck! 🎉**
