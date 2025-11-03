const express = require('express');
const { Server } = require('ws');
const path = require('path');
const flappyServer = require('./servers/flappy-server');
const newGameServer = require('./servers/new-game-server');
const chatServer = require('./servers/chat-server');
const garticServer = require('./servers/gartic-server');
const chatAppServer = require('./servers/chatapp-server');

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Game Hub server running on port ${PORT}`);
});

// Handle WebSocket upgrades for multiple games + global chat + chat app
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  
  if (pathname === '/flappy') {
    flappyServer.wssFlappy.handleUpgrade(request, socket, head, (ws) => {
      flappyServer.wssFlappy.emit('connection', ws, request);
    });
  } else if (pathname === '/new-game') {
    newGameServer.wssNewGame.handleUpgrade(request, socket, head, (ws) => {
      newGameServer.wssNewGame.emit('connection', ws, request);
    });
  } else if (pathname === '/chat') {
    chatServer.wssChat.handleUpgrade(request, socket, head, (ws) => {
      chatServer.wssChat.emit('connection', ws, request);
    });
  } else if (pathname === '/gartic') {
    garticServer.wssGartic.handleUpgrade(request, socket, head, (ws) => {
      garticServer.wssGartic.emit('connection', ws, request);
    });
  } else if (pathname === '/chatapp') {
    chatAppServer.wssChatApp.handleUpgrade(request, socket, head, (ws) => {
      chatAppServer.wssChatApp.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

console.log('Game Hub ready with all games and chat systems!');
