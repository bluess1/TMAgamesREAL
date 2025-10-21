const express = require('express');
const WebSocket = require('ws');
const path = require('path');

// Create Express app
const app = express();

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Catch-all to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Game Hub server running on port ${PORT}`);
});

// WebSocket server for Flappy Bird (/flappy)
const wssFlappy = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  if (pathname === '/flappy') {
    wssFlappy.handleUpgrade(request, socket, head, (ws) => {
      wssFlappy.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Flappy Bird game state
const flappyPlayers = new Map();
let flappyGameState = {
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

// Update pipes for Flappy Bird
function updatePipes() {
  let anyPlayerStarted = false;
  flappyPlayers.forEach(player => {
    if (player.hasStarted) {
      anyPlayerStarted = true;
    }
  });

  if (!anyPlayerStarted) {
    flappyGameState.gameStarted = false;
    flappyGameState.pipes = [];
    flappyGameState.frameCount = 0;
    return;
  }

  if (!flappyGameState.gameStarted) {
    flappyGameState.gameStarted = true;
    flappyGameState.frameCount = 0;
    flappyGameState.pipes = [];
  }

  flappyGameState.frameCount++;
  if (flappyGameState.frameCount % PIPE_SPAWN_INTERVAL === 0) {
    const pipeHeight = Math.random() * (CANVAS_HEIGHT - PIPE_GAP - 100) + 50;
    flappyGameState.pipes.push({
      id: generateId(),
      x: CANVAS_WIDTH,
      topHeight: pipeHeight,
      bottomY: pipeHeight + PIPE_GAP
    });
  }

  flappyGameState.pipes = flappyGameState.pipes.filter(pipe => pipe.x > -PIPE_WIDTH);
  flappyGameState.pipes.forEach(pipe => {
    pipe.x -= PIPE_SPEED;
  });
}

// Game loop for Flappy Bird
let lastBroadcast = Date.now();
setInterval(() => {
  updatePipes();
  const now = Date.now();
  if (now - lastBroadcast >= 16) {
    lastBroadcast = now;
    broadcastFlappy({
      type: 'pipeUpdate',
      pipes: flappyGameState.pipes
    });
  }
}, 16);

// WebSocket connection handler for Flappy Bird
wssFlappy.on('connection', (ws) => {
  console.log('New Flappy Bird client connected');
  
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

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
          
          flappyPlayers.set(playerId, newPlayer);
          
          ws.send(JSON.stringify({
            type: 'init',
            playerId: playerId,
            players: Array.from(flappyPlayers.values()),
            pipes: flappyGameState.pipes
          }));

          broadcastFlappy({
            type: 'playerJoined',
            player: newPlayer
          }, ws);

          console.log(`Flappy Bird: Player ${data.username} joined (${playerId})`);
          break;

        case 'update':
          if (playerId && flappyPlayers.has(playerId)) {
            const player = flappyPlayers.get(playerId);
            player.y = data.y;
            player.score = data.score;
            player.isAlive = data.isAlive;
            player.hasStarted = data.hasStarted;

            broadcastFlappy({
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
          if (playerId && flappyPlayers.has(playerId)) {
            const player = flappyPlayers.get(playerId);
            player.score = data.score;
            
            broadcastFlappy({
              type: 'scoreUpdate',
              playerId: playerId,
              score: data.score
            });
          }
          break;

        case 'leave':
          if (playerId && flappyPlayers.has(playerId)) {
            flappyPlayers.delete(playerId);
            broadcastFlappy({
              type: 'playerLeft',
              playerId: playerId
            });
            console.log(`Flappy Bird: Player left (${playerId})`);
          }
          break;
      }
    } catch (error) {
      console.error('Flappy Bird: Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (playerId && flappyPlayers.has(playerId)) {
      const username = flappyPlayers.get(playerId).username;
      flappyPlayers.delete(playerId);
      broadcastFlappy({
        type: 'playerLeft',
        playerId: playerId
      });
      console.log(`Flappy Bird: Player ${username} disconnected (${playerId})`);
    }
  });

  ws.on('error', (error) => {
    console.error('Flappy Bird: WebSocket error:', error);
  });
});

function broadcastFlappy(data, excludeWs = null) {
  const message = JSON.stringify(data);
  wssFlappy.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

console.log('Multiplayer Flappy Bird server ready!');
