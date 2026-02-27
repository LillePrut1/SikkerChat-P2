from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import bcrypt
import time

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
# Get all messages
# ----------------------
@app.get("/messages")
def get_messages():
    # optionally filter by room via query param
    room = request.args.get("room")
    messages = load_json("data/messages.json")
    if room:
        messages = [m for m in messages if m.get("room") == room]
    return jsonify(messages)


# ----------------------
# Add new message
# ----------------------
@app.post("/messages")
def add_message():
    messages = load_json("data/messages.json")
    data = request.json

    msg = {
        "sender": data.get("sender", "Unknown"),
        "ciphertext": data.get("ciphertext", ""),
        "timestamp": time.time(),
        # room allows multiple chatrooms; default to Prototype if not supplied
        "room": data.get("room", "Prototype")
    }

    messages.append(msg)
    save_json("data/messages.json", messages)

    return jsonify({"message": "Message stored!"}), 201


# ----------------------
# Rooms endpoints (persistent list)
# ----------------------

# we keep a simple JSON array of room names. if the file is missing we
# treat it as an empty list. rooms are separate from messages so that
# clients can create a room before posting a message in it.
ROOMS_FILE = "data/rooms.json"

@app.get("/rooms")
def get_rooms():
    # load stored rooms and also include any rooms that appear in
    # messages just in case someone posted directly to the API.
    try:
        rooms = load_json(ROOMS_FILE)
    except FileNotFoundError:
        rooms = []

    # merge in from messages to keep backwards compatibility
    messages = load_json("data/messages.json")
    for m in messages:
        r = m.get("room", "Prototype")
        if r and r not in rooms:
            rooms.append(r)

    return jsonify(sorted(rooms))

@app.post("/rooms")
def add_room():
    data = request.json
    name = (data.get("room") or "").strip()
    if not name:
        return jsonify({"error": "Missing room name"}), 400

    try:
        rooms = load_json(ROOMS_FILE)
    except FileNotFoundError:
        rooms = []

    if name in rooms:
        return jsonify({"error": "Room already exists"}), 409

    rooms.append(name)
    save_json(ROOMS_FILE, rooms)
    return jsonify({"message": "Room created"}), 201

# ----------------------
# Start server (Specificeret till Render)
# ----------------------

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)