const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`🚀 Translation Backend started on port ${PORT}`);

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'translation_request') {
        const targetLang = data.payload[0]?.targetLang || 'unknown';
        console.log(`📥 Received batch of ${data.payload.length} items for language: ${targetLang}`);
        data.payload.forEach(item => {
          console.log(`   - [${item.hash.substring(0, 8)}...] (${item.targetLang}) "${item.text}"`);
        });

        // Acknowledge receipt (optional)
        ws.send(JSON.stringify({
          type: 'ack',
          count: data.payload.length,
          message: 'Items received for translation'
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
