const WebSocket = require('ws');

const wssNewGame = new WebSocket.Server({ noServer: true });

// Placeholder game state
const newGamePlayers = new Map();

// WebSocket connection handler for New Game
wssNewGame.on('connection', (ws) => {
  console.log('New Game client connected');
  
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'join') {
        playerId = generateId();
        const newPlayer = {
          id: playerId,
          username: data.username,
          // Add game-specific state here
        };
        newGamePlayers.set(playerId, newPlayer);
        ws.send(JSON.stringify({
          type: 'init',
          playerId: playerId,
          players: Array.from(newGamePlayers.values())
        }));
        console.log(`New Game: Player ${data.username} joined (${playerId})`);
      }
    } catch (error) {
      console.error('New Game: Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (playerId && newGamePlayers.has(playerId)) {
      newGamePlayers.delete(playerId);
      console.log(`New Game: Player ${playerId} disconnected`);
    }
  });

  ws.on('error', (error) => {
    console.error('New Game: WebSocket error:', error);
  });
});

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Export for main server
module.exports = { wssNewGame };
