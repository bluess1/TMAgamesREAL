const WebSocket = require('ws');

// WebSocket server for chat app
const wssChatApp = new WebSocket.Server({ noServer: true });

// Store users and messages
const chatUsers = new Map(); // userId -> { username, ws, status }
const globalMessages = []; // Array of messages
const directMessages = new Map(); // conversationId -> Array of messages
const MAX_MESSAGES = 500;
const MESSAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Clean old messages every hour
setInterval(() => {
  const now = Date.now();
  
  // Clean global messages
  const validGlobal = globalMessages.filter(msg => (now - msg.timestamp) < MESSAGE_EXPIRY);
  globalMessages.length = 0;
  globalMessages.push(...validGlobal);
  
  // Clean DMs
  directMessages.forEach((messages, convId) => {
    const validDMs = messages.filter(msg => (now - msg.timestamp) < MESSAGE_EXPIRY);
    if (validDMs.length === 0) {
      directMessages.delete(convId);
    } else {
      directMessages.set(convId, validDMs);
    }
  });
  
  console.log(`💬 Chat cleaned: ${globalMessages.length} global, ${directMessages.size} DM conversations`);
}, 60 * 60 * 1000); // Every hour

function getConversationId(user1, user2) {
  return [user1, user2].sort().join(':');
}

function addMessage(type, sender, content, recipient = null) {
  const msg = {
    id: generateId(),
    type: type, // 'text', 'file', 'image'
    sender: sender,
    content: content,
    recipient: recipient,
    timestamp: Date.now()
  };
  
  if (recipient) {
    // DM
    const convId = getConversationId(sender, recipient);
    if (!directMessages.has(convId)) {
      directMessages.set(convId, []);
    }
    const conversation = directMessages.get(convId);
    conversation.push(msg);
    if (conversation.length > MAX_MESSAGES) {
      conversation.shift();
    }
  } else {
    // Global
    globalMessages.push(msg);
    if (globalMessages.length > MAX_MESSAGES) {
      globalMessages.shift();
    }
  }
  
  return msg;
}

wssChatApp.on('connection', (ws) => {
  console.log('💬 New chat app user connected');
  
  let userId = null;
  let username = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch(data.type) {
        case 'join':
          userId = generateId();
          username = data.username;
          
          chatUsers.set(userId, {
            username: username,
            ws: ws,
            status: 'online'
          });
          
          console.log(`💬 ${username} joined chat app (${userId})`);
          
          // Send recent global messages (last 50)
          const recentGlobal = globalMessages.slice(-50);
          ws.send(JSON.stringify({
            type: 'init',
            userId: userId,
            globalMessages: recentGlobal,
            users: Array.from(chatUsers.values()).map(u => ({
              username: u.username,
              status: u.status
            }))
          }));
          
          // Notify everyone
          broadcastUserList();
          broadcastToAll({
            type: 'systemMessage',
            message: `${username} joined the chat`
          });
          break;

        case 'sendGlobal':
          if (!userId) break;
          
          const globalMsg = addMessage(data.contentType || 'text', username, data.content);
          
          broadcastToAll({
            type: 'globalMessage',
            message: globalMsg
          });
          break;

        case 'sendDM':
          if (!userId) break;
          
          const targetUser = Array.from(chatUsers.entries())
            .find(([id, u]) => u.username === data.recipient);
          
          if (!targetUser) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'User not found'
            }));
            break;
          }
          
          const dmMsg = addMessage(
            data.contentType || 'text',
            username,
            data.content,
            data.recipient
          );
          
          // Send to recipient
          if (targetUser[1].ws.readyState === WebSocket.OPEN) {
            targetUser[1].ws.send(JSON.stringify({
              type: 'directMessage',
              message: dmMsg
            }));
          }
          
          // Echo back to sender
          ws.send(JSON.stringify({
            type: 'directMessage',
            message: dmMsg
          }));
          break;

        case 'loadDMs':
          if (!userId) break;
          
          const convId = getConversationId(username, data.withUser);
          const conversation = directMessages.get(convId) || [];
          
          ws.send(JSON.stringify({
            type: 'dmHistory',
            withUser: data.withUser,
            messages: conversation
          }));
          break;

        case 'typing':
          if (!userId) break;
          
          if (data.recipient) {
            // Typing in DM
            const target = Array.from(chatUsers.entries())
              .find(([id, u]) => u.username === data.recipient);
            
            if (target && target[1].ws.readyState === WebSocket.OPEN) {
              target[1].ws.send(JSON.stringify({
                type: 'userTyping',
                username: username,
                isTyping: data.isTyping
              }));
            }
          } else {
            // Typing in global
            broadcastToAll({
              type: 'userTyping',
              username: username,
              isTyping: data.isTyping
            }, ws);
          }
          break;

        case 'setStatus':
          if (!userId) break;
          
          const user = chatUsers.get(userId);
          if (user) {
            user.status = data.status; // online, away, busy
            broadcastUserList();
          }
          break;
      }
    } catch (error) {
      console.error('💬 Chat app error:', error);
    }
  });

  ws.on('close', () => {
    if (userId && chatUsers.has(userId)) {
      const user = chatUsers.get(userId);
      console.log(`💬 ${user.username} left chat app`);
      
      broadcastToAll({
        type: 'systemMessage',
        message: `${user.username} left the chat`
      });
      
      chatUsers.delete(userId);
      broadcastUserList();
    }
  });

  ws.on('error', (error) => {
    console.error('💬 Chat app WebSocket error:', error);
  });
});

function broadcastToAll(data, excludeWs = null) {
  const message = JSON.stringify(data);
  chatUsers.forEach((user) => {
    if (user.ws !== excludeWs && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

function broadcastUserList() {
  const users = Array.from(chatUsers.values()).map(u => ({
    username: u.username,
    status: u.status
  }));
  
  broadcastToAll({
    type: 'userList',
    users: users
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

module.exports = { wssChatApp };

console.log('💬 Full Chat App server ready!');
