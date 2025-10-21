// Global Chat System - Include this in all pages
class GlobalChat {
    constructor() {
        this.socket = null;
        this.username = localStorage.getItem('tmaUsername') || this.generateUsername();
        this.currentTab = 'global';
        this.init();
    }

    generateUsername() {
        const username = 'Player' + Math.floor(Math.random() * 10000);
        localStorage.setItem('tmaUsername', username);
        return username;
    }

    init() {
        // Inject chat UI
        this.injectChatUI();
        this.connectWebSocket();
        this.setupEventListeners();
    }

    injectChatUI() {
        const chatHTML = `
            <style>
                #globalChatBox {
                    position: fixed;
                    right: 20px;
                    bottom: 20px;
                    background: rgba(255,255,255,0.95);
                    padding: 15px;
                    border-radius: 10px;
                    width: 320px;
                    height: 450px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    display: flex;
                    flex-direction: column;
                    z-index: 9999;
                    font-family: Arial, sans-serif;
                }
                #globalChatBox.minimized {
                    height: 50px;
                    overflow: hidden;
                }
                #globalChatHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    border-bottom: 2px solid #2b6cb0;
                    padding-bottom: 10px;
                }
                #globalChatTabs {
                    display: flex;
                    gap: 5px;
                }
                .global-chat-tab {
                    padding: 5px 10px;
                    background: #e2e8f0;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 11px;
                    font-weight: bold;
                }
                .global-chat-tab.active {
                    background: #2b6cb0;
                    color: white;
                }
                #globalChatMinimize {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0 5px;
                }
                #globalChatMessages {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid #e2e8f0;
                    border-radius: 5px;
                    padding: 10px;
                    margin-bottom: 10px;
                    background: white;
                }
                .global-chat-message {
                    margin-bottom: 8px;
                    padding: 5px 8px;
                    border-radius: 5px;
                    background: #f7fafc;
                    word-wrap: break-word;
                }
                .global-chat-message.dm {
                    background: #e6fffa;
                    border-left: 3px solid #38b2ac;
                }
                .global-chat-message.system {
                    background: #fff5f5;
                    border-left: 3px solid #fc8181;
                    font-style: italic;
                }
                .global-chat-sender {
                    font-weight: bold;
                    color: #2b6cb0;
                    font-size: 12px;
                }
                .global-chat-text {
                    color: #2d3748;
                    font-size: 13px;
                    margin-top: 2px;
                }
                .global-chat-timestamp {
                    font-size: 10px;
                    color: #a0aec0;
                }
                #globalChatInputArea {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }
                #globalDmTargetInput {
                    display: none;
                    padding: 5px;
                    border: 2px solid #38b2ac;
                    border-radius: 5px;
                    font-size: 12px;
                }
                #globalChatInputWrapper {
                    display: flex;
                    gap: 5px;
                }
                #globalChatInput {
                    flex: 1;
                    padding: 8px;
                    border: 2px solid #cbd5e0;
                    border-radius: 5px;
                    font-size: 13px;
                }
                #globalChatSendBtn {
                    padding: 8px 15px;
                    background: #2b6cb0;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                }
                #globalChatSendBtn:hover {
                    background: #2c5282;
                }
                #globalUsernameDisplay {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(255,255,255,0.9);
                    padding: 10px 15px;
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                    z-index: 9998;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                #globalUsernameText {
                    font-weight: bold;
                    color: #2b6cb0;
                }
                #globalEditUsernameBtn {
                    padding: 5px 10px;
                    background: #2b6cb0;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 12px;
                }
                #globalUsernameModal {
                    display: none;
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    z-index: 10002;
                }
                #globalModalOverlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10001;
                }
                #globalOnlineCount {
                    font-size: 11px;
                    color: #718096;
                }
            </style>

            <div id="globalModalOverlay"></div>
            
            <div id="globalUsernameDisplay">
                <span id="globalUsernameText">👤 ${this.username}</span>
                <button id="globalEditUsernameBtn">✏️ Edit</button>
            </div>

            <div id="globalUsernameModal">
                <h2 style="margin-bottom: 20px; color: #2b6cb0;">Edit Username</h2>
                <input type="text" id="globalNewUsernameInput" placeholder="New username..." maxlength="15" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid #cbd5e0; border-radius: 5px; font-size: 16px;">
                <div style="display: flex; gap: 10px;">
                    <button id="globalSaveUsernameBtn" style="flex: 1; padding: 10px; background: #2b6cb0; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Save</button>
                    <button id="globalCancelUsernameBtn" style="flex: 1; padding: 10px; background: #718096; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Cancel</button>
                </div>
            </div>

            <div id="globalChatBox">
                <div id="globalChatHeader">
                    <div>
                        <h3 style="margin: 0; color: #2b6cb0; font-size: 16px;">Global Chat</h3>
                        <span id="globalOnlineCount">0 online</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div id="globalChatTabs">
                            <button class="global-chat-tab active" data-tab="global">Global</button>
                            <button class="global-chat-tab" data-tab="dm">DM</button>
                        </div>
                        <button id="globalChatMinimize">−</button>
                    </div>
                </div>
                <div id="globalChatMessages"></div>
                <div id="globalChatInputArea">
                    <input type="text" id="globalDmTargetInput" placeholder="Username to DM...">
                    <div id="globalChatInputWrapper">
                        <input type="text" id="globalChatInput" placeholder="Type a message..." maxlength="200">
                        <button id="globalChatSendBtn">Send</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatHTML);
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/chat`;
        
        console.log('🔌 Connecting to global chat:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('✅ Global chat connected');
            this.socket.send(JSON.stringify({
                type: 'join',
                username: this.username
            }));
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onerror = (error) => {
            console.error('❌ Chat error:', error);
        };

        this.socket.onclose = () => {
            console.log('🔌 Chat disconnected, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }

    handleMessage(data) {
        switch(data.type) {
            case 'userCount':
                document.getElementById('globalOnlineCount').textContent = `${data.count} online`;
                break;
            case 'chatMessage':
                this.addMessage(data.sender, data.message, false);
                break;
            case 'dmMessage':
                this.addMessage(data.sender, data.message, true);
                break;
            case 'systemMessage':
                this.addSystemMessage(data.message);
                break;
            case 'usernameChanged':
                this.addSystemMessage(`${data.oldUsername} changed their name to ${data.newUsername}`);
                break;
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.global-chat-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Send message
        document.getElementById('globalChatSendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('globalChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Minimize
        document.getElementById('globalChatMinimize').addEventListener('click', () => {
            const chatBox = document.getElementById('globalChatBox');
            const btn = document.getElementById('globalChatMinimize');
            if (chatBox.classList.contains('minimized')) {
                chatBox.classList.remove('minimized');
                btn.textContent = '−';
            } else {
                chatBox.classList.add('minimized');
                btn.textContent = '+';
            }
        });

        // Username editing
        document.getElementById('globalEditUsernameBtn').addEventListener('click', () => {
            this.openUsernameModal();
        });

        document.getElementById('globalSaveUsernameBtn').addEventListener('click', () => {
            this.saveNewUsername();
        });

        document.getElementById('globalCancelUsernameBtn').addEventListener('click', () => {
            this.closeUsernameModal();
        });

        document.getElementById('globalModalOverlay').addEventListener('click', () => {
            this.closeUsernameModal();
        });
    }

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.global-chat-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        
        if (tab === 'dm') {
            document.getElementById('globalDmTargetInput').style.display = 'block';
            document.getElementById('globalChatInput').placeholder = 'Type a DM...';
        } else {
            document.getElementById('globalDmTargetInput').style.display = 'none';
            document.getElementById('globalChatInput').placeholder = 'Type a message...';
        }
    }

    sendMessage() {
        const input = document.getElementById('globalChatInput');
        const message = input.value.trim();
        
        if (!message || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        
        if (this.currentTab === 'dm') {
            const targetInput = document.getElementById('globalDmTargetInput');
            const targetUsername = targetInput.value.trim();
            
            if (!targetUsername) {
                alert('Please enter a username to DM');
                return;
            }
            
            this.socket.send(JSON.stringify({
                type: 'dm',
                targetUsername: targetUsername,
                message: message
            }));
            this.addMessage(`You → ${targetUsername}`, message, true);
        } else {
            // Send global message
            this.socket.send(JSON.stringify({
                type: 'chat',
                message: message
            }));
            // Show your own message immediately
            this.addMessage(this.username, message, false);
        }
        
        input.value = '';
    }

    addMessage(sender, message, isDM) {
        const container = document.getElementById('globalChatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'global-chat-message' + (isDM ? ' dm' : '');
        
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        msgDiv.innerHTML = `
            <div class="global-chat-sender">${this.escapeHtml(sender)}</div>
            <div class="global-chat-text">${this.escapeHtml(message)}</div>
            <div class="global-chat-timestamp">${time}</div>
        `;
        
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(message) {
        const container = document.getElementById('globalChatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'global-chat-message system';
        
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        msgDiv.innerHTML = `
            <div class="global-chat-text">${this.escapeHtml(message)}</div>
            <div class="global-chat-timestamp">${time}</div>
        `;
        
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    openUsernameModal() {
        document.getElementById('globalModalOverlay').style.display = 'block';
        document.getElementById('globalUsernameModal').style.display = 'block';
        document.getElementById('globalNewUsernameInput').value = this.username;
        document.getElementById('globalNewUsernameInput').focus();
    }

    closeUsernameModal() {
        document.getElementById('globalModalOverlay').style.display = 'none';
        document.getElementById('globalUsernameModal').style.display = 'none';
    }

    saveNewUsername() {
        const newUsername = document.getElementById('globalNewUsernameInput').value.trim();
        
        if (!newUsername) {
            alert('Username cannot be empty!');
            return;
        }
        
        if (newUsername === this.username) {
            this.closeUsernameModal();
            return;
        }
        
        const oldUsername = this.username;
        this.username = newUsername;
        localStorage.setItem('tmaUsername', newUsername);
        
        document.getElementById('globalUsernameText').textContent = `👤 ${newUsername}`;
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'changeUsername',
                newUsername: newUsername
            }));
        }
        
        this.addSystemMessage(`You changed your name from ${oldUsername} to ${newUsername}`);
        this.closeUsernameModal();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.globalChat = new GlobalChat();
    });
} else {
    window.globalChat = new GlobalChat();
}
