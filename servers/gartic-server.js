const WebSocket = require('ws');

// WebSocket server for Gartic Phone
const wssGartic = new WebSocket.Server({ noServer: true });

// Game rooms
const rooms = new Map(); // roomId -> Room object
const playerRooms = new Map(); // playerId -> roomId

class Room {
  constructor(roomId, isPublic, hostId, hostName) {
    this.roomId = roomId;
    this.isPublic = isPublic;
    this.hostId = hostId;
    this.players = new Map(); // playerId -> Player
    this.gameState = 'lobby'; // lobby, writing, drawing, results
    this.currentTurn = 0;
    this.chains = new Map(); // playerId -> Chain (sequence of prompts/drawings)
    this.turnTimer = null;
    this.turnDuration = 60000; // 60 seconds per turn
    this.mode = 'normal'; // normal, quick, chaotic
  }

  addPlayer(playerId, username, ws) {
    this.players.set(playerId, {
      id: playerId,
      username: username,
      ws: ws,
      ready: false
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.chains.delete(playerId);
    
    // If host left, assign new host
    if (this.hostId === playerId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }
    
    return this.players.size === 0; // Room is empty
  }

  startGame() {
    if (this.players.size < 2) return false;
    
    this.gameState = 'writing';
    this.currentTurn = 0;
    
    // Initialize chains - each player gets their own chain
    this.players.forEach((player, playerId) => {
      this.chains.set(playerId, {
        owner: playerId,
        ownerName: player.username,
        sequence: [] // Array of {type: 'text'|'drawing', content: string|drawData, author: playerId}
      });
    });

    // Start first turn - everyone writes initial prompt
    this.startTurn();
    return true;
  }

  startTurn() {
    this.currentTurn++;
    const playerCount = this.players.size;
    
    // Determine if this turn is writing or drawing
    const isWriting = this.currentTurn % 2 === 1; // Odd turns = writing, even = drawing
    this.gameState = isWriting ? 'writing' : 'drawing';

    console.log(`🎮 Room ${this.roomId} - Turn ${this.currentTurn}: ${isWriting ? 'WRITING' : 'DRAWING'}`);

    // Set timer for turn end
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.endTurn(), this.turnDuration);

    // Broadcast turn start
    this.broadcastToRoom({
      type: 'turnStart',
      turn: this.currentTurn,
      isWriting: isWriting,
      duration: this.turnDuration
    });

    // Assign tasks to each player
    this.assignTasks();
  }

  assignTasks() {
    const playerIds = Array.from(this.players.keys());
    const playerCount = playerIds.length;

    playerIds.forEach((playerId, index) => {
      // Calculate which chain this player should work on
      // Chain rotates: player works on chain that's (turn - 1) positions ahead
      const chainIndex = (index + this.currentTurn - 1) % playerCount;
      const chainOwnerId = playerIds[chainIndex];
      const chain = this.chains.get(chainOwnerId);

      const player = this.players.get(playerId);
      if (player && player.ws.readyState === WebSocket.OPEN) {
        
        if (this.currentTurn === 1) {
          // First turn - everyone writes their own initial prompt
          player.ws.send(JSON.stringify({
            type: 'yourTurn',
            action: 'write',
            prompt: null,
            chainOwner: player.username
          }));
        } else {
          // Get previous entry from chain
          const previousEntry = chain.sequence[chain.sequence.length - 1];
          
          if (this.gameState === 'drawing') {
            // Draw the previous text prompt
            player.ws.send(JSON.stringify({
              type: 'yourTurn',
              action: 'draw',
              prompt: previousEntry.content,
              chainOwner: chain.ownerName
            }));
          } else {
            // Describe the previous drawing
            player.ws.send(JSON.stringify({
              type: 'yourTurn',
              action: 'write',
              drawing: previousEntry.content,
              chainOwner: chain.ownerName
            }));
          }
        }
      }
    });
  }

  submitEntry(playerId, content) {
    const playerIds = Array.from(this.players.keys());
    const playerCount = playerIds.length;
    const playerIndex = playerIds.indexOf(playerId);

    // Find which chain this player is working on
    const chainIndex = (playerIndex + this.currentTurn - 1) % playerCount;
    const chainOwnerId = playerIds[chainIndex];
    const chain = this.chains.get(chainOwnerId);

    if (!chain) return;

    // Add entry to chain
    const entry = {
      type: this.gameState === 'writing' ? 'text' : 'drawing',
      content: content,
      author: playerId,
      authorName: this.players.get(playerId).username,
      turn: this.currentTurn
    };

    chain.sequence.push(entry);
    console.log(`✅ Player ${playerId} submitted ${entry.type} for chain ${chainOwnerId}`);

    // Check if all players have submitted
    this.checkAllSubmitted();
  }

  checkAllSubmitted() {
    const playerIds = Array.from(this.players.keys());
    let allSubmitted = true;

    playerIds.forEach((playerId, index) => {
      const chainIndex = (index + this.currentTurn - 1) % playerIds.length;
      const chainOwnerId = playerIds[chainIndex];
      const chain = this.chains.get(chainOwnerId);
      
      if (chain.sequence.length < this.currentTurn) {
        allSubmitted = false;
      }
    });

    if (allSubmitted) {
      console.log('✅ All players submitted!');
      this.endTurn();
    }
  }

  endTurn() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    // Check if game should end (each player has seen all chains)
    if (this.currentTurn >= this.players.size) {
      this.endGame();
    } else {
      // Start next turn
      setTimeout(() => this.startTurn(), 2000);
    }
  }

  endGame() {
    this.gameState = 'results';
    
    // Compile all chains for results
    const results = [];
    this.chains.forEach((chain, ownerId) => {
      results.push({
        owner: chain.ownerName,
        sequence: chain.sequence
      });
    });

    this.broadcastToRoom({
      type: 'gameEnd',
      results: results
    });

    console.log(`🎉 Game ended in room ${this.roomId}`);
  }

  broadcastToRoom(data, excludeId = null) {
    const message = JSON.stringify(data);
    this.players.forEach((player, playerId) => {
      if (playerId !== excludeId && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(message);
      }
    });
  }

  getRoomInfo() {
    return {
      roomId: this.roomId,
      isPublic: this.isPublic,
      hostId: this.hostId,
      playerCount: this.players.size,
      gameState: this.gameState,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        ready: p.ready
      }))
    };
  }
}

// WebSocket connection handler
wssGartic.on('connection', (ws) => {
  console.log('🎨 New Gartic Phone player connected');
  
  let playerId = null;
  let currentRoomId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch(data.type) {
        case 'createRoom':
          playerId = generateId();
          let roomId;
          
          if (data.isPublic) {
            // Public rooms use player name + random number
            roomId = 'PUBLIC-' + generateId().substr(0, 6);
          } else {
            // Private rooms get 4-digit code
            roomId = generateRoomCode();
            // Make sure code is unique
            while (rooms.has(roomId)) {
              roomId = generateRoomCode();
            }
          }
          
          const newRoom = new Room(roomId, data.isPublic, playerId, data.username);
          newRoom.addPlayer(playerId, data.username, ws);
          rooms.set(roomId, newRoom);
          playerRooms.set(playerId, roomId);
          currentRoomId = roomId;

          ws.send(JSON.stringify({
            type: 'roomCreated',
            playerId: playerId,
            roomId: roomId,
            roomInfo: newRoom.getRoomInfo()
          }));

          console.log(`🎨 Room created: ${roomId} by ${data.username}`);
          break;

        case 'joinRoom':
          playerId = playerId || generateId();
          const joinRoomId = data.roomId;
          const room = rooms.get(joinRoomId);

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            break;
          }

          if (room.gameState !== 'lobby' && !room.isPublic) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game already started' }));
            break;
          }

          room.addPlayer(playerId, data.username, ws);
          playerRooms.set(playerId, joinRoomId);
          currentRoomId = joinRoomId;

          ws.send(JSON.stringify({
            type: 'roomJoined',
            playerId: playerId,
            roomId: joinRoomId,
            roomInfo: room.getRoomInfo()
          }));

          room.broadcastToRoom({
            type: 'playerJoined',
            player: { id: playerId, username: data.username },
            roomInfo: room.getRoomInfo()
          }, playerId);

          console.log(`🎨 ${data.username} joined room ${joinRoomId}`);
          break;

        case 'listPublicRooms':
          const publicRooms = [];
          rooms.forEach((room, id) => {
            if (room.isPublic && room.gameState === 'lobby') {
              publicRooms.push(room.getRoomInfo());
            }
          });
          
          ws.send(JSON.stringify({
            type: 'publicRoomsList',
            rooms: publicRooms
          }));
          break;

        case 'startGame':
          if (!currentRoomId) break;
          const gameRoom = rooms.get(currentRoomId);
          if (!gameRoom || gameRoom.hostId !== playerId) break;

          if (gameRoom.startGame()) {
            console.log(`🎮 Game started in room ${currentRoomId}`);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players' }));
          }
          break;

        case 'submitEntry':
          if (!currentRoomId) break;
          const submitRoom = rooms.get(currentRoomId);
          if (!submitRoom) break;

          submitRoom.submitEntry(playerId, data.content);
          
          // Notify player their submission was received
          ws.send(JSON.stringify({
            type: 'submissionReceived'
          }));
          break;

        case 'leave':
          if (currentRoomId) {
            const leaveRoom = rooms.get(currentRoomId);
            if (leaveRoom) {
              const isEmpty = leaveRoom.removePlayer(playerId);
              
              if (isEmpty) {
                rooms.delete(currentRoomId);
                console.log(`🗑️ Room ${currentRoomId} deleted (empty)`);
              } else {
                leaveRoom.broadcastToRoom({
                  type: 'playerLeft',
                  playerId: playerId,
                  roomInfo: leaveRoom.getRoomInfo()
                });
              }
            }
            playerRooms.delete(playerId);
            currentRoomId = null;
          }
          break;
      }
    } catch (error) {
      console.error('🎨 Gartic error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        const isEmpty = room.removePlayer(playerId);
        
        if (isEmpty) {
          rooms.delete(currentRoomId);
          console.log(`🗑️ Room ${currentRoomId} deleted (empty)`);
        } else {
          room.broadcastToRoom({
            type: 'playerLeft',
            playerId: playerId,
            roomInfo: room.getRoomInfo()
          });
        }
      }
      playerRooms.delete(playerId);
    }
    console.log('🎨 Gartic player disconnected');
  });

  ws.on('error', (error) => {
    console.error('🎨 Gartic WebSocket error:', error);
  });
});

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function generateRoomCode() {
  // Generate 4-digit room code
  return Math.floor(1000 + Math.random() * 9000).toString();
}

module.exports = { wssGartic };

console.log('🎨 Gartic Phone server ready!');
