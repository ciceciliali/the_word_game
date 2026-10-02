const socket = io();

let currentRoomCode = '';
let isHost = false;
let playerName = '';

// Persistent player identity, survives page reloads and socket reconnects
// within THIS tab (network blips, tab backgrounding, etc.) so the server can
// recognize a reconnect as the SAME player instead of adding a duplicate
// "ghost" entry. Uses sessionStorage (not localStorage) because it's scoped
// per-tab - localStorage is shared across every tab of the same browser,
// which would make two tabs opened by the same person collide onto the same
// playerId and hijack each other's slot in the room.
function getOrCreatePlayerId() {
    let id = sessionStorage.getItem('wordGamePlayerId');
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
        sessionStorage.setItem('wordGamePlayerId', id);
    }
    return id;
}
const playerId = getOrCreatePlayerId();

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
const turnIndicator = document.getElementById('turn-indicator');
const votingPanel = document.getElementById('voting-panel');
const votingPlayers = document.getElementById('voting-players');
const voteStatus = document.getElementById('vote-status');
const voteResultsPanel = document.getElementById('vote-results-panel');
const voteTallyList = document.getElementById('vote-tally-list');
const voteOutcome = document.getElementById('vote-outcome');
const giveUpVoteBtn = document.getElementById('give-up-vote-btn');
const doneVotingBtn = document.getElementById('done-voting-btn');

let currentTurnPlayerId = null;
let myPlayerId = playerId;
let hasVoted = false;

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
    socket.emit('create-room', { roomCode, playerName, playerId });
});

// If the socket reconnects (network blip, tab resume, etc.) after we'd
// already joined a room, rejoin automatically using the same playerId so
// the server treats it as a reconnect, not a new player.
socket.on('connect', () => {
    myPlayerId = playerId;
    if (currentRoomCode && playerName) {
        socket.emit('create-room', { roomCode: currentRoomCode, playerName, playerId });
    }
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
// Disable immediately on click so a double-click/double-tap (or a slow
// network re-trying the click) can't fire next-turn twice and skip a
// player's turn. Re-enabled in updateTurnDisplay() whenever it becomes our
// turn again.
doneSpeakingBtn.addEventListener('click', () => {
    if (doneSpeakingBtn.disabled) return;
    doneSpeakingBtn.disabled = true;
    socket.emit('next-turn', { roomCode: currentRoomCode });
});

// Give up vote - counts as having responded, but votes for no one
if (giveUpVoteBtn) {
    giveUpVoteBtn.addEventListener('click', () => {
        if (hasVoted) return;
        hasVoted = true;
        lockVotingButtons();
        giveUpVoteBtn.classList.add('selected');
        socket.emit('cast-vote', { roomCode: currentRoomCode, votedForId: null });
    });
}

// Done voting (room owner only) - ends voting whenever the owner decides,
// there is no time limit, so votes may still be missing from some players.
if (doneVotingBtn) {
    doneVotingBtn.addEventListener('click', () => {
        if (doneVotingBtn.disabled) return;
        doneVotingBtn.disabled = true;
        socket.emit('end-voting', { roomCode: currentRoomCode });
    });
}

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

        // Reset voting UI and show the turn indicator for the new round
        hasVoted = false;
        if (votingPanel) votingPanel.style.display = 'none';
        if (voteResultsPanel) voteResultsPanel.style.display = 'none';
        if (turnIndicator) turnIndicator.style.display = 'block';

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

socket.on('voting-started', (data) => {
    hasVoted = false;
    if (turnIndicator) turnIndicator.style.display = 'none';
    if (voteResultsPanel) voteResultsPanel.style.display = 'none';
    renderVotingPanel(data.players);
    if (votingPanel) votingPanel.style.display = 'block';

    // Only the room owner can end voting; no time limit otherwise
    if (doneVotingBtn) {
        doneVotingBtn.style.display = isHost ? 'block' : 'none';
        doneVotingBtn.disabled = false;
    }
});

socket.on('vote-progress', (data) => {
    if (voteStatus) {
        voteStatus.textContent = `${data.votesIn}/${data.totalVoters} players have responded`;
    }
});

socket.on('vote-results', (data) => {
    if (votingPanel) votingPanel.style.display = 'none';
    renderVoteTally(data.tally);
    if (voteOutcome) {
        voteOutcome.textContent = data.wasImpostor
            ? `✅ ${data.votedOutName} was voted out and WAS the impostor! The crew wins!`
            : `❌ ${data.votedOutName} was voted out but was NOT the impostor (it was ${data.impostorName}). The impostor wins!`;
    }
    if (voteResultsPanel) voteResultsPanel.style.display = 'block';
});

socket.on('vote-inconclusive', (data) => {
    if (votingPanel) votingPanel.style.display = 'none';
    renderVoteTally(data.tally);
    if (voteOutcome) {
        voteOutcome.textContent = 'No majority - back to discussion!';
    }
    if (voteResultsPanel) voteResultsPanel.style.display = 'block';
    setTimeout(() => {
        if (voteResultsPanel) voteResultsPanel.style.display = 'none';
        if (turnIndicator) turnIndicator.style.display = 'block';
        if (data.currentTurn) updateTurnDisplay(data.currentTurn);
    }, 2500);
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
        doneSpeakingBtn.disabled = false;
    } else {
        currentTurnText.textContent = `🎤 ${turnInfo.playerName}'s turn`;
        currentTurnText.style.color = '#666';
        currentTurnText.style.fontWeight = 'normal';
        yourTurnControls.style.display = 'none';
    }
}

function renderVotingPanel(players) {
    if (!votingPlayers) return;
    votingPlayers.innerHTML = '';
    if (voteStatus) voteStatus.textContent = '';
    if (giveUpVoteBtn) {
        giveUpVoteBtn.disabled = false;
        giveUpVoteBtn.classList.remove('selected');
    }

    players
        .filter(player => player.id !== myPlayerId)
        .forEach(player => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary vote-btn';
            btn.textContent = player.name;
            btn.addEventListener('click', () => {
                if (hasVoted) return;
                hasVoted = true;
                btn.classList.add('selected');
                lockVotingButtons();
                socket.emit('cast-vote', { roomCode: currentRoomCode, votedForId: player.id });
            });
            votingPlayers.appendChild(btn);
        });
}

// Disable every vote option (player buttons + give up) once a choice has
// been locked in - a player can cast one vote or give up, not both.
function lockVotingButtons() {
    if (votingPlayers) {
        Array.from(votingPlayers.querySelectorAll('button')).forEach(b => {
            b.disabled = true;
        });
    }
    if (giveUpVoteBtn) {
        giveUpVoteBtn.disabled = true;
    }
}

function renderVoteTally(tally) {
    if (!voteTallyList) return;
    voteTallyList.innerHTML = '';
    tally
        .slice()
        .sort((a, b) => b.votes - a.votes)
        .forEach(entry => {
            const li = document.createElement('li');
            li.textContent = `${entry.playerName}: ${entry.votes} vote${entry.votes === 1 ? '' : 's'}`;
            voteTallyList.appendChild(li);
        });
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

