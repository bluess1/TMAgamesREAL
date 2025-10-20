const express = require('express');
const WebSocket = require('ws');
const path = require('path');

// Create Express app
const app = express();

// Serve static files from public folder
app.use(express.static(path.join(process.cwd(), 'public')));

// Catch-all to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Export Express app for Vercel serverless
module.exports = app;

// WebSocket server setup (Vercel-compatible)
const server = app.listen(process.env.PORT || 3000);

// Store connected players
const players = new Map();

// Shared game state - synchronized pipes for all players
let gameState = {
  pipes: [],
  frameCount: 0,
  lastUpdate: Date.now(),
  gameStarted: false
};

// Game constants
const PIPE_SPAWN_INTERVAL = 90;
const PIPE_SPEED = 3;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Update pipes on server side
function updatePipes() {
  let anyPlayerStarted = false;
  players.forEach(player => {
    if (player.hasStarted) {
      anyPlayerStarted = true;
    }
  });

  if (!anyPlayerStarted) {
    gameState.gameStarted = false;
    gameState.pipes = [];
    gameState.frameCount = 0;
    return;
  }

  if (!gameState.gameStarted) {
    gameState.gameStarted = true;
    gameState.frameCount = 0;
    gameState.pipes = [];
  }

  gameState.frameCount++;
  if (gameState.frameCount % PIPE_SPAWN_INTERVAL === 0) {
    const pipeHeight = Math.random() * (CANVAS_HEIGHT - PIPE_GAP - 100) + 50;
    gameState.pipes.push({
      id: generateId(),
      x: CANVAS_WIDTH,
      topHeight: pipeHeight,
      bottomY: pipeHeight + PIPE_GAP
    });
  }

  gameState.pipes = gameState.pipes.filter(pipe => pipe.x > -PIPE_WIDTH);
  gameState.pipes.forEach(pipe => {
    pipe.x -= PIPE_SPEED;
  });
}

// Game loop
let lastBroadcast = Date.now();
setInterval(() => {
  updatePipes();
  
  const now = Date.now();
  if (now - lastBroadcast >= 16) {
    lastBroadcast = now;
    broadcast({
      type: 'pipeUpdate',
      pipes: gameState.pipes
    });
  }
}, 16);

// WebSocket server
const wss = new WebSocket.Server({ 
  server,
  // Vercel WebSocket settings
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    skipNegotiate: true
  }
});

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch(data.type) {
        case 'join':
          playerId = generateId();
          const newPlayer = {
            id: playerId,
            username: data.username,
            y: 250,
            score: 0,
            isAlive: true,
            hasStarted: false
          };
          
          players.set(playerId, newPlayer);
          
          ws.send(JSON.stringify({
            type: 'init',
            playerId: playerId,
            players: Array.from(players.values()),
            pipes: gameState.pipes
          }));

          broadcast({
            type: 'playerJoined',
            player: newPlayer
          }, ws);

          console.log(`Player ${data.username} joined (${playerId})`);
          break;

        case 'update':
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId);
            player.y = data.y;
            player.score = data.score;
            player.isAlive = data.isAlive;
            player.hasStarted = data.hasStarted;

            broadcast({
              type: 'playerUpdate',
              player: {
                id: player.id,
                username: player.username,
                y: player.y,
                score: player.score,
                isAlive: player.isAlive,
                hasStarted: player.hasStarted
              }
            }, ws);
          }
          break;

        case 'scoreUpdate':
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId);
            player.score = data.score;
            
            broadcast({
              type: 'scoreUpdate',
              playerId: playerId,
              score: data.score
            });
          }
          break;

        case 'leave':
          if (playerId && players.has(playerId)) {
            players.delete(playerId);
            broadcast({
              type: 'playerLeft',
              playerId: playerId
            });
            console.log(`Player left (${playerId})`);
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (playerId && players.has(playerId)) {
      const username = players.get(playerId).username;
      players.delete(playerId);
      broadcast({
        type: 'playerLeft',
        playerId: playerId
      });
      console.log(`Player ${username} disconnected (${playerId})`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcast(data, excludeWs = null) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

console.log('Multiplayer Flappy Bird server ready!');
