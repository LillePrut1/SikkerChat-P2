from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import bcrypt
import time
import jwt  # PyJWT for token handling
import os

app = Flask(__name__)
CORS(app)

# secret key for JWT (override with env variable in production)
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")

# simple decorator to require authentication via Bearer token
from functools import wraps

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.PyJWTError:
            return jsonify({"error": "Unauthorized"}), 401
        # attach username to request for later use if needed
        request.user = payload.get("username")
        return f(*args, **kwargs)
    return wrapper

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
# User login
# ----------------------
@app.post("/login")
def login():
    users = load_json("data/users.json")
    data = request.json

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Missing username/password"}), 400

    # find user
    user = next((u for u in users if u["username"] == username), None)
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    # verify password
    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid credentials"}), 401

    # create JWT
    token = jwt.encode({
        "username": username,
        "exp": time.time() + 3600  # 1 hour expiry
    }, SECRET_KEY, algorithm="HS256")
    return jsonify({"message": "Login successful", "token": token}), 200


# ----------------------
# Get all messages
# ----------------------
@app.get("/messages")
@require_auth
def get_messages():
    messages = load_json("data/messages.json")
    return jsonify(messages)


# ----------------------
# Add new message
# ----------------------
@app.post("/messages")
@require_auth
def add_message():
    messages = load_json("data/messages.json")
    data = request.json

    msg = {
        "sender": data.get("sender", "Unknown"),
        "ciphertext": data.get("ciphertext", ""),
        "timestamp": time.time(),
        # optionally record user from token
        "author": request.user
    }

    messages.append(msg)
    save_json("data/messages.json", messages)

    return jsonify({"message": "Message stored!"}), 201


# ----------------------
# Start server (Specificeret till Render)
# ----------------------

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)