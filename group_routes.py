"""
========== GROUP ROUTES MODULE ==========
Handles group-related endpoints with encryption coordination
Group creation, member management, message relay with envelope encryption
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

def get_user_group_role(group_id, username):
    """Get user's role in group (admin or member)"""
    # Build roles file path
    roles_file = os.path.join(
        data_config['ROLES_DIR'],
        f"{group_id}_roles.json"
    )
    
    # Load roles
    roles_data = load_json(roles_file)
    
    # Get role (default to member)
    role = roles_data.get(username, 'member')
    
    # Return role
    return role

def is_group_admin(group_id, username):
    """Check if user is admin in group"""
    # Get role
    role = get_user_group_role(group_id, username)
    
    # Return True if admin
    return role == 'admin'

def is_group_member(group_id, username):
    """Check if user is member of group"""
    # Build membership file path
    membership_file = os.path.join(
        data_config['MEMBERSHIPS_DIR'],
        f"{username}.json"
    )
    
    # Load memberships
    memberships = load_json(membership_file)
    
    # Check if user is in group
    return group_id in memberships.get('groups', [])

def create_group_routes(app, crypto_routes, config):
    """Create group-related Flask routes"""
    
    # Store configuration
    global data_config
    data_config = config

    # ========== GROUP CREATION ==========

    @app.route("/group_create", methods=["POST"])
    def create_group_secure():
        """Create new group with encryption
        Admin only operation
        Returns group_id and encrypted group key for creator
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
        
        # Get group name
        group_name = data.get('group_name', '').strip()
        
        # Validate group name
        if not group_name:
            # Return error
            return jsonify({"message": "Group name required"}), 400
        
        # Get encrypted group key from client
        # Client generated this with WebCrypto
        encrypted_group_key = data.get('encrypted_group_key')
        
        # Validate encrypted group key
        if not encrypted_group_key:
            # Return error
            return jsonify({"message": "encrypted_group_key required"}), 400
        
        try:
            # Generate UUID for group
            group_id = str(uuid4())
            
            # Create group data
            group_data = {
                "group_id": group_id,
                "id": group_id,
                "group_name": group_name,
                "name": group_name,
                "creator": username,
                "created_at": datetime.now().isoformat(),
                "members": [username]  # Add creator as initial member
            }
            
            # Build group file path
            group_file = os.path.join(
                data_config['GROUPS_DIR'],
                f"{group_id}.json"
            )
            
            # Save group
            save_json(group_file, group_data)
            
            # Initialize membership for creator
            membership_file = os.path.join(
                data_config['MEMBERSHIPS_DIR'],
                f"{username}.json"
            )
            
            # Load existing memberships
            memberships = load_json(membership_file)
            if 'groups' not in memberships:
                memberships['groups'] = []
            
            # Add new group
            memberships['groups'].append(group_id)
            
            # Save memberships
            save_json(membership_file, memberships)
            
            # Set creator as admin
            roles_file = os.path.join(
                data_config['ROLES_DIR'],
                f"{group_id}_roles.json"
            )
            
            # Create roles data
            roles_data = {username: 'admin'}
            
            # Save roles
            save_json(roles_file, roles_data)
            
            # Save creator's encrypted group key
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{username}.json"
            )
            
            # Prepare group key data
            group_key_data = {
                "group_id": group_id,
                "username": username,
                "encrypted_group_key": encrypted_group_key,
                "saved_at": datetime.now().isoformat()
            }
            
            # Save group key
            save_json(group_key_file, group_key_data)
            
            # Return success
            return jsonify({
                "message": "Group created successfully",
                "group_id": group_id,
                "group_name": group_name
            }), 201
        
        except Exception as e:
            # Log error
            print(f"Error creating group: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    # ========== GROUP MEMBER MANAGEMENT ==========

    @app.route("/group_add_member", methods=["POST"])
    def add_group_member_secure():
        """Add member to group with envelope encryption
        Admin only - requires encrypted group key for new member
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
        admin_username = validate_token(token)
        if not admin_username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID
        group_id = data.get('group_id')
        
        # Get username to add
        new_username = data.get('username', '').strip()
        
        # Validate parameters
        if not group_id or not new_username:
            # Return error
            return jsonify({"message": "group_id and username required"}), 400
        
        # Check if new_username trying to add themselves
        if new_username == admin_username and not is_group_admin(group_id, admin_username):
            # Return error
            return jsonify({"message": "Can only add yourself if you're admin"}), 403
        
        try:
            # Check if admin
            if not is_group_admin(group_id, admin_username):
                # Return error
                return jsonify({"message": "Only group admin can add members"}), 403
            
            # Load group
            group_file = os.path.join(
                data_config['GROUPS_DIR'],
                f"{group_id}.json"
            )
            
            # Load group data
            group_data = load_json(group_file)
            
            # Check if user already member
            if new_username in group_data.get('members', []):
                # Return error
                return jsonify({"message": "User already in group"}), 400
            
            # Add to members list
            if 'members' not in group_data:
                group_data['members'] = []
            
            # Append new member
            group_data['members'].append(new_username)
            
            # Save group
            save_json(group_file, group_data)
            
            # Update member's memberships
            membership_file = os.path.join(
                data_config['MEMBERSHIPS_DIR'],
                f"{new_username}.json"
            )
            
            # Load memberships
            memberships = load_json(membership_file)
            
            # Initialize groups if needed
            if 'groups' not in memberships:
                memberships['groups'] = []
            
            # Add group
            memberships['groups'].append(group_id)
            
            # Save memberships
            save_json(membership_file, memberships)
            
            # Set role as member
            roles_file = os.path.join(
                data_config['ROLES_DIR'],
                f"{group_id}_roles.json"
            )
            
            # Load roles
            roles_data = load_json(roles_file)
            
            # Set as member
            roles_data[new_username] = 'member'
            
            # Save roles
            save_json(roles_file, roles_data)
            
            # Get encrypted group key from admin's request
            # Admin decrypted it with their private key, re-encrypted for new member
            encrypted_group_key = data.get('encrypted_group_key')
            
            # Validate encrypted group key
            if encrypted_group_key:
                # Save encrypted group key for new member
                group_key_file = os.path.join(
                    data_config['GROUP_KEYS_DIR'],
                    f"{group_id}_{new_username}.json"
                )
                
                # Prepare data
                group_key_data = {
                    "group_id": group_id,
                    "username": new_username,
                    "encrypted_group_key": encrypted_group_key,
                    "saved_at": datetime.now().isoformat()
                }
                
                # Save group key
                save_json(group_key_file, group_key_data)
            
            # Return success
            return jsonify({
                "message": f"User {new_username} added to group",
                "group_id": group_id
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error adding member to group: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/group_remove_member", methods=["POST"])
    def remove_group_member_secure():
        """Remove member from group
        Admin only - triggers key rotation
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
        admin_username = validate_token(token)
        if not admin_username:
            # Return error
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID
        group_id = data.get('group_id')
        
        # Get username to remove
        remove_username = data.get('username', '').strip()
        
        # Validate parameters
        if not group_id or not remove_username:
            # Return error
            return jsonify({"message": "group_id and username required"}), 400
        
        try:
            # Check if admin
            if not is_group_admin(group_id, admin_username):
                # Return error
                return jsonify({"message": "Only group admin can remove members"}), 403
            
            # Cannot remove yourself
            if remove_username == admin_username:
                # Return error
                return jsonify({"message": "Cannot remove yourself - use /leave_group instead"}), 400
            
            # Load group
            group_file = os.path.join(
                data_config['GROUPS_DIR'],
                f"{group_id}.json"
            )
            
            # Load group data
            group_data = load_json(group_file)
            
            # Check if user in group
            if remove_username not in group_data.get('members', []):
                # Return error
                return jsonify({"message": "User not in group"}), 404
            
            # Remove from members
            group_data['members'].remove(remove_username)
            
            # Save group
            save_json(group_file, group_data)
            
            # Update member's memberships
            membership_file = os.path.join(
                data_config['MEMBERSHIPS_DIR'],
                f"{remove_username}.json"
            )
            
            # Load memberships
            memberships = load_json(membership_file)
            
            # Remove group
            if group_id in memberships.get('groups', []):
                memberships['groups'].remove(group_id)
            
            # Save memberships
            save_json(membership_file, memberships)
            
            # Delete user's encrypted group key (they can no longer access)
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{remove_username}.json"
            )
            
            # Delete if exists
            if os.path.exists(group_key_file):
                os.remove(group_key_file)
            
            # Get new encrypted group keys from admin
            # Client handles key rotation, sends new keys for remaining members
            member_keys = data.get('member_encrypted_keys', {})
            
            # Update encrypted group keys for remaining members
            for member_username, encrypted_key in member_keys.items():
                # Skip if trying to update removed user
                if member_username == remove_username:
                    continue
                
                # Build file path
                group_key_file = os.path.join(
                    data_config['GROUP_KEYS_DIR'],
                    f"{group_id}_{member_username}.json"
                )
                
                # Prepare data
                group_key_data = {
                    "group_id": group_id,
                    "username": member_username,
                    "encrypted_group_key": encrypted_key,
                    "saved_at": datetime.now().isoformat()
                }
                
                # Save rotated key
                save_json(group_key_file, group_key_data)
            
            # Return success
            return jsonify({
                "message": f"User {remove_username} removed from group",
                "group_id": group_id
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error removing member from group: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/group_leave", methods=["POST"])
    def leave_group_secure():
        """Leave group as member
        If last member/admin, trigger admin transfer or delete group
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
        
        # Check if group ID provided
        if not group_id:
            # Return error
            return jsonify({"message": "group_id required"}), 400
        
        try:
            # Load group
            group_file = os.path.join(
                data_config['GROUPS_DIR'],
                f"{group_id}.json"
            )
            
            # Load group data
            group_data = load_json(group_file)
            
            # Check if user in group
            if username not in group_data.get('members', []):
                # Return error
                return jsonify({"message": "User not in group"}), 404
            
            # Check if user is admin
            is_admin = is_group_admin(group_id, username)
            
            # If admin and only member, can leave (group becomes empty)
            # If admin and multiple members, need to transfer to someone
            if is_admin and len(group_data.get('members', [])) > 1:
                # Get new admin from request
                new_admin = data.get('transfer_to')
                
                # Check if new admin provided
                if not new_admin or new_admin not in group_data.get('members', []):
                    # Return error
                    return jsonify({"message": "Must transfer admin role to another member"}), 400
                
                # Update roles
                roles_file = os.path.join(
                    data_config['ROLES_DIR'],
                    f"{group_id}_roles.json"
                )
                
                # Load roles
                roles_data = load_json(roles_file)
                
                # Transfer admin
                roles_data[new_admin] = 'admin'
                roles_data[username] = 'member'
                
                # Save roles
                save_json(roles_file, roles_data)
            
            # Remove user from members
            group_data['members'].remove(username)
            
            # Save group
            save_json(group_file, group_data)
            
            # Update member's memberships
            membership_file = os.path.join(
                data_config['MEMBERSHIPS_DIR'],
                f"{username}.json"
            )
            
            # Load memberships
            memberships = load_json(membership_file)
            
            # Remove group
            if group_id in memberships.get('groups', []):
                memberships['groups'].remove(group_id)
            
            # Save memberships
            save_json(membership_file, memberships)
            
            # Delete user's encrypted group key
            group_key_file = os.path.join(
                data_config['GROUP_KEYS_DIR'],
                f"{group_id}_{username}.json"
            )
            
            # Delete if exists
            if os.path.exists(group_key_file):
                os.remove(group_key_file)
            
            # Return success
            return jsonify({
                "message": "Left group successfully",
                "group_id": group_id
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error leaving group: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    # ========== GROUP MESSAGES ==========

    @app.route("/message_send", methods=["POST"])
    def send_message_secure():
        """Send encrypted message to group
        Message MUST be encrypted client-side before sending
        Server only stores, never decrypts
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
        
        # Get encrypted message
        encrypted_message = data.get('encrypted_message')
        
        # Get nonce for AES-GCM decryption
        nonce = data.get('nonce')
        
        # Get signature
        signature = data.get('signature')
        
        # Validate parameters
        if not group_id or not encrypted_message or not nonce or not signature:
            # Return error
            return jsonify({"message": "group_id, encrypted_message, nonce, and signature required"}), 400
        
        try:
            # Check if user member of group
            if not is_group_member(group_id, username):
                # Return error
                return jsonify({"message": "User not member of group"}), 403
            
            # Load group messages or create new
            messages_file = os.path.join(
                data_config['MESSAGES_DIR'],
                f"{group_id}.json"
            )
            
            # Load messages
            messages_data = load_json(messages_file)
            
            # Initialize messages list if needed
            if 'messages' not in messages_data:
                messages_data['messages'] = []
            
            # Create message object
            message = {
                "id": str(uuid4()),
                "from": username,
                "encrypted_message": encrypted_message,
                "nonce": nonce,
                "signature": signature,
                "timestamp": datetime.now().isoformat()
            }
            
            # Add message
            messages_data['messages'].append(message)
            
            # Save messages
            save_json(messages_file, messages_data)
            
            # Return success
            return jsonify({
                "message": "Message sent",
                "message_id": message['id'],
                "timestamp": message['timestamp']
            }), 201
        
        except Exception as e:
            # Log error
            print(f"Error sending message: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    @app.route("/messages_get", methods=["GET"])
    def get_messages_secure():
        """Get encrypted messages for group
        Client will decrypt with group key
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
            # Check if user member of group
            if not is_group_member(group_id, username):
                # Return error
                return jsonify({"message": "User not member of group"}), 403
            
            # Load group messages
            messages_file = os.path.join(
                data_config['MESSAGES_DIR'],
                f"{group_id}.json"
            )
            
            # Load messages
            messages_data = load_json(messages_file)
            
            # Get messages (will be encrypted)
            messages = messages_data.get('messages', [])
            
            # Return messages
            return jsonify({
                "group_id": group_id,
                "messages": messages
            }), 200
        
        except Exception as e:
            # Log error
            print(f"Error getting messages: {str(e)}")
            # Return error
            return jsonify({"message": "Server error"}), 500

    # Return True to indicate routes created
    return True

# Export function for use in main app
if __name__ == '__main__':
    print("Group routes module loaded")
