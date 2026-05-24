# ========== IMPORTS ==========
import json
import os
import secrets
from datetime import datetime
from uuid import uuid4
from functools import wraps
import bcrypt
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS

# Import new crypto and group route modules
import crypto_routes
import group_routes
import auth

# ========== APPLICATION SETUP ==========
app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')

# ========== DATA DIRECTORY CONFIGURATION ==========
DATA_DIR = "data"
USERS_FILE = os.path.join(DATA_DIR, "users.json")
GROUPS_DIR = os.path.join(DATA_DIR, "groups")
MEMBERSHIPS_DIR = os.path.join(DATA_DIR, "memberships")
MESSAGES_DIR = os.path.join(DATA_DIR, "messages")
FRIENDS_DIR = os.path.join(DATA_DIR, "friends")
ROLES_DIR = os.path.join(DATA_DIR, "roles")
GROUP_KEYS_DIR = os.path.join(DATA_DIR, "group_keys")

# ========== DIRECTORY INITIALIZATION ==========
def initialize_directories():
    """Create all required data directories"""
    directories = [DATA_DIR, GROUPS_DIR, MEMBERSHIPS_DIR, MESSAGES_DIR, FRIENDS_DIR, ROLES_DIR, GROUP_KEYS_DIR]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)

initialize_directories()


def migrate_group_keys_to_history():
    """Migrate existing group key files using top-level `encrypted_group_key` into the new `keys` array format.
    This is idempotent and safe to run on every startup.
    """
    try:
        if not os.path.exists(GROUP_KEYS_DIR):
            return

        for fname in os.listdir(GROUP_KEYS_DIR):
            if not fname.endswith('.json'):
                continue
            path = os.path.join(GROUP_KEYS_DIR, fname)
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
            except Exception:
                continue

            # If file already contains `keys` array, skip
            if isinstance(data, dict) and isinstance(data.get('keys'), list):
                continue

            # If file contains legacy encrypted_group_key at top level, migrate
            if isinstance(data, dict) and data.get('encrypted_group_key'):
                encrypted = data.get('encrypted_group_key')
                saved_at = data.get('saved_at') or datetime.now().isoformat()
                migrated = {
                    'group_id': data.get('group_id'),
                    'username': data.get('username'),
                    'keys': [
                        {
                            'encrypted_group_key': encrypted,
                            'saved_at': saved_at
                        }
                    ]
                }
                # Overwrite file with migrated structure
                try:
                    with open(path, 'w') as f:
                        json.dump(migrated, f, indent=2)
                except Exception as e:
                    print(f"Failed to migrate {path}: {e}")
    except Exception as e:
        print(f"Error during group key migration: {e}")


# Perform migration at startup to ensure consistent key file format
migrate_group_keys_to_history()

# ========== CONFIGURE AUTH MODULE ==========
# Pass data directory paths to auth module for file operations
auth.set_users_file(USERS_FILE)
auth.set_groups_dir(GROUPS_DIR)
auth.set_memberships_dir(MEMBERSHIPS_DIR)
auth.set_roles_dir(ROLES_DIR)

# ========== SECURITY HEADERS MIDDLEWARE ==========
@app.after_request
def add_security_headers(response):
    """Add security headers to prevent attacks"""
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response

# ========== STATIC FILE SERVING ==========
@app.route("/", methods=["GET"])
def serve_root():
    """Serve the main application HTML file"""
    try:
        with open("index.html", "r") as f:
            html_content = f.read()
        return html_content, 200, {"Content-Type": "text/html"}
    except FileNotFoundError:
        return jsonify({"message": "Application file not found"}), 404

@app.route("/<path:filename>", methods=["GET"])
def serve_static(filename):
    """Serve static files (CSS, JS)"""
    try:
        # Security: only serve files from current directory
        # Prevent directory traversal attacks
        if ".." in filename or filename.startswith("/"):
            return jsonify({"message": "Access denied"}), 403
        
        # Determine content type
        content_type = "text/plain"
        if filename.endswith(".css"):
            content_type = "text/css"
        elif filename.endswith(".js"):
            content_type = "text/javascript"
        elif filename.endswith(".html"):
            content_type = "text/html"
        elif filename.endswith(".json"):
            content_type = "application/json"
        
        with open(filename, "r") as f:
            content = f.read()
        
        return content, 200, {"Content-Type": content_type}
    
    except FileNotFoundError:
        return jsonify({"message": "File not found"}), 404
    except Exception as e:
        print(f"Error serving {filename}: {str(e)}")
        return jsonify({"message": "Server error"}), 500

# ========== HELPER FUNCTIONS ==========
def load_json(file_path):
    """Load JSON data from file with error handling"""
    if not os.path.exists(file_path):
        return {}
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading JSON from {file_path}: {str(e)}")
        return {}

def save_json(file_path, data):
    """Save Python dictionary to JSON file"""
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory)
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving JSON to {file_path}: {str(e)}")

def load_users():
    """Load all registered users from storage"""
    return load_json(USERS_FILE)

def save_users(users):
    """Save all users to persistent storage"""
    save_json(USERS_FILE, users)


def save_group_key(group_id, username, encrypted_group_key):
    """Save encrypted group key for a specific user and group"""
    group_key_file = os.path.join(GROUP_KEYS_DIR, f"{group_id}_{username}.json")
    # Maintain history of keys for this user+group
    existing = load_json(group_key_file)
    if not existing or not isinstance(existing, dict):
        data = {
            "group_id": group_id,
            "username": username,
            "keys": []
        }
    else:
        data = existing
        if "keys" not in data or not isinstance(data.get("keys"), list):
            data["keys"] = []

    data["keys"].append({
        "encrypted_group_key": encrypted_group_key,
        "saved_at": datetime.now().isoformat()
    })

    save_json(group_key_file, data)


def load_group_key(group_id, username):
    """Load encrypted group key for a specific user and group"""
    group_key_file = os.path.join(GROUP_KEYS_DIR, f"{group_id}_{username}.json")
    data = load_json(group_key_file)
    # Return list of keys (may be empty)
    return data.get("keys", [])


def get_user_from_token(token):
    """Validate session token and return associated username"""
    if not token:
        return None
    users = load_users()
    for username, user_data in users.items():
        if user_data.get("temp_token") == token:
            return username
    return None

def get_token_from_request():
    """Extract authentication token from request"""
    # For GET requests, use the query parameter only.
    if request.method == "GET":
        return request.args.get("token")

    # For other methods, allow token in either query or JSON body.
    token = request.args.get("token")
    if token:
        return token

    if request.content_type and request.content_type.startswith("application/json"):
        data = request.get_json(silent=True) or {}
        return data.get("temp_token")

    return None

def require_auth(f):
    """Decorator to require valid authentication token"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            return jsonify({"message": "Token required"}), 401
        username = get_user_from_token(token)
        if not username:
            return jsonify({"message": "Invalid or expired token"}), 401
        return f(username, *args, **kwargs)
    return decorated_function

def check_membership(username, group_id):
    """Verify that user is a member of specified group"""
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    memberships = load_json(membership_file)
    if "groups" in memberships:
        if group_id in memberships["groups"]:
            return True
    return False

def get_user_role_in_group(username, group_id):
    """Get user's role in specific group"""
    roles_file = os.path.join(ROLES_DIR, f"{group_id}.json")
    roles_data = load_json(roles_file)
    if username in roles_data:
        return roles_data[username]
    return 'member'

def set_user_role_in_group(username, group_id, role):
    """Set user's role in specific group"""
    roles_file = os.path.join(ROLES_DIR, f"{group_id}.json")
    roles_data = load_json(roles_file)
    roles_data[username] = role
    save_json(roles_file, roles_data)

def find_group_id_by_name(group_name):
    """Search through all groups to find ID matching name"""
    if not os.path.exists(GROUPS_DIR):
        return None
    for filename in os.listdir(GROUPS_DIR):
        group_file = os.path.join(GROUPS_DIR, filename)
        group_data = load_json(group_file)
        if group_data.get("group_name") == group_name:
            group_id = filename.replace(".json", "")
            return group_id
    return None

def are_friends(user1, user2):
    """Verify two users are friends with each other"""
    user1_lower = user1.lower()
    user2_lower = user2.lower()
    user1_file = os.path.join(FRIENDS_DIR, f"{user1_lower}.json")
    user1_data = load_json(user1_file)
    if user2_lower in [f.lower() for f in user1_data.get("friends", [])]:
        return True
    return False

# ========== PASSWORD VALIDATION =========
def validate_password(password):
    """Validate password meets security requirements"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least 1 uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain at least 1 lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least 1 number"
    allowed_symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?"
    if not any(c in allowed_symbols for c in password):
        return False, f"Password must contain at least 1 symbol"
    return True, "Password is valid"

def validate_username(username):
    """Validate username meets security requirements"""
    if not username or len(username.strip()) == 0:
        return False, "Username cannot be empty"
    trimmed = username.strip()
    if len(trimmed) < 3:
        return False, "Username must be at least 3 characters"
    if len(trimmed) > 20:
        return False, "Username must not exceed 20 characters"
    if not all(c.isalnum() or c == '_' for c in trimmed):
        return False, "Username can only contain letters, numbers, and underscores"
    return True, "Username is valid"

# ========== AUTHENTICATION ROUTES =========
@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()}), 200

@app.route("/register", methods=["POST"])
def register():
    """Register new user account"""
    data = request.get_json()
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    is_valid_username, username_error = validate_username(username)
    if not is_valid_username:
        return jsonify({"message": username_error}), 400
    
    if not password:
        return jsonify({"message": "Password required"}), 400
    
    is_valid_password, password_error = validate_password(password)
    if not is_valid_password:
        return jsonify({"message": password_error}), 400
    
    users = load_users()
    existing_usernames = {u.lower(): u for u in users.keys()}
    
    if username.lower() in existing_usernames:
        return jsonify({"message": "Username already exists"}), 409
    
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    users[username] = {
        "password_hash": password_hash,
        "temp_token": None,
        "public_key": data.get("public_key"),
        "signature_public_key": data.get("signature_public_key"),
        "created_at": datetime.now().isoformat(),
        "role": "user"
    }
    
    save_users(users)
    
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    save_json(membership_file, {"groups": []})
    
    friend_file = os.path.join(FRIENDS_DIR, f"{username}.json")
    save_json(friend_file, {
        "friends": [],
        "incoming_requests": [],
        "outgoing_requests": []
    })
    
    return jsonify({"message": "Registration successful"}), 201

@app.route("/login", methods=["POST"])
def login():
    """Authenticate user and issue session token"""
    data = request.get_json()
    
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    username = data.get("username", "").strip()
    password = data.get("password", "")
    public_key = data.get("public_key")
    
    if not username:
        return jsonify({"message": "Invalid credentials"}), 401
    
    if not password:
        return jsonify({"message": "Invalid credentials"}), 401
    
    users = load_users()
    
    user_key = None
    for key in users.keys():
        if key.lower() == username.lower():
            user_key = key
            break
    
    if not user_key:
        return jsonify({"message": "Invalid credentials"}), 401
    
    user_data = users[user_key]
    password_hash = user_data.get("password_hash")
    
    if not password_hash or not bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8')):
        return jsonify({"message": "Invalid credentials"}), 401
    
    if public_key:
        user_data["public_key"] = public_key
    signature_public_key = data.get("signature_public_key")
    if signature_public_key:
        user_data["signature_public_key"] = signature_public_key
    
    token = secrets.token_urlsafe(32)
    user_data["temp_token"] = token
    user_data["last_login"] = datetime.now().isoformat()
    
    save_users(users)
    
    return jsonify({
        "token": token,
        "username": user_key,
        "message": "Login successful"
    }), 200

@app.route("/dev/reset", methods=["POST"])
def dev_reset():
    """Reset development data store when DEV_RESET_ENABLED=true."""
    dev_reset_enabled = os.environ.get("DEV_RESET_ENABLED", "false").lower() == "true"
    if not dev_reset_enabled:
        return jsonify({"message": "Dev reset disabled"}), 403

    reset_key = os.environ.get("DEV_RESET_KEY")
    request_data = request.get_json(silent=True) or {}
    if reset_key and request_data.get("reset_key") != reset_key:
        return jsonify({"message": "Invalid reset key"}), 403

    try:
        for root, _, files in os.walk(DATA_DIR):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                if os.path.isfile(file_path):
                    os.remove(file_path)

        initialize_directories()
        save_json(USERS_FILE, {})

        return jsonify({"message": "Development reset completed"}), 200
    except Exception as e:
        return jsonify({"message": f"Reset failed: {str(e)}"}), 500

# ========== FRIEND SYSTEM ROUTES =========
@app.route("/friend_request_send", methods=["POST"])
@require_auth
def send_friend_request(username):
    """Send friend request to target user"""
    data = request.get_json()
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    target_username = data.get("target_username", "").strip()
    if not target_username:
        return jsonify({"message": "Target username required"}), 400
    
    users = load_users()
    target_user_key = None
    for key in users.keys():
        if key.lower() == target_username.lower():
            target_user_key = key
            break
    
    if not target_user_key:
        return jsonify({"message": "User not found"}), 404
    
    if username.lower() == target_user_key.lower():
        return jsonify({"message": "Cannot send friend request to yourself"}), 400
    
    requester_file = os.path.join(FRIENDS_DIR, f"{username}.json")
    requester_data = load_json(requester_file)
    
    target_file = os.path.join(FRIENDS_DIR, f"{target_user_key}.json")
    target_data = load_json(target_file)
    
    friends_lower = [f.lower() for f in requester_data.get("friends", [])]
    if target_user_key.lower() in friends_lower:
        return jsonify({"message": "Already friends with this user"}), 409
    
    outgoing_lower = [f.lower() for f in requester_data.get("outgoing_requests", [])]
    if target_user_key.lower() in outgoing_lower:
        return jsonify({"message": "Friend request already sent"}), 409
    
    incoming_lower = [f.lower() for f in requester_data.get("incoming_requests", [])]
    if target_user_key.lower() in incoming_lower:
        return jsonify({"message": "This user already sent you a friend request"}), 409
    
    requester_data.setdefault("outgoing_requests", []).append(target_user_key)
    save_json(requester_file, requester_data)
    
    target_data.setdefault("incoming_requests", []).append(username)
    save_json(target_file, target_data)
    
    return jsonify({"message": "Friend request sent"}), 201

@app.route("/friend_requests", methods=["GET"])
@require_auth
def get_friend_requests(username):
    """Get incoming requests, outgoing requests, and friends list"""
    friend_file = os.path.join(FRIENDS_DIR, f"{username}.json")
    friend_data = load_json(friend_file)
    
    return jsonify({
        "incoming_requests": friend_data.get("incoming_requests", []),
        "outgoing_requests": friend_data.get("outgoing_requests", []),
        "friends": friend_data.get("friends", [])
    }), 200

@app.route("/public_key", methods=["GET"])
@require_auth
def get_public_key(username):
    """Retrieve the stored public key for a user"""
    target_username = request.args.get("username", "").strip()
    if not target_username:
        return jsonify({"message": "Username required"}), 400

    key_type = request.args.get("type", "encryption").strip().lower()
    users = load_users()
    target_user_data = None
    for key, user_data in users.items():
        if key.lower() == target_username.lower():
            target_user_data = user_data
            target_username = key
            break

    if not target_user_data:
        return jsonify({"message": "User not found"}), 404

    if key_type == "signature":
        public_key = target_user_data.get("signature_public_key") or target_user_data.get("public_key")
    else:
        public_key = target_user_data.get("public_key")

    if not public_key:
        return jsonify({"message": "Public key not found"}), 404

    return jsonify({"username": target_username, "public_key": public_key}), 200

@app.route("/group_key", methods=["GET"])
@require_auth
def get_group_key(username):
    """Retrieve the encrypted group key for a user in a group"""
    group_name = request.args.get("group", "").strip()
    if not group_name:
        return jsonify({"message": "Group name required"}), 400

    group_id = find_group_id_by_name(group_name)
    if not group_id:
        return jsonify({"message": "Group not found"}), 404

    if not check_membership(username, group_id):
        return jsonify({"message": "Access denied"}), 403

    encrypted_group_key = load_group_key(group_id, username)
    if not encrypted_group_key:
        return jsonify({"message": "Encrypted group key not found"}), 404

    return jsonify({"group_id": group_id, "encrypted_group_key": encrypted_group_key}), 200

@app.route("/friend_request_accept", methods=["POST"])
@require_auth
def accept_friend_request(username):
    """Accept incoming friend request"""
    data = request.get_json()
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    requester = data.get("requester", "").strip()
    if not requester:
        return jsonify({"message": "Requester username required"}), 400
    
    acceptor_file = os.path.join(FRIENDS_DIR, f"{username}.json")
    acceptor_data = load_json(acceptor_file)
    
    requester_file = os.path.join(FRIENDS_DIR, f"{requester}.json")
    requester_data = load_json(requester_file)
    
    incoming_lower = [f.lower() for f in acceptor_data.get("incoming_requests", [])]
    if requester.lower() not in incoming_lower:
        return jsonify({"message": "No friend request from this user"}), 404
    
    requester_original = None
    for req in acceptor_data.get("incoming_requests", []):
        if req.lower() == requester.lower():
            requester_original = req
            break
    
    if not requester_original:
        return jsonify({"message": "No friend request from this user"}), 404
    
    acceptor_data["incoming_requests"].remove(requester_original)
    
    outgoing = requester_data.get("outgoing_requests", [])
    outgoing_cleaned = [r for r in outgoing if r.lower() != username.lower()]
    requester_data["outgoing_requests"] = outgoing_cleaned
    
    acceptor_data.setdefault("friends", []).append(requester_original)
    requester_data.setdefault("friends", []).append(username)
    
    save_json(acceptor_file, acceptor_data)
    save_json(requester_file, requester_data)
    
    return jsonify({"message": "Friend request accepted"}), 200

@app.route("/friend_request_reject", methods=["POST"])
@require_auth
def reject_friend_request(username):
    """Reject incoming friend request"""
    data = request.get_json()
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    requester = data.get("requester", "").strip()
    if not requester:
        return jsonify({"message": "Requester username required"}), 400
    
    rejector_file = os.path.join(FRIENDS_DIR, f"{username}.json")
    rejector_data = load_json(rejector_file)
    
    requester_file = os.path.join(FRIENDS_DIR, f"{requester}.json")
    requester_data = load_json(requester_file)
    
    incoming_lower = [f.lower() for f in rejector_data.get("incoming_requests", [])]
    if requester.lower() not in incoming_lower:
        return jsonify({"message": "No friend request from this user"}), 404
    
    requester_original = None
    for req in rejector_data.get("incoming_requests", []):
        if req.lower() == requester.lower():
            requester_original = req
            break
    
    if not requester_original:
        return jsonify({"message": "No friend request from this user"}), 404
    
    rejector_data["incoming_requests"].remove(requester_original)
    
    outgoing = requester_data.get("outgoing_requests", [])
    outgoing_cleaned = [r for r in outgoing if r.lower() != username.lower()]
    requester_data["outgoing_requests"] = outgoing_cleaned
    
    save_json(rejector_file, rejector_data)
    save_json(requester_file, requester_data)
    
    return jsonify({"message": "Friend request rejected"}), 200

# ========== GROUP MANAGEMENT ROUTES =========
@app.route("/rooms", methods=["GET"])
@require_auth
def get_rooms(username):
    """Get all groups user is member of"""
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    memberships = load_json(membership_file)
    
    group_ids = memberships.get("groups", [])
    groups_list = []
    
    for group_id in group_ids:
        group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
        group_data = load_json(group_file)
        
        group_name = group_data.get("group_name", group_data.get("name", group_id))
        role = get_user_role_in_group(username, group_id)
        
        groups_list.append({
            "group_id": group_id,
            "group_name": group_name,
            "role": role,
            "creator": group_data.get("creator"),
            "created_at": group_data.get("created_at")
        })
    
    return jsonify({"groups": groups_list}), 200

# ========== MESSAGE ROUTES =========
@app.route("/messages", methods=["GET"])
@require_auth
def get_messages(username):
    """Get encrypted messages from group"""
    group_name = request.args.get("group")
    
    if not group_name:
        return jsonify({"message": "Group parameter required"}), 400
    
    group_id = find_group_id_by_name(group_name)
    
    if not group_id:
        return jsonify({"message": "Group not found"}), 404
    
    if not check_membership(username, group_id):
        return jsonify({"message": "Access denied"}), 403
    
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    messages_data = load_json(messages_file)
    
    messages = messages_data.get("messages", [])
    
    return jsonify({"messages": messages}), 200

@app.route("/messages", methods=["POST"])
@require_auth
def send_message(username):
    """Store encrypted message in group"""
    data = request.get_json()
    
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    group = data.get("group")
    
    if not group:
        return jsonify({"message": "Group required"}), 400
    
    ciphertext = data.get("ciphertext")
    
    if not ciphertext:
        return jsonify({"message": "Message cannot be empty"}), 400
    
    group_id = find_group_id_by_name(group)
    
    if not group_id:
        return jsonify({"message": "Group not found"}), 404
    
    if not check_membership(username, group_id):
        return jsonify({"message": "Access denied"}), 403
    
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    
    messages_data = load_json(messages_file)
    
    if "messages" not in messages_data:
        messages_data["messages"] = []
    
    nonce = data.get("nonce")
    signature = data.get("signature")
    
    message = {
        "sender": username,
        "text": ciphertext,
        "ciphertext": ciphertext,
        "timestamp": datetime.now().isoformat()
    }
    
    if nonce:
        message["nonce"] = nonce
    
    if signature:
        message["signature"] = signature
    
    messages_data["messages"].append(message)
    
    save_json(messages_file, messages_data)
    
    return jsonify({"message": "Message sent"}), 201

@app.route("/group_add", methods=["POST"])
@require_auth
def add_group(username):
    """Create new group with selected friends"""
    data = request.get_json()
    
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    group_name = data.get("groupname", "").strip()
    members = data.get("members", [])
    encrypted_group_keys = data.get("encrypted_group_keys", [])
    
    if not group_name:
        return jsonify({"message": "Group name required"}), 400
    
    group_id = str(uuid4())
    
    group_data = {
        "group_id": group_id,
        "group_name": group_name,
        "creator": username,
        "created_at": datetime.now().isoformat()
    }
    
    group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
    save_json(group_file, group_data)
    
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    memberships = load_json(membership_file)
    
    if "groups" not in memberships:
        memberships["groups"] = []
    
    if group_id not in memberships["groups"]:
        memberships["groups"].append(group_id)
    
    save_json(membership_file, memberships)
    
    set_user_role_in_group(username, group_id, "admin")
    
    users = load_users()
    
    for member in members:
        if not member:
            continue
        
        member = member.strip()
        
        if member.lower() == username.lower():
            continue
        
        member_key = None
        for key in users.keys():
            if key.lower() == member.lower():
                member_key = key
                break
        
        if not member_key:
            continue
        
        if not are_friends(username, member_key):
            continue
        
        member_file = os.path.join(MEMBERSHIPS_DIR, f"{member_key}.json")
        member_data = load_json(member_file)
        
        if "groups" not in member_data:
            member_data["groups"] = []
        
        if group_id not in member_data["groups"]:
            member_data["groups"].append(group_id)
        
        save_json(member_file, member_data)
        
        set_user_role_in_group(member_key, group_id, "member")

    for encrypted_item in encrypted_group_keys:
        target_username = encrypted_item.get("username")
        encrypted_key = encrypted_item.get("encrypted_group_key")
        if not target_username or not encrypted_key:
            continue
        save_group_key(group_id, target_username, encrypted_key)
    
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    save_json(messages_file, {"messages": []})
    
    return jsonify({
        "message": "Group created",
        "group_id": group_id
    }), 201

@app.route("/group_delete", methods=["POST"])
@require_auth
def delete_group(username):
    """Delete group (admin only)"""
    data = request.get_json()
    
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    group_name = data.get("group")
    
    if not group_name:
        return jsonify({"message": "Group required"}), 400
    
    group_id = find_group_id_by_name(group_name)
    
    if not group_id:
        return jsonify({"message": "Group not found"}), 404
    
    group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
    group_data = load_json(group_file)
    
    if group_data.get("creator") != username:
        return jsonify({"message": "Only creator can delete group"}), 403
    
    if os.path.exists(group_file):
        os.remove(group_file)
    
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    if os.path.exists(messages_file):
        os.remove(messages_file)
    
    roles_file = os.path.join(ROLES_DIR, f"{group_id}.json")
    if os.path.exists(roles_file):
        os.remove(roles_file)
    
    users = load_users()
    
    for user in users.keys():
        membership_file = os.path.join(MEMBERSHIPS_DIR, f"{user}.json")
        membership_data = load_json(membership_file)
        
        if "groups" in membership_data and group_id in membership_data["groups"]:
            membership_data["groups"].remove(group_id)
            save_json(membership_file, membership_data)
    
    return jsonify({"message": "Group deleted"}), 200

@app.route("/group_leave", methods=["POST"])
@require_auth
def leave_group(username):
    """Leave a group"""
    data = request.get_json()
    
    if not data:
        return jsonify({"message": "Request body required"}), 400
    
    group_name = data.get("group")
    
    if not group_name:
        return jsonify({"message": "Group required"}), 400
    
    group_id = find_group_id_by_name(group_name)
    
    if not group_id:
        return jsonify({"message": "Group not found"}), 404
    
    if not check_membership(username, group_id):
        return jsonify({"message": "Not a member of this group"}), 403
    
    group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
    group_data = load_json(group_file)
    
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    membership_data = load_json(membership_file)
    
    if group_id in membership_data.get("groups", []):
        membership_data["groups"].remove(group_id)
        save_json(membership_file, membership_data)
    
    all_users = load_users()
    members = []
    
    for user in all_users.keys():
        m_file = os.path.join(MEMBERSHIPS_DIR, f"{user}.json")
        m_data = load_json(m_file)
        
        if group_id in m_data.get("groups", []):
            members.append(user)
    
    if group_data.get("creator") == username:
        if members:
            new_admin = sorted(members)[0]
            group_data["creator"] = new_admin
            save_json(group_file, group_data)
            set_user_role_in_group(new_admin, group_id, "admin")
            return jsonify({"message": f"Left group. Admin transferred to {new_admin}"}), 200
        else:
            if os.path.exists(group_file):
                os.remove(group_file)
            messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
            if os.path.exists(messages_file):
                os.remove(messages_file)
            roles_file = os.path.join(ROLES_DIR, f"{group_id}.json")
            if os.path.exists(roles_file):
                os.remove(roles_file)
            return jsonify({"message": "Left group. Group deleted (no members left)"}), 200
    
    return jsonify({"message": "Left group successfully"}), 200

# ========== INITIALIZE MODULAR ROUTES ==========
# Create configuration dictionary for route modules
ROUTE_CONFIG = {
    'USERS_FILE': USERS_FILE,
    'GROUPS_DIR': GROUPS_DIR,
    'GROUP_KEYS_DIR': GROUP_KEYS_DIR,
    'MEMBERSHIPS_DIR': MEMBERSHIPS_DIR,
    'ROLES_DIR': ROLES_DIR,
    'MESSAGES_DIR': MESSAGES_DIR,
    'API_BASE': 'https://sikkerchat-p2.onrender.com'
}

# Initialize crypto routes (public key distribution, group key management)
# This handles /user_public_key, /user_public_keys_batch, /group_key_save, /group_key_load, /group_key_delete
crypto_routes.create_crypto_routes(app, auth, ROUTE_CONFIG)

# Initialize group routes (group creation, member management, message relay)
# This handles /group_create, /group_add_member, /group_remove_member, /group_leave, /message_send, /messages_get
group_routes.create_group_routes(app, crypto_routes, ROUTE_CONFIG)

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(error):
    """Handle requests to undefined endpoints"""
    return jsonify({"message": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle unexpected server errors"""
    print(f"Internal server error: {str(error)}")
    return jsonify({"message": "Internal server error"}), 500

# ========== APPLICATION ENTRY POINT ==========
if __name__ == "__main__":
    app.run(
        debug=os.environ.get('FLASK_DEBUG', False),
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000))
    )