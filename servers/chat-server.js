const WebSocket = require('ws');

// WebSocket server for global chat
const wssChat = new WebSocket.Server({ noServer: true });

// Store connected chat users
const chatUsers = new Map(); // userId -> { username, ws }

// Store chat history (in memory, resets on server restart)
const chatHistory = [];
const MAX_HISTORY = 100; // Store last 100 messages
const MESSAGE_EXPIRY = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Clean old messages periodically
setInterval(() => {
  const now = Date.now();
  const validMessages = chatHistory.filter(msg => (now - msg.timestamp) < MESSAGE_EXPIRY);
  chatHistory.length = 0;
  chatHistory.push(...validMessages);
  console.log(`💬 Cleaned chat history, ${chatHistory.length} messages remaining`);
}, 60 * 60 * 1000); // Clean every hour

function addToHistory(type, sender, message, isDM = false) {
  const msg = {
    type: type,
    sender: sender,
    message: message,
    isDM: isDM,
    timestamp: Date.now()
  };
  
  chatHistory.push(msg);
  
  // Keep only last MAX_HISTORY messages
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.shift();
  }
}

// WebSocket connection handler
wssChat.on('connection', (ws) => {
  console.log('💬 New chat user connected');
  
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch(data.type) {
        case 'join':
          userId = generateId();
          chatUsers.set(userId, {
            username: data.username,
            ws: ws
          });
          
          console.log(`💬 ${data.username} joined global chat (${userId})`);
          
          // Send chat history to new user (only non-DM messages)
          const recentMessages = chatHistory.filter(msg => !msg.isDM);
          ws.send(JSON.stringify({
            type: 'chatHistory',
            messages: recentMessages
          }));
          
          // Send user count to everyone
          broadcastUserCount();
          
          // Notify everyone
          const joinMsg = `${data.username} joined the chat`;
          addToHistory('systemMessage', 'System', joinMsg);
          broadcastChat({
            type: 'systemMessage',
            message: joinMsg
          });
          break;

        case 'chat':
          // Global chat message
          if (userId && chatUsers.has(userId)) {
            const user = chatUsers.get(userId);
            console.log(`💬 ${user.username}: ${data.message}`);
            
            // Add to history
            addToHistory('chatMessage', user.username, data.message);
            
            broadcastChat({
              type: 'chatMessage',
              sender: user.username,
              message: data.message
            }, ws);
          }
          break;

        case 'dm':
          // Direct message (don't save DMs to history for privacy)
          if (userId && chatUsers.has(userId)) {
            const sender = chatUsers.get(userId);
            let targetUser = null;
            
            // Find target user by username
            chatUsers.forEach((user, id) => {
              if (user.username.toLowerCase() === data.targetUsername.toLowerCase()) {
                targetUser = user;
              }
            });
            
            if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
              targetUser.ws.send(JSON.stringify({
                type: 'dmMessage',
                sender: sender.username,
                message: data.message
              }));
              console.log(`📨 DM from ${sender.username} to ${data.targetUsername}: ${data.message}`);
            } else {
              ws.send(JSON.stringify({
                type: 'dmMessage',
                sender: 'System',
                message: `User "${data.targetUsername}" not found or offline`
              }));
            }
          }
          break;

        case 'changeUsername':
          // Change username
          if (userId && chatUsers.has(userId)) {
            const user = chatUsers.get(userId);
            const oldUsername = user.username;
            user.username = data.newUsername;
            
            console.log(`✏️ ${oldUsername} changed name to ${data.newUsername}`);
            
            const changeMsg = `${oldUsername} changed their name to ${data.newUsername}`;
            addToHistory('systemMessage', 'System', changeMsg);
            
            broadcastChat({
              type: 'usernameChanged',
              oldUsername: oldUsername,
              newUsername: data.newUsername
            });
          }
          break;
      }
    } catch (error) {
      console.error('💬 Chat error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (userId && chatUsers.has(userId)) {
      const user = chatUsers.get(userId);
      console.log(`💬 ${user.username} left chat (${userId})`);
      
      const leaveMsg = `${user.username} left the chat`;
      addToHistory('systemMessage', 'System', leaveMsg);
      
      broadcastChat({
        type: 'systemMessage',
        message: leaveMsg
      });
      
      chatUsers.delete(userId);
      broadcastUserCount();
    }
  });

  ws.on('error', (error) => {
    console.error('💬 Chat WebSocket error:', error);
  });
});

function broadcastChat(data, excludeWs = null) {
  const message = JSON.stringify(data);
  chatUsers.forEach((user) => {
    if (user.ws !== excludeWs && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

function broadcastUserCount() {
  const count = chatUsers.size;
  broadcastChat({
    type: 'userCount',
    count: count
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Export the WebSocket server
module.exports = { wssChat };

console.log('💬 Global chat server ready with history!');
