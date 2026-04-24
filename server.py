# Import Flask web framework for creating HTTP server
from flask import Flask, request, jsonify

# Import bcrypt library for secure password hashing
import bcrypt

# Import secrets library for generating secure random tokens
import secrets

# Import json library for reading and writing JSON files
import json

# Import os library for file system operations
import os

# Import uuid library for generating unique group IDs
from uuid import uuid4

# Import datetime for storing message timestamps
from datetime import datetime

# Import CORS to allow requests from frontend JavaScript
from flask_cors import CORS

# ========== APPLICATION SETUP ==========

# Create Flask application instance
app = Flask(__name__)

# Enable CORS for all routes to allow browser requests
CORS(app)

# Define base directory path for data storage
DATA_DIR = "data"

# Define path to users JSON file
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# Define path to directory containing group files
GROUPS_DIR = os.path.join(DATA_DIR, "groups")

# Define path to directory containing membership files
MEMBERSHIPS_DIR = os.path.join(DATA_DIR, "memberships")

# Define path to directory containing message files
MESSAGES_DIR = os.path.join(DATA_DIR, "messages")

# ========== DIRECTORY INITIALIZATION ==========

# Create data directory if it does not exist
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# Create groups directory if it does not exist
if not os.path.exists(GROUPS_DIR):
    os.makedirs(GROUPS_DIR)

# Create memberships directory if it does not exist
if not os.path.exists(MEMBERSHIPS_DIR):
    os.makedirs(MEMBERSHIPS_DIR)

# Create messages directory if it does not exist
if not os.path.exists(MESSAGES_DIR):
    os.makedirs(MESSAGES_DIR)

# ========== HELPER FUNCTIONS ==========

# Load JSON data from a file path
def load_json(file_path):
    """Load data from JSON file, return empty dict if file not found"""
    # Check if file path exists
    if not os.path.exists(file_path):
        # Return empty dictionary if file doesn't exist
        return {}
    
    # Try to read and parse file
    try:
        # Open file in read mode
        with open(file_path, 'r') as f:
            # Parse JSON content and return
            return json.load(f)
    # Catch any errors while reading
    except:
        # Return empty dictionary on error
        return {}

# Save JSON data to a file path
def save_json(file_path, data):
    """Save data to JSON file with directory creation"""
    # Get directory path from file path
    directory = os.path.dirname(file_path)
    
    # Create directory if path is not empty and doesn't exist
    if directory and not os.path.exists(directory):
        # Create all parent directories
        os.makedirs(directory)
    
    # Open file in write mode
    with open(file_path, 'w') as f:
        # Write data as formatted JSON
        json.dump(data, f, indent=2)

# Load all user data from users.json file
def load_users():
    """Load all registered users from storage"""
    # Load and return users JSON file
    return load_json(USERS_FILE)

# Save all user data to users.json file
def save_users(users):
    """Save all users to storage"""
    # Save users dictionary to JSON file
    save_json(USERS_FILE, users)

# Get username associated with a token
def get_user_from_token(token):
    """Validate token and return associated username"""
    # Load all users from storage
    users = load_users()
    
    # Loop through each user in dictionary
    for username, user_data in users.items():
        # Check if token matches this user's stored token
        if user_data.get("temp_token") == token:
            # Return username if token is valid
            return username
    
    # Return None if token not found
    return None

# Extract and validate token from request
def get_token_from_request():
    """Extract token from request body"""
    # Get JSON data from request body
    data = request.get_json() or {}
    
    # Extract temp_token from request data
    token = data.get("temp_token")
    
    # Return token (may be None)
    return token

# Check if user is member of group
def check_membership(username, group_id):
    """Verify user belongs to specified group"""
    # Build file path for user's membership file
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    
    # Load user's membership data
    memberships = load_json(membership_file)
    
    # Check if groups list exists in memberships
    if "groups" in memberships:
        # Check if group_id is in user's groups
        if group_id in memberships["groups"]:
            # Return True if user is member
            return True
    
    # Return False if user is not member
    return False

# Find group ID by group name
def find_group_id_by_name(group_name):
    """Search through all groups to find ID matching name"""
    # Check if groups directory exists
    if not os.path.exists(GROUPS_DIR):
        # Return None if directory doesn't exist
        return None
    
    # Loop through all files in groups directory
    for filename in os.listdir(GROUPS_DIR):
        # Build full path to group file
        group_file = os.path.join(GROUPS_DIR, filename)
        
        # Load group data
        group_data = load_json(group_file)
        
        # Check if group name matches
        if group_data.get("group_name") == group_name:
            # Extract group ID by removing .json extension
            group_id = filename.replace(".json", "")
            # Return found group ID
            return group_id
    
    # Return None if group not found
    return None

# ========== AUTHENTICATION ROUTES ==========

# Health check endpoint to verify server is running
@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint for server status"""
    # Return JSON response indicating server is operational
    return jsonify({"status": "ok"}), 200

# Register new user with username and password
@app.route("/register", methods=["POST"])
def register():
    """Register new user account"""
    # Get JSON data from request body
    data = request.get_json()
    
    # Check if request body contains data
    if not data:
        # Return error if no data provided
        return jsonify({"message": "Request body required"}), 400
    
    # Extract username from request data
    username = data.get("username", "").strip()
    
    # Extract password from request data
    password = data.get("password", "")
    
    # Validate username was provided
    if not username:
        # Return error if username is empty
        return jsonify({"message": "Username required"}), 400
    
    # Validate password was provided
    if not password:
        # Return error if password is empty
        return jsonify({"message": "Password required"}), 400
    
    # Validate password meets minimum length
    if len(password) < 6:
        # Return error if password too short
        return jsonify({"message": "Password must be at least 6 characters"}), 400
    
    # Load all existing users from storage
    users = load_users()
    
    # Check if username already exists
    if username in users:
        # Return error if username taken
        return jsonify({"message": "Username already exists"}), 409
    
    # Hash password using bcrypt with salt
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    
    # Create new user entry in users dictionary
    users[username] = {
        # Store hashed password (never store plaintext)
        "password_hash": password_hash,
        # Initialize temp_token as None (set on login)
        "temp_token": None,
        # Store public_key placeholder for future E2EE
        "public_key": None
    }
    
    # Save updated users to storage
    save_users(users)
    
    # Create membership file for new user
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    
    # Initialize empty groups list for new user
    save_json(membership_file, {"groups": []})
    
    # Return success response with 201 status code
    return jsonify({"message": "Registration successful"}), 201

# Authenticate user and return session token
@app.route("/login", methods=["POST"])
def login():
    """Authenticate user and issue session token"""
    # Get JSON data from request body
    data = request.get_json()
    
    # Check if request body contains data
    if not data:
        # Return error if no data provided
        return jsonify({"message": "Request body required"}), 400
    
    # Extract username from request data
    username = data.get("username", "").strip()
    
    # Extract password from request data
    password = data.get("password", "")
    
    # Validate username was provided
    if not username:
        # Return error if username empty
        return jsonify({"message": "Username required"}), 400
    
    # Validate password was provided
    if not password:
        # Return error if password empty
        return jsonify({"message": "Password required"}), 400
    
    # Load all users from storage
    users = load_users()
    
    # Check if username exists in users
    if username not in users:
        # Return generic error for security
        return jsonify({"message": "Invalid credentials"}), 401
    
    # Get user data from users dictionary
    user_data = users[username]
    
    # Get stored password hash
    password_hash = user_data.get("password_hash")
    
    # Verify provided password matches stored hash
    if not bcrypt.checkpw(password.encode(), password_hash.encode()):
        # Return generic error for security
        return jsonify({"message": "Invalid credentials"}), 401
    
    # Generate secure random token for this session
    token = secrets.token_urlsafe(32)
    
    # Update user's temp_token in memory
    user_data["temp_token"] = token
    
    # Save updated users back to storage
    save_users(users)
    
    # Return token to client in response
    return jsonify({"token": token}), 200

# ========== ROOM/GROUP ROUTES ==========

# Get list of groups user belongs to
@app.route("/rooms", methods=["GET"])
def get_rooms():
    """Return list of chat groups for authenticated user"""
    # Get token from request body
    data = request.get_json() or {}
    
    # Extract temp_token from request data
    token = data.get("temp_token")
    
    # Validate that token was provided
    if not token:
        # Return error if token missing
        return jsonify({"message": "Token required"}), 401
    
    # Get username associated with token
    username = get_user_from_token(token)
    
    # Validate token is valid
    if not username:
        # Return error if token invalid or expired
        return jsonify({"message": "Invalid token"}), 401
    
    # Build path to user's membership file
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    
    # Load user's membership data
    memberships = load_json(membership_file)
    
    # Get list of group IDs user belongs to
    group_ids = memberships.get("groups", [])
    
    # Initialize list to store group names
    groups_list = []
    
    # Loop through each group ID
    for group_id in group_ids:
        # Build path to group file
        group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
        
        # Load group data
        group_data = load_json(group_file)
        
        # Get group name from data
        group_name = group_data.get("group_name", group_id)
        
        # Add group name to response list
        groups_list.append(group_name)
    
    # Return list of groups to client
    return jsonify({"groups": groups_list}), 200

# ========== MESSAGE ROUTES ==========

# Get messages for a specific group
@app.route("/messages", methods=["GET"])
def get_messages():
    """Retrieve all messages from specified group"""
    # Get token from request body
    data = request.get_json() or {}
    
    # Extract temp_token from request data
    token = data.get("temp_token")
    
    # Validate token was provided
    if not token:
        # Return error if token missing
        return jsonify({"message": "Token required"}), 401
    
    # Get username from token
    username = get_user_from_token(token)
    
    # Validate token is valid
    if not username:
        # Return error if token invalid or expired
        return jsonify({"message": "Invalid token"}), 401
    
    # Get group name from query parameter
    group_name = request.args.get("group")
    
    # Validate group name was specified
    if not group_name:
        # Return error if group not specified
        return jsonify({"message": "Group parameter required"}), 400
    
    # Find group ID by searching for matching name
    group_id = find_group_id_by_name(group_name)
    
    # Validate group was found
    if not group_id:
        # Return error if group doesn't exist
        return jsonify({"message": "Group not found"}), 404
    
    # Check if user is member of group
    if not check_membership(username, group_id):
        # Return error if user not authorized
        return jsonify({"message": "Access denied"}), 403
    
    # Build path to group's messages file
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    
    # Load messages data for group
    messages_data = load_json(messages_file)
    
    # Get messages array from data
    messages = messages_data.get("messages", [])
    
    # Return messages to client
    return jsonify({"messages": messages}), 200

# Send encrypted message to group
@app.route("/messages", methods=["POST"])
def send_message():
    """Store encrypted message in group"""
    # Get JSON data from request body
    data = request.get_json()
    
    # Validate request body exists
    if not data:
        # Return error if no data provided
        return jsonify({"message": "Request body required"}), 400
    
    # Extract temp_token from request data
    token = data.get("temp_token")
    
    # Validate token was provided
    if not token:
        # Return error if token missing
        return jsonify({"message": "Token required"}), 401
    
    # Get username from token
    username = get_user_from_token(token)
    
    # Validate token is valid
    if not username:
        # Return error if token invalid or expired
        return jsonify({"message": "Invalid token"}), 401
    
    # Get group name from request data
    group = data.get("group")
    
    # Validate group was specified
    if not group:
        # Return error if group not specified
        return jsonify({"message": "Group required"}), 400
    
    # Get ciphertext (encrypted message) from request data
    ciphertext = data.get("ciphertext")
    
    # Validate message was provided
    if not ciphertext:
        # Return error if message empty
        return jsonify({"message": "Message cannot be empty"}), 400
    
    # Find group ID by searching for matching name
    group_id = find_group_id_by_name(group)
    
    # Validate group was found
    if not group_id:
        # Return error if group doesn't exist
        return jsonify({"message": "Group not found"}), 404
    
    # Check if user is member of group
    if not check_membership(username, group_id):
        # Return error if user not authorized
        return jsonify({"message": "Access denied"}), 403
    
    # Build path to group's messages file
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    
    # Load existing messages for group
    messages_data = load_json(messages_file)
    
    # Initialize messages array if empty
    if "messages" not in messages_data:
        messages_data["messages"] = []
    
    # Create new message object
    message = {
        # Store sender's username
        "sender": username,
        # Store ciphertext (NEVER decrypt on server)
        "text": ciphertext,
        # Store message timestamp in ISO format
        "timestamp": datetime.now().isoformat()
    }
    
    # Add message to messages list
    messages_data["messages"].append(message)
    
    # Save updated messages to storage
    save_json(messages_file, messages_data)
    
    # Return success response
    return jsonify({"message": "Message sent"}), 201

# ========== GROUP MANAGEMENT ROUTES ==========

# Create new group
@app.route("/group_add", methods=["POST"])
def add_group():
    """Create new chat group"""
    # Get JSON data from request body
    data = request.get_json()
    
    # Validate request body exists
    if not data:
        # Return error if no data provided
        return jsonify({"message": "Request body required"}), 400
    
    # Extract temp_token from request data
    token = data.get("temp_token")
    
    # Validate token was provided
    if not token:
        # Return error if token missing
        return jsonify({"message": "Token required"}), 401
    
    # Get username from token
    username = get_user_from_token(token)
    
    # Validate token is valid
    if not username:
        # Return error if token invalid or expired
        return jsonify({"message": "Invalid token"}), 401
    
    # Get group name from request data
    groupname = data.get("groupname", "").strip()
    
    # Validate group name was provided
    if not groupname:
        # Return error if group name empty
        return jsonify({"message": "Group name required"}), 400
    
    # Generate unique group ID using UUID v4
    group_id = str(uuid4())
    
    # Create group data object
    group_data = {
        # Store unique group ID
        "group_id": group_id,
        # Store human-readable group name
        "group_name": groupname,
        # Store creator's username
        "creator": username,
        # Store creation timestamp in ISO format
        "created_at": datetime.now().isoformat()
    }
    
    # Build path to group file
    group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
    
    # Save group data to storage
    save_json(group_file, group_data)
    
    # Build path to creator's membership file
    membership_file = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    
    # Load creator's membership data
    memberships = load_json(membership_file)
    
    # Initialize groups list if empty
    if "groups" not in memberships:
        memberships["groups"] = []
    
    # Add new group ID to creator's memberships
    memberships["groups"].append(group_id)
    
    # Save updated membership data to storage
    save_json(membership_file, memberships)
    
    # Build path to messages file for new group
    messages_file = os.path.join(MESSAGES_DIR, f"{group_id}.json")
    
    # Initialize empty messages list for group
    save_json(messages_file, {"messages": []})
    
    # Return success response with new group ID
    return jsonify({"message": "Group created", "group_id": group_id}), 201

# ========== ERROR HANDLERS ==========

# Handle 404 not found errors
@app.errorhandler(404)
def not_found(error):
    """Handle requests to undefined endpoints"""
    # Return JSON error response
    return jsonify({"message": "Endpoint not found"}), 404

# Handle 500 internal server errors
@app.errorhandler(500)
def internal_error(error):
    """Handle unexpected server errors"""
    # Return JSON error response
    return jsonify({"message": "Internal server error"}), 500

# ========== APPLICATION ENTRY POINT ==========

# Run Flask application if file is executed directly
if __name__ == "__main__":
    # Run Flask development server on localhost port 5000
    app.run(debug=True, host="localhost", port=5000)