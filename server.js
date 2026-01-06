const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Load word pairs
const wordPairs = JSON.parse(fs.readFileSync(path.join(__dirname, 'wordPairs.json'), 'utf8'));

// Store rooms and players
const rooms = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route for room pages
app.get('/:roomCode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (data) => {
    const { roomCode, playerName } = data;
    
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: new Map(),
        gameState: 'waiting', // waiting, playing, finished
        currentWords: null,
        wordAssignments: new Map(),
        playerOrder: [],
        currentTurnIndex: 0,
        gameSettings: {
          blankCardMode: false
        }
      });
    }

    const room = rooms.get(roomCode);
    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      isHost: room.players.size === 0
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;

    // Notify all players in room with their own status
    const allPlayers = Array.from(room.players.values());
    room.players.forEach((player, playerId) => {
      io.to(playerId).emit('player-joined', {
        players: allPlayers,
        isHost: player.isHost
      });
    });

    console.log(`Player ${playerName} joined room ${roomCode}`);
  });

  socket.on('start-game', (data) => {
    const { roomCode, gameSettings } = data;
    const room = rooms.get(roomCode);

    if (!room) return;

    const players = Array.from(room.players.values());
    
    // Check minimum players
    if (players.length < 3) {
      socket.emit('error', { message: 'Need at least 3 players to start!' });
      return;
    }

    // Update game settings
    if (gameSettings) {
      room.gameSettings = {
        blankCardMode: gameSettings.blankCardMode || false
      };
    }

    // Select random word pair from word bank
    const randomPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    const [wordA, wordB] = randomPair;
    console.log(`Using word bank: ${wordA} / ${wordB}`);

    // Randomly assign word B to one player (impostor) - ensures new random selection each round
    // Shuffle players array to ensure randomness, then pick first one as impostor
    const shuffledPlayers = [...players];
    for (let i = shuffledPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
    }
    
    // Select random impostor from shuffled array
    const impostorIndex = Math.floor(Math.random() * shuffledPlayers.length);
    const impostor = shuffledPlayers[impostorIndex];
    const impostorId = impostor.id;

    console.log(`Round started - Impostor randomly selected: ${impostor.name} (from ${players.length} players)`);

    // Store assignments - randomly assign to each player
    room.wordAssignments.clear();
    players.forEach((player) => {
      const isImpostor = player.id === impostorId;
      let word = isImpostor ? wordB : wordA;
      let isBlankCard = false;
      
      // If blank card mode is enabled and player is impostor, 25% chance of blank card
      if (room.gameSettings.blankCardMode && isImpostor) {
        const blankCardChance = Math.random();
        if (blankCardChance < 0.25) { // 25% chance
          word = '';
          isBlankCard = true;
          console.log(`Impostor ${impostor.name} got blank card (25% chance)`);
        } else {
          console.log(`Impostor ${impostor.name} got word B (75% chance)`);
        }
      }
      
      room.wordAssignments.set(player.id, {
        word: word,
        isImpostor: isImpostor,
        isBlankCard: isBlankCard
      });
    });

    room.currentWords = { wordA, wordB };
    room.gameState = 'playing';
    
    // Initialize turn order (randomize order)
    room.playerOrder = players.map(p => p.id);
    for (let i = room.playerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.playerOrder[i], room.playerOrder[j]] = [room.playerOrder[j], room.playerOrder[i]];
    }
    room.currentTurnIndex = 0;

    // Send words to each player
    players.forEach(player => {
      const assignment = room.wordAssignments.get(player.id);
      io.to(player.id).emit('word-assigned', {
        word: assignment.word,
        isImpostor: assignment.isImpostor,
        isBlankCard: assignment.isBlankCard || false
      });
    });

    // Notify all players game started with turn info
    const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
    const currentTurnPlayer = players.find(p => p.id === currentTurnPlayerId);
    
    io.to(roomCode).emit('game-started', {
      playerCount: players.length,
      currentTurn: {
        playerId: currentTurnPlayerId,
        playerName: currentTurnPlayer.name,
        playerIndex: 0
      },
      playerOrder: room.playerOrder.map(id => {
        const p = players.find(pl => pl.id === id);
        return { id: p.id, name: p.name };
      })
    });

    console.log(`Game started in room ${roomCode} with words: ${wordA} / ${wordB}`);
  });

  socket.on('next-turn', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'playing') return;

    // Move to next player
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.playerOrder.length;
    const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
    const players = Array.from(room.players.values());
    const currentTurnPlayer = players.find(p => p.id === currentTurnPlayerId);

    if (currentTurnPlayer) {
      io.to(roomCode).emit('turn-changed', {
        currentTurn: {
          playerId: currentTurnPlayerId,
          playerName: currentTurnPlayer.name,
          playerIndex: room.currentTurnIndex
        }
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room) {
        room.players.delete(socket.id);
        room.wordAssignments.delete(socket.id);

        if (room.players.size === 0) {
          rooms.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted`);
        } else {
          // Update host if host left
          const players = Array.from(room.players.values());
          if (players.length > 0) {
            players[0].isHost = true;
          }

          // If game is playing and the disconnected player was the current turn, move to next
          if (room.gameState === 'playing' && room.playerOrder.length > 0) {
            const disconnectedIndex = room.playerOrder.indexOf(socket.id);
            if (disconnectedIndex !== -1) {
              room.playerOrder.splice(disconnectedIndex, 1);
              // Adjust current turn index if needed
              if (room.currentTurnIndex >= room.playerOrder.length) {
                room.currentTurnIndex = 0;
              } else if (disconnectedIndex < room.currentTurnIndex) {
                room.currentTurnIndex--;
              }
              
              // Notify about turn change if there are still players
              if (room.playerOrder.length > 0) {
                const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
                const currentTurnPlayer = players.find(p => p.id === currentTurnPlayerId);
                if (currentTurnPlayer) {
                  io.to(socket.roomCode).emit('turn-changed', {
                    currentTurn: {
                      playerId: currentTurnPlayerId,
                      playerName: currentTurnPlayer.name,
                      playerIndex: room.currentTurnIndex
                    }
                  });
                }
              }
            }
          }

          // Notify all remaining players with their own status
          const allPlayers = Array.from(room.players.values());
          room.players.forEach((player, playerId) => {
            io.to(playerId).emit('player-left', {
              players: allPlayers,
              isHost: player.isHost
            });
          });
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

