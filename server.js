// server.js - Backend for Multiplayer Flappy Bird
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (your frontend HTML/CSS/JS)
app.use(express.static('public'));

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

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
const PIPE_SPAWN_INTERVAL = 90; // frames (every 1.5 seconds at 60fps)
const PIPE_SPEED = 3;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Update pipes on server side
function updatePipes() {
  // Check if any player has started
  let anyPlayerStarted = false;
  players.forEach(player => {
    if (player.hasStarted) {
      anyPlayerStarted = true;
    }
  });

  // Only update pipes if at least one player has started
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

  // Spawn new pipes
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

  // Move pipes
  gameState.pipes = gameState.pipes.filter(pipe => pipe.x > -PIPE_WIDTH);
  gameState.pipes.forEach(pipe => {
    pipe.x -= PIPE_SPEED;
  });
}

// Game loop - runs on server to keep pipes synchronized
let lastBroadcast = Date.now();
setInterval(() => {
  updatePipes();
  
  // Only broadcast every 16ms (60fps) to reduce load
  const now = Date.now();
  if (now - lastBroadcast >= 16) {
    lastBroadcast = now;
    broadcast({
      type: 'pipeUpdate',
      pipes: gameState.pipes
    });
  }
}, 16); // ~60 FPS

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch(data.type) {
        case 'join':
          // New player joins
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
          
          // Send current game state to new player
          ws.send(JSON.stringify({
            type: 'init',
            playerId: playerId,
            players: Array.from(players.values()),
            pipes: gameState.pipes
          }));

          // Notify all other players about new player
          broadcast({
            type: 'playerJoined',
            player: newPlayer
          }, ws);

          console.log(`Player ${data.username} joined (${playerId})`);
          break;

        case 'update':
          // Update player position and state
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId);
            player.y = data.y;
            player.score = data.score;
            player.isAlive = data.isAlive;
            player.hasStarted = data.hasStarted;

            // Only broadcast player updates every few frames to reduce traffic
            if (Math.random() < 0.3) { // 30% of updates get broadcast
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
          }
          break;

        case 'scoreUpdate':
          // Dedicated score update (more reliable)
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId);
            player.score = data.score;
            
            // Broadcast score update to everyone
            broadcast({
              type: 'scoreUpdate',
              playerId: playerId,
              score: data.score
            });
          }
          break;

        case 'leave':
          // Player leaves
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
    // Remove player when connection closes
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

// Broadcast message to all connected clients except sender
function broadcast(data, excludeWs = null) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

console.log('WebSocket server is ready for connections');
console.log('Game loop running - pipes synchronized across all clients');
