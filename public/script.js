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
const wordCard = document.getElementById('word-card');
const flipBtn = document.getElementById('flip-btn');
const flipBackBtn = document.getElementById('flip-back-btn');
const errorMessage = document.getElementById('error-message');
const turnDisplay = document.getElementById('turn-display');
const currentTurnText = document.getElementById('current-turn-text');
const yourTurnControls = document.getElementById('your-turn-controls');
const doneSpeakingBtn = document.getElementById('done-speaking-btn');
const blankCardToggle = document.getElementById('blank-card-toggle');
const roundStartAnimation = document.getElementById('round-start-animation');
const revealBtn = document.getElementById('reveal-btn');
const revealPanel = document.getElementById('reveal-panel');
const revealCommonWord = document.getElementById('reveal-common-word');
const revealImpostorWord = document.getElementById('reveal-impostor-word');
const revealImpostorName = document.getElementById('reveal-impostor-name');

let currentTurnPlayerId = null;
let myPlayerId = null;

// Set player ID when socket connects
socket.on('connect', () => {
    myPlayerId = socket.id;
});

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
    const gameSettings = {
        blankCardMode: blankCardToggle ? blankCardToggle.checked : false
    };
    
    socket.emit('start-game', { 
        roomCode: currentRoomCode,
        gameSettings: gameSettings
    });
});

// Reveal words (host only)
if (revealBtn) {
    revealBtn.addEventListener('click', () => {
        socket.emit('reveal-words', { roomCode: currentRoomCode });
        revealBtn.disabled = true;
    });
}

// New round (host only)
newRoundBtn.addEventListener('click', () => {
    const gameSettings = {
        blankCardMode: blankCardToggle ? blankCardToggle.checked : false
    };
    
    socket.emit('start-game', { 
        roomCode: currentRoomCode,
        gameSettings: gameSettings
    });

    // Reset reveal panel and button state for next round
    if (revealPanel) {
        revealPanel.style.display = 'none';
    }
    if (revealBtn) {
        revealBtn.disabled = false;
    }
});

// Enter key support
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

// Flip word card to hide/show
if (flipBtn && wordCard) {
    flipBtn.addEventListener('click', () => {
        // Remove any inline transform styles that might interfere
        wordCard.style.transform = '';
        wordCard.style.transition = '';
        wordCard.classList.add('flipped');
    });
}

if (flipBackBtn && wordCard) {
    flipBackBtn.addEventListener('click', () => {
        // Remove any inline transform styles that might interfere
        wordCard.style.transform = '';
        wordCard.style.transition = '';
        wordCard.classList.remove('flipped');
    });
}

// Done speaking button
doneSpeakingBtn.addEventListener('click', () => {
    socket.emit('next-turn', { roomCode: currentRoomCode });
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
    // Show animation first
    showRoundStartAnimation(() => {
        showScreen('game');
        playerCountGame.querySelector('span').textContent = data.playerCount;
        // Ensure myPlayerId is set
        if (!myPlayerId) {
            myPlayerId = socket.id;
        }
        updateTurnDisplay(data.currentTurn);

        // Reset reveal panel and button each round
        if (revealPanel) {
            revealPanel.style.display = 'none';
        }
        if (revealBtn) {
            revealBtn.disabled = false;
        }
    });
});

socket.on('word-assigned', (data) => {
    // Handle blank card for impostor
    if (data.isBlankCard) {
        yourWord.textContent = '(Blank Card)';
        yourWord.style.opacity = '0.5';
        yourWord.style.fontStyle = 'italic';
        yourWord.style.fontSize = '1.5em';
    } else {
        yourWord.textContent = data.word;
        yourWord.style.opacity = '1';
        yourWord.style.fontStyle = 'normal';
        yourWord.style.fontSize = '3em';
    }
    // Don't reveal who is the impostor - everyone sees their word the same way
    
    if (isHost) {
        hostControlsGame.style.display = 'block';
    } else {
        hostControlsGame.style.display = 'none';
    }
    
    // Reset card to front when new word is assigned
    if (wordCard) {
        wordCard.classList.remove('flipped');
        // Clear any inline styles that might interfere
        wordCard.style.transform = '';
        wordCard.style.transition = '';
    }
});

socket.on('turn-changed', (data) => {
    updateTurnDisplay(data.currentTurn);
});

socket.on('error', (data) => {
    showError(data.message);
});

socket.on('words-revealed', (data) => {
    if (!revealPanel || !revealCommonWord || !revealImpostorWord || !revealImpostorName) return;

    revealCommonWord.textContent = `Common word: ${data.wordA}`;
    if (data.impostorHadBlankCard) {
        revealImpostorWord.textContent = 'Impostor word: (Blank card this round)';
    } else {
        revealImpostorWord.textContent = `Impostor word: ${data.wordB}`;
    }
    revealImpostorName.textContent = `🎭 The impostor was: ${data.impostorName}`;
    revealPanel.style.display = 'block';
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

function updateTurnDisplay(turnInfo) {
    currentTurnPlayerId = turnInfo.playerId;
    const isMyTurn = currentTurnPlayerId === myPlayerId;
    
    if (isMyTurn) {
        currentTurnText.textContent = '🎤 Your turn to speak!';
        currentTurnText.style.color = '#667eea';
        currentTurnText.style.fontWeight = 'bold';
        yourTurnControls.style.display = 'block';
    } else {
        currentTurnText.textContent = `🎤 ${turnInfo.playerName}'s turn`;
        currentTurnText.style.color = '#666';
        currentTurnText.style.fontWeight = 'normal';
        yourTurnControls.style.display = 'none';
    }
}

function showRoundStartAnimation(callback) {
    if (roundStartAnimation) {
        roundStartAnimation.style.display = 'flex';
        if (wordCard) {
            wordCard.style.opacity = '0.3';
            // Ensure flip state is reset
            wordCard.classList.remove('flipped');
        }
        
        setTimeout(() => {
            roundStartAnimation.style.display = 'none';
            if (wordCard) {
                wordCard.style.opacity = '1';
                // Trigger card flip animation using inline styles temporarily
                wordCard.style.transition = 'transform 0.6s';
                wordCard.style.transform = 'rotateY(180deg)';
                setTimeout(() => {
                    // Reset to use CSS classes instead of inline styles
                    wordCard.style.transform = '';
                    wordCard.style.transition = '';
                    wordCard.classList.remove('flipped');
                    if (callback) callback();
                }, 600);
            } else {
                if (callback) callback();
            }
        }, 1500);
    } else {
        if (callback) callback();
    }
}

// Handle page load - check if we're on a room route
window.addEventListener('load', () => {
    const path = window.location.pathname;
    if (path.length > 1 && path !== '/') {
        const roomCode = path.substring(1).toUpperCase();
        roomCodeInput.value = roomCode;
    }
});

