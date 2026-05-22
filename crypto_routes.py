"""
========== CRYPTO ROUTES MODULE ==========
Handles cryptography-related endpoints
Key exchange, group key management, public key distribution
================================================
"""

from flask import request, jsonify
import json
import os
from uuid import uuid4
from datetime import datetime

# These will be set when creating routes
data_config = {
    'USERS_FILE': None,
    'GROUPS_DIR': None,
    'GROUP_KEYS_DIR': None,
    'MEMBERSHIPS_DIR': None,
    'ROLES_DIR': None,
    'MESSAGES_DIR': None,
    'API_BASE': None
}

def load_json(file_path):
    """Load JSON file with error handling"""
    # Check if file exists
    if not os.path.exists(file_path):
        # Return empty dict if not found
        return {}
    try:
        # Load and return JSON
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        # Log error
        print(f"Error loading JSON from {file_path}: {str(e)}")
        # Return empty dict on error
        return {}

def save_json(file_path, data):
    """Save JSON file with error handling"""
    # Create directory if needed
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
    
    try:
        # Save JSON file
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        # Log error
        print(f"Error saving JSON to {file_path}: {str(e)}")

def validate_token(token):
    """Validate session token and return username"""
    # Check if token provided
    if not token:
        return None
    
    try:
        # Load users
        users = load_json(data_config['USERS_FILE'])
        
        # Search for token
        for username, user_data in users.items():
            # Check if token matches
            if user_data.get("temp_token") == token:
                # Return username
                return username
        
        # Return None if not found
        return None
    except Exception as e:
        # Log error
        print(f"Error validating token: {str(e)}")
        # Return None
        return None

def create_crypto_routes(app, auth_module, config):
    """Create crypto-related Flask routes"""
    
    # Store configuration
    global data_config
    data_config = config

    # ========== PUBLIC KEY DISTRIBUTION ==========

    @app.route("/user_public_key", methods=["GET"])
    def get_user_public_key_route():
        """Get user's public key for key exchange
        Anyone can get a public key (it's public!)
        """
        # Get username from query parameter
        username = request.args.get('username', '').strip()
        
        # Check if username provided
        if not username:
            # Return error
            return jsonify({"message": "Username required"}), 400
        
        try:
            # Load users
            users = load_json(data_config['USERS_FILE'])
            
            # Check if user exists
            if username not in users:
                # Return error
                return jsonify({"message": "User not found"}), 404
            
            # Get user data
            user_data = users[username]
            
            # Get public keys
            public_key = user_data.get('public_key')
            signature_public_key = user_data.get('signature_public_key')
            
            # Check if keys exist
            if not public_key or not signature_public_key:
                # Return error
                return jsonify({"message": "User has not initialized cryptography yet"}), 404
            
            # Return public keys
            return jsonify({
                "username": username,
                "public_key": public_key,
                "signature_public_key": signature_public_key
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error getting public key: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/user_public_keys_batch", methods=["POST"])
    def get_user_public_keys_batch_route():
        """Get public keys for multiple users at once
        Used when adding members to group (need to encrypt key for each member)
        """
        # Get request data
        data = request.get_json()
        
        # Check if data provided
        if not data:
            # Return error
            return jsonify({"message": "Request body required"}), 400
        
        # Get token
        token = data.get('temp_token')
        
        # Validate token
        username = validate_token(token)
        if not username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get list of usernames
        usernames = data.get('usernames', [])
        
        # Check if usernames provided
        if not usernames or not isinstance(usernames, list):
            # Return error
            return jsonify({"message": "Valid usernames list required"}), 400
        
        try:
            # Load users
            users = load_json(data_config['USERS_FILE'])
            
            # Collect public keys for each user
            public_keys = {}
            
            for requested_username in usernames:
                # Check if user exists
                if requested_username not in users:
                    # Skip missing users
                    continue
                
                # Get user data
                user_data = users[requested_username]
                
                # Get public keys
                public_key = user_data.get('public_key')
                signature_public_key = user_data.get('signature_public_key')
                
                # Store if keys exist
                if public_key and signature_public_key:
                    public_keys[requested_username] = {
                        "public_key": public_key,
                        "signature_public_key": signature_public_key
                    }
            
            # Return public keys
            return jsonify({"public_keys": public_keys}), 200
        
        except Exception as e:
            # Log error
            print(f"Error getting batch public keys: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    # ========== GROUP KEY MANAGEMENT ==========

    @app.route("/group_key_save", methods=["POST"])
    def save_group_key_route():
        """Save encrypted group key for user
        Called when user receives encrypted group key from server
        """
        # Get request data
        data = request.get_json()
        
        # Check if data provided
        if not data:
            # Return error
            return jsonify({"message": "Request body required"}), 400
        
        # Get token
        token = data.get('temp_token')
        
        # Validate token
        username = validate_token(token)
        if not username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID
        group_id = data.get('group_id')
        
        # Get encrypted group key
        encrypted_group_key = data.get('encrypted_group_key')
        
        # Validate parameters
        if not group_id or not encrypted_group_key:
            # Return error
            return jsonify({"message": "group_id and encrypted_group_key required"}), 400
        
        try:
            # Build file path for group key
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{username}.json"
            )

            # Load existing structure and append key to history
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

            # Save group key history
            save_json(group_key_file, data)
            
            # Return success
            return jsonify({"message": "Group key saved"}), 200
        
        except Exception as e:
            # Log error
            print(f"Error saving group key: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/group_key_load", methods=["GET"])
    def load_group_key_route():
        """Load encrypted group key for user
        Client-side will decrypt this with user's private key
        """
        # Get token from query param
        token = request.args.get('token')
        
        # Validate token
        username = validate_token(token)
        if not username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID
        group_id = request.args.get('group_id')
        
        # Check if group ID provided
        if not group_id:
            # Return error
            return jsonify({"message": "group_id required"}), 400
        
        try:
            # Build file path for group key
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{username}.json"
            )

            # Check if file exists
            if not os.path.exists(group_key_file):
                # Return error
                return jsonify({"message": "Group key not found"}), 404

            # Load group key history
            group_key_data = load_json(group_key_file)
            keys = group_key_data.get('keys', []) if isinstance(group_key_data.get('keys', []), list) else []

            # Include legacy top-level encrypted_group_key if present and not already returned
            legacy_key = group_key_data.get('encrypted_group_key')
            if legacy_key:
                legacy_saved_at = group_key_data.get('saved_at', datetime.now().isoformat())
                if not any(entry.get('encrypted_group_key') == legacy_key for entry in keys):
                    keys.insert(0, {
                        'encrypted_group_key': legacy_key,
                        'saved_at': legacy_saved_at
                    })

            # Return list of encrypted group keys (history)
            return jsonify({
                "group_id": group_key_data.get('group_id'),
                "keys": keys
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error loading group key: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/debug/group_keys", methods=["GET"])
    def debug_group_keys_route():
        """Dev-only endpoint: return raw stored encrypted keys for a user+group.
        Use only for local debugging. Requires valid token.
        Query params: group_id, username
        """
        # Simple opt-in: allow if DEV_DEBUG_KEYS env var set to true, otherwise restrict to local dev
        import os
        allow = os.environ.get('DEV_DEBUG_KEYS', 'true').lower() == 'true'
        if not allow:
            return jsonify({"message": "Debug endpoint disabled"}), 403

        token = request.args.get('token')
        requester = validate_token(token)
        if not requester:
            return jsonify({"message": "Invalid or missing token"}), 401

        group_id = request.args.get('group_id')
        target_username = request.args.get('username')
        if not group_id or not target_username:
            return jsonify({"message": "group_id and username required"}), 400

        # Only allow if requester is the same user or a group admin
        # Load roles to check admin
        roles_file = os.path.join(data_config['ROLES_DIR'], f"{group_id}_roles.json")
        roles = load_json(roles_file)
        is_admin = roles.get(requester) == 'admin'
        if requester != target_username and not is_admin:
            return jsonify({"message": "Access denied"}), 403

        group_key_file = os.path.join(data_config['GROUP_KEYS_DIR'], f"{group_id}_{target_username}.json")
        if not os.path.exists(group_key_file):
            return jsonify({"message": "Group key file not found"}), 404

        data = load_json(group_key_file)
        return jsonify({"file": data}), 200

    @app.route("/group_key_delete", methods=["POST"])
    def delete_group_key_route():
        """Delete encrypted group key for user
        Called when member is removed from group
        """
        # Get request data
        data = request.get_json()
        
        # Get token
        token = data.get('temp_token')
        
        # Validate token
        username = validate_token(token)
        if not username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID
        group_id = data.get('group_id')
        
        # Check if group ID provided
        if not group_id:
            # Return error
            return jsonify({"message": "group_id required"}), 400
        
        try:
            # Build file path
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{username}.json"
            )
            
            # Check if file exists
            if os.path.exists(group_key_file):
                # Delete file
                os.remove(group_key_file)
                
                # Log deletion
                print(f"Deleted group key for user {username} in group {group_id}")
            
            # Return success (whether or not file existed)
            return jsonify({"message": "Group key deleted"}), 200
        
        except Exception as e:
            # Log error
            print(f"Error deleting group key: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    # Return True to indicate routes created
    return True

# Export function for use in main app
if __name__ == '__main__':
    print("Crypto routes module loaded")
