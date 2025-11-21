// 🎯 OPTIMIZED SCRIPT - Capture, Hash, and Auto-Replace with [TRANSLATION]
// Includes MutationObserver for dynamically generated content
// Optimized for performance with debouncing, caching, and batch updates

console.clear();
console.log('🔍 Initializing optimized translation system...\n');

// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
  TRANSLATION_PREFIX: '\u200B', // Zero-width space (invisible) to mark translated text
  TARGET_LANGUAGE: 'te(telugu)', // Default to Spanish
  DEBOUNCE_DELAY: 100, // ms to wait before processing mutations
  BATCH_SIZE: 50, // Process mutations in batches
  CACHE_SIZE: 1000, // Maximum cache entries
  MIN_TEXT_LENGTH: 2,
  IGNORED_CLASSES: ['card-icon', 'material-icons', 'icon', 'fa', 'fas', 'far', 'banner-icon'],
  OBSERVE_CONFIG: {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ['placeholder', 'value', 'alt', 'title']
  }
};

// ========================================
// CACHING SYSTEM
// ========================================

class TranslationCache {
  constructor(maxSize = CONFIG.CACHE_SIZE) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hashCache = new Map(); // Cache for hashes
  }

  async getHash(text) {
    if (this.hashCache.has(text)) {
      return this.hashCache.get(text);
    }
    
    const encoder = new TextEncoder();
    // Include language in hash to ensure unique hashes per language
    const data = encoder.encode(text + '|' + CONFIG.TARGET_LANGUAGE);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Maintain cache size
    if (this.hashCache.size >= this.maxSize) {
      const firstKey = this.hashCache.keys().next().value;
      this.hashCache.delete(firstKey);
    }
    
    this.hashCache.set(text, hash);
    return hash;
  }

  setTranslation(hash, translation) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(hash, translation);
  }

  getTranslation(hash) {
    return this.cache.get(hash);
  }

  hasTranslation(hash) {
    return this.cache.has(hash);
  }
}

const translationCache = new TranslationCache();

// ========================================
// TEXT VALIDATION - Exclude numeric/code content
// ========================================

function shouldTranslateText(text) {
  const trimmed = text.trim();
  
  // Early returns for common cases
  if (!trimmed || trimmed.length < CONFIG.MIN_TEXT_LENGTH) return false;
  
  // Check if already translated
  if (trimmed.startsWith(CONFIG.TRANSLATION_PREFIX)) return false;

  // Heuristic: If it's short and has no letters, it's likely an icon, number, or symbol
  // This handles cases like "✏️", "✖️", "123", "..."
  if (trimmed.length < 5 && !/[a-zA-Z]/.test(trimmed)) return false;
  
  // Combined regex for efficiency
  const patterns = [
    /^[\d\s,.\-\/]+$/,                                    // Pure numbers
    /^\(\d+\)$/,                                          // Parenthetical numbers like (3), (10), (999)
    /^\[\d+\]$/,                                          // Bracketed numbers like [1], [42]
    /^[\+]?[\d\s\(\)\-\.]{7,}$/,                         // Phone numbers
    /^\d{1,4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,4}$/,          // Dates
    /^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM|am|pm))?$/i,     // Times
    /^[A-Z]{0,4}\d[\d\-_#]*$/i,                          // Codes/IDs
    /^\d+(\.\d+)?%$/,                                    // Percentages
    /^[\$€£¥₹][\d,.\s]+$/,                               // Currency
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,                        // Email
    /^(https?:\/\/|www\.)/i,                             // URLs
    /^v?\d+\.\d+(\.\d+)?$/i,                             // Version numbers
    /^[\d\.,]+\s*(lbs|kg|g|mg|mcg|oz|lb|in|cm|mm|ft|m|km|mmHg|bpm|F|C|K|%|years|y\/o|days|weeks|months|hr|min|sec|mL|L)$/i, // Measurements with units
    /^\d+\s*\/\s*\d+(\s*[a-zA-Z]+)?$/,                   // Ratios like 120/80 or 120/80 mmHg
    /^\d+['"]\s*\d+['"]?$/                               // Height like 5'9"
  ];
  
  // Check all patterns
  if (patterns.some(pattern => pattern.test(trimmed))) return false;
  
  // Check digit ratio (>70% digits)
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (digitCount / trimmed.length > 0.7) return false;
  
  // Check for month names in dates
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{1,2}[\s,]+\d{2,4}$/i.test(trimmed)) {
    return false;
  }
  
  // Check file extensions
  if (/\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|zip|txt|csv)$/i.test(trimmed)) {
    return false;
  }
  
  return true;
}

// ========================================
// ELEMENT PROCESSING
// ========================================

class ElementProcessor {
  constructor() {
    this.processedTextNodes = new WeakSet();
    this.processedFormElements = new WeakMap(); // Use WeakMap for form elements
    this.elementHashes = new WeakMap();
  }

  async processTextNode(node) {
    if (this.processedTextNodes.has(node)) return null;
    
    const text = node.textContent.trim();
    if (!shouldTranslateText(text)) return null;
    
    const parent = node.parentElement;
    if (!parent) return null;
    
    const tagName = parent.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'iframe', 'svg'].includes(tagName)) {
      return null;
    }

    // Check for ignored classes
    if (CONFIG.IGNORED_CLASSES.some(cls => parent.classList.contains(cls))) {
      return null;
    }
    
    const hash = await translationCache.getHash(text);
    this.processedTextNodes.add(node);
    this.elementHashes.set(node, hash);
    
    return {
      type: 'text',
      node,
      text,
      hash,
      parent: parent.tagName,
      className: parent.className || ''
    };
  }

  async processFormElement(element, attribute, value) {
    // Check if this element-attribute combination has been processed
    if (!this.processedFormElements.has(element)) {
      this.processedFormElements.set(element, new Set());
    }
    
    const processedAttributes = this.processedFormElements.get(element);
    if (processedAttributes.has(attribute)) return null;
    
    if (!value || !shouldTranslateText(value)) return null;
    
    const hash = await translationCache.getHash(value);
    processedAttributes.add(attribute);
    
    return {
      type: 'form',
      element,
      attribute,
      text: value,
      hash,
      parent: element.tagName,
      className: element.className || ''
    };
  }

  async processElement(element) {
    const results = [];
    
    // Process different element types
    const processors = [
      // Input buttons and submit buttons
      async () => {
        if (['button', 'submit', 'reset'].includes(element.type) && element.value) {
          const result = await this.processFormElement(element, 'value', element.value);
          if (result) results.push(result);
        }
      },
      // Placeholders
      async () => {
        if (element.placeholder) {
          const result = await this.processFormElement(element, 'placeholder', element.placeholder);
          if (result) results.push(result);
        }
      },
      // Alt text
      async () => {
        if (element.alt) {
          const result = await this.processFormElement(element, 'alt', element.alt);
          if (result) results.push(result);
        }
      },
      // Title attributes
      async () => {
        if (element.title) {
          const result = await this.processFormElement(element, 'title', element.title);
          if (result) results.push(result);
        }
      },
      // Button text content
      async () => {
        if (element.tagName === 'BUTTON') {
          const text = element.textContent.trim();
          if (shouldTranslateText(text)) {
            const hash = await translationCache.getHash(text);
            results.push({
              type: 'form',
              element,
              attribute: 'textContent',
              text,
              hash,
              parent: element.tagName,
              className: element.className || ''
            });
          }
        }
      },
      // Option elements
      async () => {
        if (element.tagName === 'OPTION') {
          const text = element.textContent.trim();
          if (shouldTranslateText(text)) {
            const hash = await translationCache.getHash(text);
            results.push({
              type: 'form',
              element,
              attribute: 'textContent',
              text,
              hash,
              parent: element.tagName,
              className: element.className || ''
            });
          }
        }
      },
      // Label elements
      async () => {
        if (element.tagName === 'LABEL') {
          const text = element.textContent.trim();
          if (shouldTranslateText(text)) {
            const hash = await translationCache.getHash(text);
            results.push({
              type: 'form',
              element,
              attribute: 'textContent',
              text,
              hash,
              parent: element.tagName,
              className: element.className || ''
            });
          }
        }
      }
    ];
    
    // Run all processors in parallel
    await Promise.all(processors.map(p => p()));
    
    return results;
  }
}

const elementProcessor = new ElementProcessor();

// ========================================
// WEBSOCKET COMMUNICATION
// ========================================

class SocketManager {
  constructor(url = 'ws://localhost:8080') {
    this.url = url;
    this.socket = null;
    this.sendQueue = new Set(); // Store hashes to send
    this.sentHashes = new Set(); // Track what we've already sent
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.pendingNodes = new Map(); // Store nodes waiting for translation
  }

  connect() {
    console.log(`🔌 Connecting to translation backend at ${this.url}...`);
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log('✅ Connected to backend');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.flushQueue();
    };

    this.socket.onclose = () => {
      console.log('❌ Disconnected from backend');
      this.isConnected = false;
      this.retryConnection();
    };

    this.socket.onerror = (error) => {
      console.error('⚠️ WebSocket error:', error);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };
  }

  retryConnection() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`🔄 Retrying connection in ${delay}ms...`);
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  queueForTranslation(text, hash) {
    if (this.sentHashes.has(hash)) return;
    
    this.sendQueue.add(JSON.stringify({ 
      text, 
      hash, 
      targetLang: CONFIG.TARGET_LANGUAGE 
    }));
    this.sentHashes.add(hash);
    
    if (this.isConnected) {
      this.flushQueue();
    }
  }

  flushQueue() {
    if (this.sendQueue.size === 0) return;

    const batch = Array.from(this.sendQueue).map(item => JSON.parse(item));
    this.sendQueue.clear();

    this.socket.send(JSON.stringify({
      type: 'translation_request',
      payload: batch
    }));
    
    console.log(`📤 Sent ${batch.length} items to backend`);
  }

  registerPending(hash, item) {
    if (!this.pendingNodes.has(hash)) {
      this.pendingNodes.set(hash, new Set());
    }
    this.pendingNodes.get(hash).add(item);
  }

  handleMessage(data) {
    if (data.type === 'translation_result') {
      const { hash, translated } = data;
      
      // Ensure the translation has the prefix so it's ignored by the observer
      const finalTranslation = translated.startsWith(CONFIG.TRANSLATION_PREFIX) 
        ? translated 
        : CONFIG.TRANSLATION_PREFIX + translated;

      // Update cache with the prefixed version
      translationCache.setTranslation(hash, finalTranslation);
      
      // Update pending nodes
      if (this.pendingNodes.has(hash)) {
        const items = this.pendingNodes.get(hash);
        
        for (const item of items) {
          if (item.type === 'text' && item.node) {
            item.node.textContent = finalTranslation;
          } else if (item.type === 'form' && item.element) {
            if (item.attribute === 'textContent') {
              item.element.textContent = finalTranslation;
            } else {
              item.element.setAttribute(item.attribute, finalTranslation);
            }
          }
        }
        
        this.pendingNodes.delete(hash);
      }
    } else if (data.type === 'ack') {
      console.log(`📩 Server acknowledged: ${data.message}`);
    } else {
      console.log('📩 Received from backend:', data);
    }
  }
}

const socketManager = new SocketManager();

// ========================================
// TRANSLATION APPLICATION
// ========================================

async function applyTranslation(item) {
  // Check if we already have a final translation in cache
  if (translationCache.hasTranslation(item.hash)) {
    const translatedText = translationCache.getTranslation(item.hash);
    
    if (item.type === 'text' && item.node) {
      item.node.textContent = translatedText;
    } else if (item.type === 'form' && item.element) {
      if (item.attribute === 'textContent') {
        item.element.textContent = translatedText;
      } else {
        item.element.setAttribute(item.attribute, translatedText);
      }
    }
    return;
  }

  // Queue for backend translation
  socketManager.queueForTranslation(item.text, item.hash);
  
  // Register for updates
  socketManager.registerPending(item.hash, item);

  // Apply placeholder while waiting
  const placeholderText = CONFIG.TRANSLATION_PREFIX + item.text;
  
  if (item.type === 'text' && item.node && item.node.parentElement) {
    item.node.textContent = placeholderText;
  } else if (item.type === 'form' && item.element) {
    if (item.attribute === 'textContent') {
      item.element.textContent = placeholderText;
    } else {
      item.element.setAttribute(item.attribute, placeholderText);
    }
  }
}

// ========================================
// BATCH PROCESSING
// ========================================

async function processBatch(items) {
  const startTime = performance.now();
  
  // Apply translations in parallel batches
  const batchPromises = [];
  for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
    const batch = items.slice(i, i + CONFIG.BATCH_SIZE);
    batchPromises.push(
      Promise.all(batch.map(item => applyTranslation(item)))
    );
  }
  
  await Promise.all(batchPromises);
  
  const endTime = performance.now();
  console.log(`⚡ Processed ${items.length} items in ${(endTime - startTime).toFixed(2)}ms`);
}

// ========================================
// INITIAL PAGE SCAN
// ========================================

async function scanPage() {
  console.log('📋 Performing initial page scan...\n');
  
  const items = [];
  
  // Process text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  const textNodePromises = [];
  while (node = walker.nextNode()) {
    textNodePromises.push(elementProcessor.processTextNode(node));
  }
  
  const textResults = await Promise.all(textNodePromises);
  items.push(...textResults.filter(Boolean));
  
  // Process form elements
  const formSelectors = [
    'input[type="button"], input[type="submit"], input[type="reset"]',
    'input[placeholder], textarea[placeholder]',
    'button',
    'option',
    'label',
    'img[alt]',
    '[title]'
  ];
  
  const formPromises = [];
  for (const selector of formSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      formPromises.push(elementProcessor.processElement(element));
    }
  }
  
  const formResults = await Promise.all(formPromises);
  items.push(...formResults.flat().filter(Boolean));
  
  console.log(`📊 Found ${items.length} translatable items`);
  
  // Apply translations
  await processBatch(items);
  
  return items;
}

// ========================================
// MUTATION OBSERVER
// ========================================

class OptimizedMutationHandler {
  constructor() {
    this.pendingMutations = new Set();
    this.debounceTimer = null;
    this.observer = null;
  }

  async handleMutations(mutations) {
    // Collect all mutations
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Handle added nodes
        for (const node of mutation.addedNodes) {
          this.pendingMutations.add(node);
        }
      } else if (mutation.type === 'characterData') {
        // Handle text changes
        this.pendingMutations.add(mutation.target);
      } else if (mutation.type === 'attributes') {
        // Handle attribute changes
        this.pendingMutations.add(mutation.target);
      }
    }
    
    // Debounce processing
    this.scheduleProcessing();
  }

  scheduleProcessing() {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Schedule new processing
    this.debounceTimer = setTimeout(() => {
      this.processPendingMutations();
    }, CONFIG.DEBOUNCE_DELAY);
  }

  async processPendingMutations() {
    if (this.pendingMutations.size === 0) return;
    
    const nodesToProcess = Array.from(this.pendingMutations);
    this.pendingMutations.clear();
    
    console.log(`🔄 Processing ${nodesToProcess.length} mutations...`);
    
    const items = [];
    const promises = [];
    
    for (const node of nodesToProcess) {
      // Skip if already processed (check appropriate collection)
      if (node.nodeType === Node.TEXT_NODE) {
        if (elementProcessor.processedTextNodes.has(node)) continue;
        // Process text node
        promises.push(elementProcessor.processTextNode(node));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Process element and its descendants
        promises.push(this.processElementTree(node));
      }
    }
    
    const results = await Promise.all(promises);
    items.push(...results.flat().filter(Boolean));
    
    if (items.length > 0) {
      await processBatch(items);
      console.log(`✅ Processed ${items.length} new items from mutations`);
    }
  }

  async processElementTree(element) {
    const items = [];
    
    // Process the element itself
    const elementResults = await elementProcessor.processElement(element);
    items.push(...elementResults);
    
    // Process all text nodes within
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    const textPromises = [];
    while (node = walker.nextNode()) {
      textPromises.push(elementProcessor.processTextNode(node));
    }
    
    const textResults = await Promise.all(textPromises);
    items.push(...textResults.filter(Boolean));
    
    // Process all form elements within
    const formElements = element.querySelectorAll('input, button, textarea, select, option, label, img[alt], [title]');
    const formPromises = [];
    for (const el of formElements) {
      formPromises.push(elementProcessor.processElement(el));
    }
    
    const formResults = await Promise.all(formPromises);
    items.push(...formResults.flat().filter(Boolean));
    
    return items;
  }

  start() {
    if (this.observer) return;
    
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });
    
    this.observer.observe(document.body, CONFIG.OBSERVE_CONFIG);
    console.log('👁️ MutationObserver started');
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log('🛑 MutationObserver stopped');
    }
  }
}

const mutationHandler = new OptimizedMutationHandler();

// ========================================
// PUBLIC API
// ========================================

window.translationSystem = {
  // Set target language
  setLanguage(langCode) {
    console.log(`🌐 Switching language to: ${langCode}`);
    CONFIG.TARGET_LANGUAGE = langCode;
    
    // Clear caches to force re-hashing and re-sending
    this.clearCache();
    socketManager.sentHashes.clear();
    
    console.log(`✅ Language set to ${langCode}. New content will be hashed for ${langCode}.`);
  },

  // Start the system
  async start() {
    console.log('🚀 Starting translation system...\n');
    
    // Initial scan
    const items = await scanPage();
    
    // Start mutation observer
    mutationHandler.start();
    
    // Summary
    console.log('\n📈 Summary:');
    console.log(`   Initial items translated: ${items.length}`);
    console.log(`   Unique translations cached: ${translationCache.cache.size}`);
    console.log(`   MutationObserver: Active`);
    console.log('\n✅ Translation system ready!');
    
    return items;
  },
  
  // Stop mutation observer
  stop() {
    mutationHandler.stop();
  },
  
  // Manually trigger a scan
  async rescan() {
    console.log('🔄 Manual rescan triggered...');
    return await scanPage();
  },

  // Get all translations
  getTranslations() {
    const tableData = [];
    for (const [text, hash] of translationCache.hashCache.entries()) {
      const translation = translationCache.getTranslation(hash) || '(Pending)';
      tableData.push({
        'Original Text': text,
        'Hash': hash,
        'Translation': translation
      });
    }

    if (tableData.length > 0) {
      console.log('\n📝 Translation Status:');
      console.table(tableData);
    } else {
      console.log('\n📝 No content discovered yet.');
    }
    
    return tableData;
  },
  
  // Get statistics
  getStats() {
    const stats = {
      cacheSize: translationCache.cache.size,
      hashCacheSize: translationCache.hashCache.size,
      observerActive: mutationHandler.observer !== null
    };

    // Generate table data
    const tableData = [];
    for (const [text, hash] of translationCache.hashCache.entries()) {
      tableData.push({
        'Original Text': text,
        'Hash': hash
      });
    }

    console.log('📊 System Statistics:', stats);

    if (tableData.length > 0) {
      console.log('\n📝 Discovered Content (Ready for Backend):');
      console.table(tableData);
    } else {
      console.log('\n📝 No content discovered yet.');
    }

    return {
      summary: stats,
      details: tableData
    };
  },

  // Get socket status
  getSocketStatus() {
    return {
      connected: socketManager.isConnected,
      queueSize: socketManager.sendQueue.size,
      sentCount: socketManager.sentHashes.size,
      url: socketManager.url
    };
  },
  
  // Clear cache
  clearCache() {
    translationCache.cache.clear();
    translationCache.hashCache.clear();
    console.log('🗑️ Cache cleared');
  },
  
  // Apply custom translations
  async applyCustomTranslations(translations) {
    console.log(`\n🔄 Applying ${translations.length} custom translations...`);
    
    for (const { hash, translatedText } of translations) {
      translationCache.setTranslation(hash, translatedText);
      
      // Find and update all matching elements
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        const nodeHash = await translationCache.getHash(text);
        if (nodeHash === hash && node.parentElement) {
          node.textContent = translatedText;
        }
      }
      
      // Update form elements
      const formElements = document.querySelectorAll('input, button, textarea, select, option, label, img, [title]');
      for (const element of formElements) {
        for (const attr of ['value', 'placeholder', 'alt', 'title']) {
          const value = element.getAttribute(attr);
          if (value) {
            const attrHash = await translationCache.getHash(value);
            if (attrHash === hash) {
              element.setAttribute(attr, translatedText);
            }
          }
        }
        
        // Check textContent for buttons, options, labels
        if (['BUTTON', 'OPTION', 'LABEL'].includes(element.tagName)) {
          const text = element.textContent.trim();
          const textHash = await translationCache.getHash(text);
          if (textHash === hash) {
            element.textContent = translatedText;
          }
        }
      }
    }
    
    console.log('✅ Custom translations applied');
  }
};

// ========================================
// AUTO-START
// ========================================

// Auto-start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.translationSystem.start();
  });
} else {
  // DOM is already loaded
  window.translationSystem.start();
}

// Start WebSocket connection
socketManager.connect();

console.log('\n🎉 Translation system initialized!');
console.log('🛠️  Available Commands:');
console.log('   window.translationSystem.setLanguage("es")   - Switch target language');
console.log('   window.translationSystem.getTranslations()   - View all translations');
console.log('   window.translationSystem.getStats()          - View system statistics');
console.log('   window.translationSystem.getSocketStatus()   - Check backend connection');
console.log('   window.translationSystem.rescan()            - Manually rescan page');
console.log('   window.translationSystem.stop()              - Stop observing changes');
console.log('   window.translationSystem.start()             - Restart system');
console.log('   window.translationSystem.clearCache()        - Clear translation cache');