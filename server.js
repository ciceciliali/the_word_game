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
        wordAssignments: new Map()
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
    const { roomCode } = data;
    const room = rooms.get(roomCode);

    if (!room) return;

    const players = Array.from(room.players.values());
    
    // Check minimum players
    if (players.length < 3) {
      socket.emit('error', { message: 'Need at least 3 players to start!' });
      return;
    }

    // Select random word pair
    const randomPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    const [wordA, wordB] = randomPair;

    // Randomly assign word B to one player
    const impostorIndex = Math.floor(Math.random() * players.length);
    const impostorId = players[impostorIndex].id;

    // Store assignments
    room.wordAssignments.clear();
    players.forEach((player, index) => {
      room.wordAssignments.set(player.id, {
        word: index === impostorIndex ? wordB : wordA,
        isImpostor: index === impostorIndex
      });
    });

    room.currentWords = { wordA, wordB };
    room.gameState = 'playing';

    // Send words to each player
    players.forEach(player => {
      const assignment = room.wordAssignments.get(player.id);
      io.to(player.id).emit('word-assigned', {
        word: assignment.word,
        isImpostor: assignment.isImpostor
      });
    });

    // Notify all players game started
    io.to(roomCode).emit('game-started', {
      playerCount: players.length
    });

    console.log(`Game started in room ${roomCode} with words: ${wordA} / ${wordB}`);
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

