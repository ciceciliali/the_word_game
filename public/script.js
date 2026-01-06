const socket = io();

let currentRoomCode = '';
let isHost = false;
let playerName = '';

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const joinBtn = document.getElementById('join-btn');
const startBtn = document.getElementById('start-btn');
const newRoundBtn = document.getElementById('new-round-btn');
const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');
const playerCountGame = document.getElementById('player-count-game');
const roomCodeDisplay = document.getElementById('room-code-display');
const gameRoomCode = document.getElementById('game-room-code');
const hostControls = document.getElementById('host-controls');
const hostControlsGame = document.getElementById('host-controls-game');
const waitingMessage = document.getElementById('waiting-message');
const yourWord = document.getElementById('your-word');
const impostorBadge = document.getElementById('impostor-badge');
const errorMessage = document.getElementById('error-message');

// Join room
joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!name) {
        showError('Please enter your name');
        return;
    }

    if (!roomCode) {
        showError('Please enter a room code');
        return;
    }

    playerName = name;
    currentRoomCode = roomCode;
    socket.emit('create-room', { roomCode, playerName });
});

// Start game (host only)
startBtn.addEventListener('click', () => {
    socket.emit('start-game', { roomCode: currentRoomCode });
});

// New round (host only)
newRoundBtn.addEventListener('click', () => {
    socket.emit('start-game', { roomCode: currentRoomCode });
});

// Enter key support
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

// Socket event handlers
socket.on('player-joined', (data) => {
    isHost = data.isHost;
    updatePlayersList(data.players);
    showScreen('waiting');
    
    if (isHost) {
        hostControls.style.display = 'block';
        waitingMessage.style.display = 'none';
        updateStartButton(data.players.length);
    } else {
        hostControls.style.display = 'none';
        waitingMessage.style.display = 'block';
    }
});

socket.on('player-left', (data) => {
    isHost = data.isHost;
    updatePlayersList(data.players);
    if (isHost) {
        hostControls.style.display = 'block';
        waitingMessage.style.display = 'none';
        updateStartButton(data.players.length);
    } else {
        hostControls.style.display = 'none';
        waitingMessage.style.display = 'block';
    }
});

socket.on('game-started', (data) => {
    showScreen('game');
    playerCountGame.querySelector('span').textContent = data.playerCount;
});

socket.on('word-assigned', (data) => {
    yourWord.textContent = data.word;
    if (data.isImpostor) {
        impostorBadge.style.display = 'block';
    } else {
        impostorBadge.style.display = 'none';
    }
    
    if (isHost) {
        hostControlsGame.style.display = 'block';
    } else {
        hostControlsGame.style.display = 'none';
    }
});

socket.on('error', (data) => {
    showError(data.message);
});

// Helper functions
function showScreen(screenName) {
    joinScreen.classList.remove('active');
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');

    if (screenName === 'join') {
        joinScreen.classList.add('active');
    } else if (screenName === 'waiting') {
        waitingScreen.classList.add('active');
        roomCodeDisplay.textContent = currentRoomCode;
    } else if (screenName === 'game') {
        gameScreen.classList.add('active');
        gameRoomCode.textContent = currentRoomCode;
    }
}

function updatePlayersList(players) {
    playersList.innerHTML = '';
    playerCount.textContent = players.length;

    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        
        if (player.isHost) {
            const badge = document.createElement('span');
            badge.className = 'host-badge';
            badge.textContent = 'HOST';
            li.appendChild(badge);
        }
        
        playersList.appendChild(li);
    });
}

function updateStartButton(playerCount) {
    startBtn.disabled = playerCount < 3;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// Handle page load - check if we're on a room route
window.addEventListener('load', () => {
    const path = window.location.pathname;
    if (path.length > 1 && path !== '/') {
        const roomCode = path.substring(1).toUpperCase();
        roomCodeInput.value = roomCode;
    }
});

