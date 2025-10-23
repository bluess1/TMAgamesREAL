const express = require('express');
const { Server } = require('ws');
const path = require('path');
const flappyServer = require('./servers/flappy-server');
const newGameServer = require('./servers/new-game-server');
const chatServer = require('./servers/chat-server');
const snakeServer = require('./servers/snake-server');

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

// Stats WebSocket for player counts
const wssStats = new Server({ noServer: true });

wssStats.on('connection', (ws) => {
  console.log('Stats WebSocket client connected');
  broadcastPlayerCounts();
  ws.on('close', () => {
    console.log('Stats WebSocket client disconnected');
  });
});

function broadcastPlayerCounts() {
  const counts = {
    type: 'playerCounts',
    flappy: flappyServer.wssFlappy.clients.size,
    snake: snakeServer.wssSnake.clients.size,
    newGame: newGameServer.wssNewGame.clients.size,
    game4: 0 // Placeholder for Game 4
  };
  wssStats.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(counts));
    }
  });
}

// Broadcast player counts every 5 seconds
setInterval(broadcastPlayerCounts, 5000);

// Handle WebSocket upgrades for multiple games + global chat
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url.split('?')[0];
  if (pathname === '/flappy') {
    flappyServer.wssFlappy.handleUpgrade(request, socket, head, (ws) => {
      flappyServer.wssFlappy.emit('connection', ws, request);
      broadcastPlayerCounts();
    });
  } else if (pathname === '/snake') {
    snakeServer.wssSnake.handleUpgrade(request, socket, head, (ws) => {
      snakeServer.wssSnake.emit('connection', ws, request);
      broadcastPlayerCounts();
    });
  } else if (pathname === '/new-game') {
    newGameServer.wssNewGame.handleUpgrade(request, socket, head, (ws) => {
      newGameServer.wssNewGame.emit('connection', ws, request);
      broadcastPlayerCounts();
    });
  } else if (pathname === '/chat') {
    chatServer.wssChat.handleUpgrade(request, socket, head, (ws) => {
      chatServer.wssChat.emit('connection', ws, request);
    });
  } else if (pathname === '/stats') {
    wssStats.handleUpgrade(request, socket, head, (ws) => {
      wssStats.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

console.log('Game Hub ready with Flappy Bird, Snake, New Game, and Global Chat servers!');
