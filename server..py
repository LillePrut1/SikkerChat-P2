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
    messages = load_json("data/messages.json")
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
        "timestamp": time.time()
    }

    messages.append(msg)
    save_json("data/messages.json", messages)

    return jsonify({"message": "Message stored!"}), 201


# ----------------------
# Start server
# ----------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
