"""
========== AUTHENTICATION MODULE ==========
Handles user authentication, token validation, and authorization
Provides decorators for route protection
================================================
"""

import secrets
from functools import wraps
from datetime import datetime
from flask import request, jsonify
from uuid import uuid4
import json
import os

# Import from main app (assuming this is imported into app context)
# These will be set by the calling module
USERS_FILE = None
GROUPS_DIR = None
MEMBERSHIPS_DIR = None
ROLES_DIR = None

def set_users_file(path):
    """Set the path to users.json file"""
    global USERS_FILE
    USERS_FILE = path

def set_groups_dir(path):
    """Set the path to groups directory"""
    global GROUPS_DIR
    GROUPS_DIR = path

def set_memberships_dir(path):
    """Set the path to memberships directory"""
    global MEMBERSHIPS_DIR
    MEMBERSHIPS_DIR = path

def set_roles_dir(path):
    """Set the path to roles directory"""
    global ROLES_DIR
    ROLES_DIR = path

# ========== TOKEN GENERATION & VALIDATION ==========

def generate_secure_token():
    """Generate cryptographically secure random token for session"""
    # Generate 32 random bytes (256 bits)
    # Convert to hex string for transport
    return secrets.token_hex(32)

def validate_token(token):
    """Validate session token and return username if valid"""
    # Check if token provided
    if not token:
        # Return None if no token
        return None
    
    try:
        # Load users from storage
        with open(USERS_FILE, 'r') as f:
            users = json.load(f)
        
        # Search for user with this token
        for username, user_data in users.items():
            # Check if token matches
            if user_data.get("temp_token") == token:
                # Return username if token found
                return username
        
        # Return None if token not found
        return None
    except Exception as e:
        # Log error
        print(f"Error validating token: {str(e)}")
        # Return None on error
        return None

# ========== DECORATORS FOR ROUTE PROTECTION ==========

def token_required(f):
    """Decorator to require valid authentication token
    Extracts token from request and validates
    Passes username to decorated function
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Get JSON body
        data = request.get_json() if request.is_json else {}
        
        # Check for token in request body (POST requests)
        token = data.get('temp_token')
        
        # Check for token in query parameters (GET requests)
        if not token:
            token = request.args.get('token')
        
        # Check for token in Authorization header
        if not token and request.headers.get('Authorization'):
            # Extract Bearer token
            auth_header = request.headers.get('Authorization', '')
            # Remove 'Bearer ' prefix
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
        
        # Validate token
        username = validate_token(token)
        
        # Check if token is valid
        if not username:
            # Return error if no valid token
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Call decorated function with username
        # Keyword argument 'username' passed to function
        return f(username=username, *args, **kwargs)
    
    # Return decorated function
    return decorated

def group_admin_required(f):
    """Decorator to require group admin role
    Validates user is admin of specified group
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Get data from request
        data = request.get_json() if request.is_json else {}
        
        # Get token
        token = data.get('temp_token')
        
        # Get username from token
        username = validate_token(token)
        
        # Check if token valid
        if not username:
            # Return error if no valid token
            return jsonify({"message": "Invalid or missing token"}), 401
        
        # Get group ID from request data or path
        group_id = data.get('group_id') or kwargs.get('group_id')
        
        # Check if group ID provided
        if not group_id:
            # Return error
            return jsonify({"message": "Group ID required"}), 400
        
        try:
            # Load role file for this group
            role_file = os.path.join(ROLES_DIR, f"{group_id}_{username}.json")
            
            # Check if role file exists
            if not os.path.exists(role_file):
                # Return error if no role for this user
                return jsonify({"message": "Not a member of this group"}), 403
            
            # Load role data
            with open(role_file, 'r') as f:
                role_data = json.load(f)
            
            # Get user's role
            role = role_data.get('role')
            
            # Check if user is admin
            if role != 'admin':
                # Return error if not admin
                return jsonify({"message": "Admin access required"}), 403
            
            # Call decorated function with username and group_id
            return f(username=username, group_id=group_id, *args, **kwargs)
        
        except Exception as e:
            # Log error
            print(f"Error checking admin role: {str(e)}")
            # Return error
            return jsonify({"message": "Permission check failed"}), 500
    
    # Return decorated function
    return decorated

# ========== MEMBERSHIP VERIFICATION ==========

def resolve_user_membership_file(username):
    """Resolve membership file path case-insensitively for a username."""
    exact_path = os.path.join(MEMBERSHIPS_DIR, f"{username}.json")
    if os.path.exists(exact_path):
        return exact_path
    lower_path = os.path.join(MEMBERSHIPS_DIR, f"{username.lower()}.json")
    if os.path.exists(lower_path):
        return lower_path
    if os.path.exists(MEMBERSHIPS_DIR):
        for filename in os.listdir(MEMBERSHIPS_DIR):
            if filename.lower() == f"{username.lower()}.json":
                return os.path.join(MEMBERSHIPS_DIR, filename)
    return exact_path


def is_group_member(username, group_id):
    """Check if user is member of group"""
    try:
        # Load membership file for user
        membership_file = resolve_user_membership_file(username)
        
        # Check if file exists
        if not os.path.exists(membership_file):
            # Return False if no membership file
            return False
        
        # Load membership data
        with open(membership_file, 'r') as f:
            membership_data = json.load(f)
        
        # Get list of groups user is member of
        groups = membership_data.get('groups', [])
        
        # Check if group in list
        return group_id in groups
    
    except Exception as e:
        # Log error
        print(f"Error checking group membership: {str(e)}")
        # Return False on error
        return False

def get_user_group_role(username, group_id):
    """Get user's role in group (admin or member)"""
    try:
        # Load role file
        role_file = os.path.join(ROLES_DIR, f"{group_id}_{username}.json")
        
        # Check if file exists
        if not os.path.exists(role_file):
            # Return None if no role
            return None
        
        # Load role data
        with open(role_file, 'r') as f:
            role_data = json.load(f)
        
        # Return user's role
        return role_data.get('role')
    
    except Exception as e:
        # Log error
        print(f"Error getting group role: {str(e)}")
        # Return None on error
        return None

def set_user_group_role(username, group_id, role):
    """Set user's role in group"""
    try:
        # Create roles directory if needed
        os.makedirs(ROLES_DIR, exist_ok=True)
        
        # Create role file
        role_file = os.path.join(ROLES_DIR, f"{group_id}_{username}.json")
        
        # Prepare role data
        role_data = {
            'username': username,
            'group_id': group_id,
            'role': role,
            'assigned_at': datetime.now().isoformat()
        }
        
        # Save role file
        with open(role_file, 'w') as f:
            json.dump(role_data, f, indent=2)
    
    except Exception as e:
        # Log error
        print(f"Error setting group role: {str(e)}")
        # Re-raise exception
        raise

# ========== GROUP VERIFICATION ==========

def group_exists(group_id):
    """Check if group exists"""
    try:
        # Build group file path
        group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
        
        # Check if file exists
        return os.path.exists(group_file)
    
    except Exception as e:
        # Log error
        print(f"Error checking group existence: {str(e)}")
        # Return False on error
        return False

def get_group_data(group_id):
    """Load group data"""
    try:
        # Build group file path
        group_file = os.path.join(GROUPS_DIR, f"{group_id}.json")
        
        # Check if file exists
        if not os.path.exists(group_file):
            # Return None if doesn't exist
            return None
        
        # Load group data
        with open(group_file, 'r') as f:
            group_data = json.load(f)
        
        # Return group data
        return group_data
    
    except Exception as e:
        # Log error
        print(f"Error loading group data: {str(e)}")
        # Return None on error
        return None

# ========== USER VERIFICATION ==========

def user_exists(username):
    """Check if user exists"""
    try:
        # Load users
        with open(USERS_FILE, 'r') as f:
            users = json.load(f)
        
        # Check if user in list
        return username in users
    
    except Exception as e:
        # Log error
        print(f"Error checking user existence: {str(e)}")
        # Return False on error
        return False

def get_user_data(username):
    """Get user data"""
    try:
        # Load users
        with open(USERS_FILE, 'r') as f:
            users = json.load(f)
        
        # Get user data
        user_data = users.get(username)
        
        # Return user data or None
        return user_data
    
    except Exception as e:
        # Log error
        print(f"Error loading user data: {str(e)}")
        # Return None on error
        return None
