const { Server } = require('ws');
const wssSnake = new Server({ noServer: true });

const players = new Map();
const food = [];
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const FOOD_COUNT = 10;

function generateFood() {
    return {
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT
    };
}

function initializeFood() {
    while (food.length < FOOD_COUNT) {
        food.push(generateFood());
    }
}

function updateGameState() {
    players.forEach((player, id) => {
        if (player.targetX && player.targetY) {
            const head = player.segments[0];
            const dx = player.targetX - head.x;
            const dy = player.targetY - head.y;
            const angle = Math.atan2(dy, dx);
            const speed = 3;
            head.x += Math.cos(angle) * speed;
            head.y += Math.sin(angle) * speed;

            // Update segments
            for (let i = player.segments.length - 1; i > 0; i--) {
                player.segments[i].x = player.segments[i - 1].x;
                player.segments[i].y = player.segments[i - 1].y;
            }

            // Check food collision
            food.forEach((f, index) => {
                const dist = Math.hypot(head.x - f.x, head.y - f.y);
                if (dist < 15) {
                    player.score += 1;
                    player.segments.push({ x: head.x, y: head.y });
                    food.splice(index, 1);
                    food.push(generateFood());
                }
            });

            // Check boundary collision
            if (head.x < 0 || head.x > GAME_WIDTH || head.y < 0 || head.y > GAME_HEIGHT) {
                player.segments = [{ x: 100, y: 100 }];
                player.score = 0;
            }

            // Check self/other player collision
            players.forEach((otherPlayer, otherId) => {
                if (id !== otherId) {
                    otherPlayer.segments.forEach(segment => {
                        if (Math.hypot(head.x - segment.x, head.y - segment.y) < 15) {
                            player.segments = [{ x: 100, y: 100 }];
                            player.score = 0;
                        }
                    });
                }
            });
        }
    });

    broadcastGameState();
}

function broadcastGameState() {
    const state = {
        players: Object.fromEntries(
            Array.from(players.entries()).map(([id, data]) => [
                id,
                {
                    segments: data.segments,
                    score: data.score,
                    username: data.username,
                    color: data.color
                }
            ])
        ),
        food
    };
    wssSnake.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'gameState', state }));
        }
    });
}

wssSnake.on('connection', (ws, req) => {
    const playerId = Date.now().toString();
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const username = urlParams.get('username') || `Player${playerId.slice(-4)}`;
    const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    players.set(playerId, {
        segments: [{ x: 100, y: 100 }],
        score: 0,
        username,
        color,
        targetX: null,
        targetY: null
    });
    console.log(`Snake: Player ${username} joined (${playerId})`);

    ws.send(JSON.stringify({ type: 'init', playerId }));
    broadcastGameState();

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'update') {
            const player = players.get(playerId);
            player.targetX = data.x;
            player.targetY = data.y;
            players.set(playerId, player);
        }
    });

    ws.on('close', () => {
        players.delete(playerId);
        console.log(`Snake: Player ${username} left (${playerId})`);
        broadcastGameState();
    });
});

initializeFood();
setInterval(updateGameState, 1000 / 30);

module.exports = { wssSnake };
