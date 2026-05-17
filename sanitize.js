/* ========== SANITIZATION & XSS PROTECTION MODULE ==========
 * Provides safe DOM manipulation and input sanitization
 * Prevents script injection, DOM injection, and other XSS attacks
 * NEVER renders user content as HTML directly
 * ========================================================= */

const SanitizeModule = (() => {
  /**
   * HTML encode special characters to prevent injection
   * Converts: < > " ' & to their HTML entities
   * @param {string} text - Raw text that may contain HTML characters
   * @returns {string} HTML-safe text with special chars encoded
   */
  function htmlEncode(text) {
    // Create temporary div element for encoding
    const div = document.createElement('div');
    // Set text content - browser automatically HTML-encodes
    div.textContent = text;
    // Return the HTML-encoded content
    return div.innerHTML;
  }

  /**
   * Sanitize user input by removing potential malicious content
   * Removes script tags, event handlers, javascript: URLs
   * @param {string} input - User-supplied input
   * @returns {string} Sanitized input safe for display
   */
  function sanitizeInput(input) {
    // Check for null or undefined input
    if (!input) {
      // Return empty string
      return '';
    }

    // Convert input to string (in case it's number or other type)
    let sanitized = String(input);

    // Remove script tags and content (both <script> and <SCRIPT>)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handler attributes (onclick, onload, etc)
    // Pattern matches: onX="..." where X is any event name
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Remove data: URLs (can contain encoded scripts)
    sanitized = sanitized.replace(/data:text\/html/gi, '');

    // Remove iframe tags which can load external content
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    // Trim whitespace from beginning and end
    sanitized = sanitized.trim();

    // Return sanitized string
    return sanitized;
  }

  /**
   * Safely set text content of an element (prevents HTML injection)
   * Use this instead of innerHTML for user-generated content
   * @param {Element} element - DOM element to update
   * @param {string} text - Text content to set
   * @returns {void}
   */
  function safeSetTextContent(element, text) {
    // Check if element is valid
    if (!element) {
      // Log error and return
      console.error('Invalid element provided to safeSetTextContent');
      return;
    }

    // Clear existing content
    element.innerHTML = '';

    // Create text node from content
    // Text nodes cannot contain HTML/scripts
    const textNode = document.createTextNode(text);

    // Append text node to element
    element.appendChild(textNode);
  }

  /**
   * Safely create a message element from user data
   * Never uses innerHTML with user data
   * @param {Object} msgData - Message data { sender, text, timestamp }
   * @returns {Element} Safe DOM element for message
   */
  function createSafeMessageElement(msgData) {
    // Create message container div
    const messageDiv = document.createElement('div');
    // Add message CSS class
    messageDiv.className = 'message';

    // Check if this is user's own message
    if (msgData.own) {
      // Add 'own' class for styling
      messageDiv.classList.add('own');
    }

    // Create sender name element
    const senderDiv = document.createElement('div');
    // Add sender CSS class
    senderDiv.className = 'message-sender';
    // Set sender name safely (no HTML)
    safeSetTextContent(senderDiv, msgData.sender);

    // Create message text element
    const textDiv = document.createElement('div');
    // Add text CSS class
    textDiv.className = 'message-text';
    // Set message text safely (no HTML)
    // Sanitize first in case of suspicious input
    safeSetTextContent(textDiv, sanitizeInput(msgData.text));

    // Create timestamp element
    const timeDiv = document.createElement('div');
    // Add timestamp CSS class
    timeDiv.className = 'message-timestamp';
    // Set timestamp safely (no HTML)
    safeSetTextContent(timeDiv, msgData.timestamp);

    // Build message structure
    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);

    // Return safe message element
    return messageDiv;
  }

  /**
   * Safely create a chat item element from group/friend data
   * @param {string} name - Name of chat/group
   * @returns {Element} Safe DOM element
   */
  function createSafeChatItemElement(name) {
    // Create button element for chat item
    const chatItem = document.createElement('button');
    // Add chat-item CSS class
    chatItem.className = 'chat-item';
    // Set name safely (no HTML)
    safeSetTextContent(chatItem, sanitizeInput(name));
    // Return safe element
    return chatItem;
  }

  /**
   * Validate and sanitize username
   * Checks length, allowed characters
   * @param {string} username - Username to validate
   * @returns {Object} { isValid: boolean, error: string }
   */
  function validateUsername(username) {
    // Check if username is empty
    if (!username || username.trim().length === 0) {
      // Return validation failure
      return { isValid: false, error: 'Username cannot be empty' };
    }

    // Get trimmed username
    const trimmed = username.trim();

    // Check minimum length (3 characters)
    if (trimmed.length < 3) {
      // Return validation failure
      return { isValid: false, error: 'Username must be at least 3 characters' };
    }

    // Check maximum length (20 characters)
    if (trimmed.length > 20) {
      // Return validation failure
      return { isValid: false, error: 'Username must not exceed 20 characters' };
    }

    // Only allow alphanumeric and underscore
    // Pattern: starts with letter, contains only letters, numbers, underscores
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      // Return validation failure
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    // All checks passed
    return { isValid: true, error: null };
  }

  /**
   * Validate password strength
   * Checks length, uppercase, lowercase, number, and symbol requirements
   * @param {string} password - Password to validate
   * @returns {Object} { isValid: boolean, error: string }
   */
  function validatePassword(password) {
    // Check if password is empty
    if (!password || password.length === 0) {
      // Return validation failure
      return { isValid: false, error: 'Password cannot be empty' };
    }

    // Check minimum length (8 characters)
    if (password.length < 8) {
      // Return validation failure
      return { isValid: false, error: 'Password must be at least 8 characters' };
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
      // Return validation failure
      return { isValid: false, error: 'Password must contain at least one uppercase letter' };
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      // Return validation failure
      return { isValid: false, error: 'Password must contain at least one lowercase letter' };
    }

    // Check for digit
    if (!/[0-9]/.test(password)) {
      // Return validation failure
      return { isValid: false, error: 'Password must contain at least one number' };
    }

    // Check for special character
    if (!/[!@#$%^&*()_\-+=\[\]{}|;:',.<>?/~`]/.test(password)) {
      // Return validation failure
      return { isValid: false, error: 'Password must contain at least one special character (!@#$%^&* etc)' };
    }

    // All checks passed
    return { isValid: true, error: null };
  }

  /**
   * Validate and sanitize group name
   * Checks length, allowed characters
   * @param {string} groupName - Group name to validate
   * @returns {Object} { isValid: boolean, error: string }
   */
  function validateGroupName(groupName) {
    // Check if group name is empty
    if (!groupName || groupName.trim().length === 0) {
      // Return validation failure
      return { isValid: false, error: 'Group name cannot be empty' };
    }

    // Get trimmed name
    const trimmed = groupName.trim();

    // Check minimum length (3 characters)
    if (trimmed.length < 3) {
      // Return validation failure
      return { isValid: false, error: 'Group name must be at least 3 characters' };
    }

    // Check maximum length (50 characters)
    if (trimmed.length > 50) {
      // Return validation failure
      return { isValid: false, error: 'Group name must not exceed 50 characters' };
    }

    // Allow more characters for group names (alphanumeric, spaces, dash, underscore)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
      // Return validation failure
      return { isValid: false, error: 'Group name contains invalid characters' };
    }

    // All checks passed
    return { isValid: true, error: null };
  }

  /**
   * Validate message content
   * Checks length, prevents empty messages
   * @param {string} message - Message text to validate
   * @returns {Object} { isValid: boolean, error: string }
   */
  function validateMessage(message) {
    // Check if message is empty
    if (!message || message.trim().length === 0) {
      // Return validation failure
      return { isValid: false, error: 'Message cannot be empty' };
    }

    // Get trimmed message
    const trimmed = message.trim();

    // Check maximum length (5000 characters)
    if (trimmed.length > 5000) {
      // Return validation failure
      return { isValid: false, error: 'Message is too long (max 5000 characters)' };
    }

    // All checks passed
    return { isValid: true, error: null };
  }

  /**
   * Escape JSON string to prevent breaking JSON structure
   * @param {string} str - String to escape
   * @returns {string} JSON-safe escaped string
   */
  function escapeJSON(str) {
    // List of characters that need escaping in JSON
    return String(str).replace(/[\\"\n\r\t]/g, (char) => {
      switch (char) {
        case '\\':
          // Backslash becomes double backslash
          return '\\\\';
        case '"':
          // Quote becomes escaped quote
          return '\\"';
        case '\n':
          // Newline becomes \n
          return '\\n';
        case '\r':
          // Carriage return becomes \r
          return '\\r';
        case '\t':
          // Tab becomes \t
          return '\\t';
        default:
          // Return character unchanged
          return char;
      }
    });
  }

  // ========== PUBLIC API EXPORT ==========

  // Return public interface
  return {
    // Encoding functions
    htmlEncode,
    escapeJSON,
    // Input sanitization
    sanitizeInput,
    // Safe DOM manipulation
    safeSetTextContent,
    createSafeMessageElement,
    createSafeChatItemElement,
    // Validation functions
    validateUsername,
    validatePassword,
    validateGroupName,
    validateMessage
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SanitizeModule;
}
