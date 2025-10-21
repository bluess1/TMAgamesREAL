const WebSocket = require('ws');

// WebSocket server for global chat
const wssChat = new WebSocket.Server({ noServer: true });

// Store connected chat users
const chatUsers = new Map(); // userId -> { username, ws }

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
          
          // Send user count to everyone
          broadcastUserCount();
          
          // Notify everyone
          broadcastChat({
            type: 'systemMessage',
            message: `${data.username} joined the chat`
          });
          break;

        case 'chat':
          // Global chat message
          if (userId && chatUsers.has(userId)) {
            const user = chatUsers.get(userId);
            console.log(`💬 ${user.username}: ${data.message}`);
            
            broadcastChat({
              type: 'chatMessage',
              sender: user.username,
              message: data.message
            }, ws);
          }
          break;

        case 'dm':
          // Direct message
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
      
      broadcastChat({
        type: 'systemMessage',
        message: `${user.username} left the chat`
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

console.log('💬 Global chat server ready!');
