const WebSocket = require('ws');
const async = require('async');
const https = require('https');
const { createCache } = require('cache-manager');
require('dotenv').config();

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });
const API_KEY = process.env.AI_API_KEY;

// Initialize cache
const memoryCache = createCache();

console.log(`🚀 Translation Backend started on port ${PORT}`);

// Queue for processing translations
const translationQueue = async.queue(async (task) => {
  const { item, ws, targetLang } = task;
  
  try {
    // Check cache first
    const cachedTranslation = await memoryCache.get(item.hash);
    
    if (cachedTranslation) {
      console.log(`⚡ Cache hit for: "${item.text.substring(0, 20)}..."`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'translation_result',
          hash: item.hash,
          original: item.text,
          translated: cachedTranslation
        }));
      }
      return;
    }

    console.log(`🔄 Processing: "${item.text}" -> ${targetLang}`);
    
    const translatedText = await translateText(item.text, targetLang);
    
    // Cache the result
    await memoryCache.set(item.hash, translatedText);

    // Send result back to client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'translation_result',
        hash: item.hash,
        original: item.text,
        translated: translatedText
      }));
      console.log(`✅ Sent: "${translatedText}"`);
    }
  } catch (error) {
    console.error(`❌ Translation failed for "${item.text}":`, error.message);
  }
}, 5); // Concurrency of 5

async function translateText(text, targetLang) {
  const API_KEY = process.env.BLUEHIVE_API_KEY || process.env.AI_API_KEY;
  
  console.log(`🤖 Calling Ozwell AI API...`);
  
  const data = JSON.stringify({
    prompt: `Translate the following text to ${targetLang} language code.

Text to translate: "${text}"

Instructions:
- Use terminology that is widely recognized and used by healthcare professionals and patients.
- Avoid literal translations if they sound unnatural; prefer phrases that convey the intended meaning in a way that feels native.
- If a direct equivalent does not exist, use a descriptive phrase that would be easily understood in a clinical context.
- Ensure the translation is suitable for patient-facing EHR interfaces.
- Preserve any medical abbreviations or codes if they are universally used.

Return ONLY the most natural and contextually appropriate translation, with no additional explanation or markup.`,
    systemMessage: "You are a professional translator. You are translating an EHR website content. Provide only the translation without any explanations or additional text."
  });

  const options = {
    hostname: 'ai.bluehive.com',
    port: 443,
    path: '/api/v1/completion',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`BlueHive AI API error: ${res.statusCode}\n${responseData}`));
        } else {
          try {
            const jsonData = JSON.parse(responseData);
            // Handle different response structures if needed, but prioritizing the user's structure
            const translation = jsonData.choices?.[0]?.message?.content?.trim() || 
                              jsonData.choices?.[0]?.text?.trim() || 
                              jsonData.text?.trim() || 
                              text;
            resolve(translation);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}\n${responseData}`));
          }
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'translation_request') {
        const targetLang = data.payload[0]?.targetLang || 'es';
        console.log(`📥 Queuing batch of ${data.payload.length} items for language: ${targetLang}`);
        
        data.payload.forEach(item => {
          translationQueue.push({ item, ws, targetLang });
        });

        // Acknowledge receipt
        ws.send(JSON.stringify({
          type: 'ack',
          count: data.payload.length,
          message: 'Items queued for translation'
        }));
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  });

  ws.on('close', () => {
    console.log('❌ Client disconnected');
  });
});
