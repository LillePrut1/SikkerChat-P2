(function() {
  function addTest(desc, actual, expected, tests) {
    const pass = actual === expected;
    tests.push({ desc, pass, actual, expected });
  }

  function htmlEncode(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sanitizeInput(input) {
    if (!input) return '';
    let sanitized = String(input);
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:text\/html/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    return sanitized.trim();
  }

  function safeSetTextContent(element, text) {
    if (!element) {
      console.error('Invalid element provided to safeSetTextContent');
      return;
    }
    element.innerHTML = '';
    const textNode = document.createTextNode(text);
    element.appendChild(textNode);
  }

  function createSafeMessageElement(msgData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const senderDiv = document.createElement('div');
    senderDiv.className = 'message-sender';
    safeSetTextContent(senderDiv, msgData.sender);

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    safeSetTextContent(textDiv, sanitizeInput(msgData.text));

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-timestamp';
    safeSetTextContent(timeDiv, msgData.timestamp);

    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);
    return messageDiv;
  }

  function validateUsername(username) {
    if (!username || username.trim().length === 0) {
      return { isValid: false, error: 'Username cannot be empty' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      return { isValid: false, error: 'Username must be at least 3 characters' };
    }
    if (trimmed.length > 20) {
      return { isValid: false, error: 'Username must not exceed 20 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    return { isValid: true, error: null };
  }

  function validateMessage(message) {
    if (!message || message.trim().length === 0) {
      return { isValid: false, error: 'Message cannot be empty' };
    }
    const trimmed = message.trim();
    if (trimmed.length > 5000) {
      return { isValid: false, error: 'Message is too long (max 5000 characters)' };
    }
    return { isValid: true, error: null };
  }

  function runTests(module) {
    const tests = [];

    addTest(
      'sanitizeInput strips <script> tags',
      module.sanitizeInput('<script>alert(1)</script>Hello'),
      'Hello',
      tests
    );

    addTest(
      'sanitizeInput removes onerror handler',
      module.sanitizeInput('<img src=x onerror="alert(1)">'),
      '<img src=x>',
      tests
    );

    addTest(
      'sanitizeInput removes javascript: URLs',
      module.sanitizeInput('<a href="javascript:alert(1)">click</a>'),
      '<a href="alert(1)">click</a>',
      tests
    );

    addTest(
      'sanitizeInput removes data:text/html patterns',
      module.sanitizeInput('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'),
      '<a href=";base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
      tests
    );

    addTest(
      'sanitizeInput trims whitespace',
      module.sanitizeInput('   hello  '),
      'hello',
      tests
    );

    const div = document.createElement('div');
    module.safeSetTextContent(div, '<img src=x onerror=alert(1)>');
    addTest(
      'safeSetTextContent writes escaped text',
      div.innerHTML,
      '&lt;img src=x onerror=alert(1)&gt;',
      tests
    );

    const messageElement = module.createSafeMessageElement({
      sender: 'alice',
      text: '<script>alert("xss")</script>hi',
      timestamp: '2026-05-26 12:00'
    });
    addTest(
      'createSafeMessageElement renders safe text',
      messageElement.querySelector('.message-text').textContent,
      'hi',
      tests
    );

    addTest(
      'validateUsername rejects short usernames',
      module.validateUsername('ab').isValid,
      false,
      tests
    );

    addTest(
      'validateUsername rejects invalid characters',
      module.validateUsername('bob!@#').isValid,
      false,
      tests
    );

    addTest(
      'validateUsername accepts valid username',
      module.validateUsername('bob_123').isValid,
      true,
      tests
    );

    addTest(
      'validateMessage rejects empty message',
      module.validateMessage('').isValid,
      false,
      tests
    );

    addTest(
      'validateMessage accepts normal message',
      module.validateMessage('Hello world').isValid,
      true,
      tests
    );

    addTest(
      'validateMessage rejects too-long message',
      module.validateMessage('x'.repeat(5001)).isValid,
      false,
      tests
    );

    const summary = tests.reduce(
      (acc, test) => {
        acc.total += 1;
        if (test.pass) acc.pass += 1;
        else acc.fail += 1;
        return acc;
      },
      { total: 0, pass: 0, fail: 0 }
    );

    console.group('SanitizeModule one-click test results');
    tests.forEach((test) => {
      console.log(
        test.pass ? '%cPASS' : '%cFAIL',
        test.pass ? 'color:green' : 'color:red',
        test.desc,
        '| expected:',
        test.expected,
        '| actual:',
        test.actual
      );
    });

    if (summary.fail === 0) {
      console.log('%cAll tests passed.', 'color:green; font-weight:bold;');
    } else {
      console.error(`${summary.fail} of ${summary.total} tests failed.`);
    }
    console.groupEnd();
  }

  const module = window.SanitizeModule || {
    sanitizeInput,
    safeSetTextContent,
    createSafeMessageElement,
    validateUsername,
    validateMessage
  };

  if (!module || typeof module.sanitizeInput !== 'function') {
    console.error('Sanitize module not available and fallback creation failed.');
    return;
  }

  runTests(module);
})();
