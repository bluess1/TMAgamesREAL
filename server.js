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
            isAlive: true
          };
          
          players.set(playerId, newPlayer);
          
          // Send all current players to new player
          ws.send(JSON.stringify({
            type: 'players',
            players: Array.from(players.values())
          }));

          // Notify all other players about new player
          broadcast({
            type: 'playerUpdate',
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

            // Broadcast update to all other players
            broadcast({
              type: 'playerUpdate',
              player: player
            }, ws);
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

// Generate unique player ID
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

console.log('WebSocket server is ready for connections');