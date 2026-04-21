from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import bcrypt
import time
import secrets  # Added for token generation
import os  # Added for file checks

app = Flask(__name__)
CORS(app)

# Helper function: read JSON
def load_json(path):
    with open(path, "r") as f:
        return json.load(f)

# Helper function: write JSON
def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

# ----------------------
# User registration
# ----------------------
@app.post("/register")
def register():
    users = load_json("data/users.json")
    data = request.json
    
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Missing username/password"}), 400

    # Check if user exists
    if any(u["username"] == username for u in users):
        return jsonify({"error": "User already exists"}), 409

    # Hash password
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    # Save user
    users.append({
        "username": username,
        "password_hash": password_hash
    })
    save_json("data/users.json", users)

    return jsonify({"message": "User registered!"}), 201

# ----------------------
# Updated get messages (now uses query params for group)
# ----------------------
@app.get("/messages")
def get_message():
    user = check_token()
    if not user:
        return jsonify({"error": "Invalid token"}), 401
    groupname = request.args.get("group")
    if not groupname:
        return jsonify({"error": "Missing group"}), 400
    group = check_group_membership(user)
    if not group or group[0] != groupname:
        return jsonify({"error": "Du er ikke medlem af denne gruppe"}), 403
    _, groupkey = group
    messages = load_json(f"data/groups/{groupname}.json")
    return jsonify({"messages": messages["messages"], "group_key": groupkey}), 200

# ----------------------
# Updated add message (expects group and temp_token)
# ----------------------
@app.post("/messages")
def post_message():
    data = request.get_json()
    ciphertext = data.get("ciphertext")
    groupname = data.get("group")
    user = check_token()
    if not user:
        return jsonify({"error": "Invalid token"}), 401
    group = check_group_membership(user)
    if not group or group[0] != groupname:
        return jsonify({"error": "Du er ikke medlem af denne gruppe"}), 403
    messages = load_json(f"data/groups/{groupname}.json")
    messages["messages"].append({"ciphertext": ciphertext, "timestamp": int(time.time()), "sender": user})
    save_json(f"data/groups/{groupname}.json", messages)
    return jsonify({"message": "Besked modtaget"}), 200

# ----------------------
# New functions added from backup
# ----------------------
def check_token():
    data = request.get_json()
    token = data.get("temp_token")
    users = load_json("data/users.json")
    user = None
    for u in users:
        if u.get("temp_token") == token:
            user = u["username"]
            break
    if user is None:
        return None
    return user

def check_group_membership(user):
    data = request.get_json()
    groupname = data.get("group")
    memberships = load_json(f"data/usergroup/{user}.json")
    groupkey = next((x["groupkey"] for x in memberships if x["groupname"] == groupname), None)
    if groupkey:
        return groupname, groupkey
    return None

@app.post("/login")
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")
    password_bytes = password.encode("utf-8")
    users = load_json("data/users.json")
    user_data = next((u for u in users if u["username"] == username), None)
    if not user_data or not bcrypt.checkpw(password_bytes, user_data["password_hash"].encode()):
        return jsonify({"error": "Username or password wrong"}), 401
    token = secrets.token_urlsafe(32)
    user_data["temp_token"] = token
    save_json("data/users.json", users)
    return jsonify({"message": "Login successful", "token": token}), 200

@app.get("/rooms")
def get_rooms():
    user = check_token()
    if not user:
        return jsonify({"error": "Invalid token"}), 401
    user_rooms = load_json(f"data/usergroup/{user}.json")
    groups = [item["groupname"] for item in user_rooms]
    return jsonify({"groups": groups}), 200

@app.post("/group_add")
def group_add():
    user = check_token()
    if not user:
        return jsonify({"error": "Invalid token"}), 401
    data = request.get_json()
    groupname = data.get("groupname")
    if os.path.exists(f"data/groups/{groupname}.json"):
        return jsonify({"error": "Group already exists"}), 400
    initial_data = {"members": [user], "admin": [user], "messages": []}
    save_json(f"data/groups/{groupname}.json", initial_data)
    return jsonify({"message": "Group created"}), 200

# ----------------------
# Start server (Specificeret till Render)
# ----------------------

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)