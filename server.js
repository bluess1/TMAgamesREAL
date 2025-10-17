<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TMAGames - Flappy Bird Multiplayer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(to bottom, #4299e1, #2b6cb0);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        #menu {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 90%;
        }
        h1 {
            color: #2b6cb0;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        h2 {
            color: #4a5568;
            text-align: center;
            margin-bottom: 30px;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #cbd5e0;
            border-radius: 5px;
            font-size: 16px;
            margin-bottom: 20px;
        }
        button {
            width: 100%;
            padding: 15px;
            background: #2b6cb0;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
        }
        button:hover {
            background: #2c5282;
        }
        .instructions {
            margin-top: 20px;
            text-align: center;
            color: #4a5568;
            font-size: 14px;
        }
        #gameWrapper {
            display: none;
            position: fixed;
            width: 100vw;
            height: 100vh;
            top: 0;
            left: 0;
        }
        #gameContainer {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            position: relative;
        }
        #gameInfo {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 20px;
            z-index: 10;
        }
        .info-box {
            background: white;
            padding: 15px 25px;
            border-radius: 10px;
            font-weight: bold;
        }
        canvas {
            border: 4px solid white;
            border-radius: 10px;
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            display: block;
        }
        #gameOver {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 40px 60px;
            border-radius: 15px;
            text-align: center;
            z-index: 100;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        #playerList {
            position: absolute;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255,255,255,0.95);
            padding: 20px;
            border-radius: 10px;
            max-width: 250px;
            width: 250px;
            max-height: 500px;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .player-item {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .player-you {
            font-weight: bold;
            color: #e53e3e;
        }
        #startPrompt {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255,255,255,0.95);
            padding: 30px 50px;
            border-radius: 15px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            color: #2b6cb0;
            z-index: 50;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: translate(-50%, -50%) scale(1); }
            50% { transform: translate(-50%, -50%) scale(1.05); }
        }
    </style>
</head>
<body>
    <div id="menu">
        <h1>TMAGames</h1>
        <h2>Flappy Bird Multiplayer</h2>
        <label style="display: block; margin-bottom: 10px; font-weight: bold;">Enter Username</label>
        <input type="text" id="usernameInput" placeholder="Your username..." maxlength="15">
        <button onclick="startGame()">Start Game</button>
        <div class="instructions">
            <p><strong>How to Play:</strong></p>
            <p>Press SPACE or CLICK to flap</p>
            <p>Avoid the pipes!</p>
            <p>See other players in real-time</p>
        </div>
    </div>

    <div id="gameWrapper">
        <div id="gameContainer">
            <div id="gameInfo">
                <div class="info-box">
                    <span id="playerCount">0</span> Players Online
                </div>
                <div class="info-box">
                    Score: <span id="score">0</span>
                </div>
            </div>
            
            <canvas id="gameCanvas" width="800" height="600"></canvas>
            
            <div id="startPrompt">Press SPACE to Start!</div>
            
            <div id="gameOver">
                <h2 style="margin-bottom: 15px; font-size: 32px;">Game Over!</h2>
                <p style="font-size: 24px; margin: 20px 0;">Final Score: <span id="finalScore">0</span></p>
                <button onclick="restartGame()">Play Again</button>
            </div>
            
            <div id="playerList">
                <h3 style="margin-bottom: 15px;">Players Online</h3>
                <div id="playersContainer"></div>
            </div>
        </div>
    </div>

    <script>
        let socket;
        let username;
        let canvas, ctx;
        let gameLoop;
        let player = { y: 250, velocity: 0, isAlive: true, hasStarted: false };
        let pipes = [];
        let score = 0;
        let players = [];
        let isGameOver = false;
        let myPlayerId = null;
        let passedPipes = new Set(); // Track which pipes we've passed to prevent score spam

        const GRAVITY = 0.5;
        const JUMP_STRENGTH = -8;
        const BIRD_SIZE = 30;

        function startGame() {
            username = document.getElementById('usernameInput').value.trim();
            if (!username) {
                alert('Please enter a username!');
                return;
            }

            document.getElementById('menu').style.display = 'none';
            document.getElementById('gameWrapper').style.display = 'block';
            
            canvas = document.getElementById('gameCanvas');
            ctx = canvas.getContext('2d');

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('Connected to server');
                socket.send(JSON.stringify({
                    type: 'join',
                    username: username
                }));
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'init') {
                    myPlayerId = data.playerId;
                    players = data.players;
                    pipes = data.pipes;
                    updatePlayerList();
                    startGameLoop();
                } else if (data.type === 'pipeUpdate') {
                    pipes = data.pipes;
                } else if (data.type === 'playerUpdate') {
                    const index = players.findIndex(p => p.id === data.player.id);
                    if (index !== -1) {
                        players[index] = data.player;
                    } else {
                        players.push(data.player);
                    }
                    updatePlayerList();
                } else if (data.type === 'playerLeft') {
                    players = players.filter(p => p.id !== data.playerId);
                    updatePlayerList();
                }
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            socket.onclose = () => {
                console.log('Disconnected from server');
            };

            canvas.addEventListener('click', jump);
            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    jump();
                }
            });
        }

        function jump() {
            if (!player.hasStarted) {
                player.hasStarted = true;
                document.getElementById('startPrompt').style.display = 'none';
            }
            if (player.isAlive && player.hasStarted) {
                player.velocity = JUMP_STRENGTH;
            }
        }

        function startGameLoop() {
            function loop() {
                if (player.hasStarted && player.isAlive) {
                    player.velocity += GRAVITY;
                    player.y += player.velocity;

                    if (player.y < 0 || player.y > canvas.height - BIRD_SIZE) {
                        die();
                    }

                    pipes.forEach(pipe => {
                        if (pipe.x < 100 && pipe.x + 60 > 50) {
                            if (player.y < pipe.topHeight || player.y + BIRD_SIZE > pipe.bottomY) {
                                die();
                            }
                        }

                        // Score - only count each pipe once using its ID
                        if (!passedPipes.has(pipe.id) && pipe.x + 60 < 50) {
                            passedPipes.add(pipe.id);
                            score++;
                            document.getElementById('score').textContent = score;
                        }
                    });
                }

                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'update',
                        y: player.y,
                        score: score,
                        isAlive: player.isAlive,
                        hasStarted: player.hasStarted
                    }));
                }

                draw();
                gameLoop = requestAnimationFrame(loop);
            }
            loop();
        }

        function draw() {
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#2ECC40';
            pipes.forEach(pipe => {
                ctx.fillRect(pipe.x, 0, 60, pipe.topHeight);
                ctx.fillRect(pipe.x, pipe.bottomY, 60, canvas.height - pipe.bottomY);
            });

            ctx.fillStyle = '#FF4136';
            ctx.fillRect(50, player.y, BIRD_SIZE, BIRD_SIZE);

            players.forEach(p => {
                if (p.id !== myPlayerId && p.isAlive && p.hasStarted) {
                    ctx.fillStyle = '#0074D9';
                    ctx.fillRect(50, p.y, BIRD_SIZE, BIRD_SIZE);
                    ctx.fillStyle = '#000';
                    ctx.font = '12px Arial';
                    ctx.fillText(p.username, 50, p.y - 5);
                }
            });
        }

        function die() {
            player.isAlive = false;
            isGameOver = true;
            document.getElementById('gameOver').style.display = 'block';
            document.getElementById('finalScore').textContent = score;
            
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'update',
                    y: player.y,
                    score: score,
                    isAlive: false,
                    hasStarted: player.hasStarted
                }));
            }
        }

        function restartGame() {
            player = { y: 250, velocity: 0, isAlive: true, hasStarted: false };
            score = 0;
            isGameOver = false;
            passedPipes.clear(); // Reset passed pipes tracker
            document.getElementById('score').textContent = 0;
            document.getElementById('gameOver').style.display = 'none';
            document.getElementById('startPrompt').style.display = 'block';
        }

        function updatePlayerList() {
            document.getElementById('playerCount').textContent = players.length;
            const container = document.getElementById('playersContainer');
            container.innerHTML = '';
            
            players.forEach(p => {
                const div = document.createElement('div');
                div.className = 'player-item';
                if (p.id === myPlayerId) {
                    div.classList.add('player-you');
                }
                div.innerHTML = `
                    <span>${p.username}${p.id === myPlayerId ? ' (You)' : ''}</span>
                    <span>Score: ${p.score || 0}</span>
                `;
                container.appendChild(div);
            });
        }
    </script>
</body>
</html>
