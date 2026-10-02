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

// Maps a live socket.id -> { roomCode, playerId }, so disconnect can find the
// right player without relying on socket.id as the player's identity.
const socketToPlayer = new Map();

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

function getPublicPlayers(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.playerId,
    name: p.name,
    isHost: p.isHost
  }));
}

function broadcastPlayers(room, eventName) {
  const allPlayers = getPublicPlayers(room);
  room.players.forEach((player) => {
    io.to(player.socketId).emit(eventName, {
      players: allPlayers,
      isHost: player.isHost
    });
  });
}

// Tally room.votes and either announce a result (one player uniquely has
// the most votes) or declare the vote inconclusive (tie at the top, or
// nobody got more than a single vote) and send the group back for another
// round of discussion.
function resolveVotes(room, roomCode) {
  const tally = new Map();
  room.votes.forEach((votedForId) => {
    if (!votedForId) return; // gave up their vote - doesn't count towards anyone
    tally.set(votedForId, (tally.get(votedForId) || 0) + 1);
  });

  let maxVotes = 0;
  tally.forEach((count) => {
    if (count > maxVotes) maxVotes = count;
  });
  const topCandidates = Array.from(tally.keys()).filter(id => tally.get(id) === maxVotes);

  const tallyNamed = Array.from(tally.entries()).map(([playerId, count]) => {
    const player = room.players.get(playerId);
    return { playerId, playerName: player ? player.name : 'Unknown', votes: count };
  });

  room.votes.clear();

  if (maxVotes <= 1 || topCandidates.length > 1) {
    // No decisive majority - back to another round of discussion.
    room.gameState = 'playing';
    room.currentTurnIndex = 0;

    const firstPlayerId = room.playerOrder[0];
    const firstPlayer = firstPlayerId ? room.players.get(firstPlayerId) : null;

    io.to(roomCode).emit('vote-inconclusive', {
      tally: tallyNamed,
      currentTurn: firstPlayer ? {
        playerId: firstPlayerId,
        playerName: firstPlayer.name,
        playerIndex: 0
      } : null
    });

    console.log(`Vote inconclusive in room ${roomCode}, back to discussion`);
  } else {
    const votedOutId = topCandidates[0];
    const votedOutPlayer = room.players.get(votedOutId);
    const wasImpostor = !!(room.currentImpostor && room.currentImpostor.playerId === votedOutId);

    room.gameState = 'finished';

    io.to(roomCode).emit('vote-results', {
      tally: tallyNamed,
      votedOutName: votedOutPlayer ? votedOutPlayer.name : 'Unknown',
      wasImpostor,
      impostorName: room.currentImpostor ? room.currentImpostor.name : 'Unknown',
      wordA: room.currentWords ? room.currentWords.wordA : null,
      wordB: room.currentWords ? room.currentWords.wordB : null
    });

    console.log(`Room ${roomCode} voted out ${votedOutPlayer ? votedOutPlayer.name : votedOutId} (impostor: ${wasImpostor})`);
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (data) => {
    const { roomCode, playerName, playerId } = data;

    if (!playerId) {
      socket.emit('error', { message: 'Missing player id, please refresh.' });
      return;
    }

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: new Map(), // keyed by persistent playerId
        gameState: 'waiting', // waiting, playing, voting, finished
        currentWords: null,
        wordAssignments: new Map(), // keyed by playerId
        playerOrder: [], // array of playerId
        currentTurnIndex: 0,
        votes: new Map(), // voterPlayerId -> votedForPlayerId
        gameSettings: {
          blankCardMode: false
        }
      });
    }

    const room = rooms.get(roomCode);

    const existing = room.players.get(playerId);
    if (existing) {
      // Reconnect: same player, new socket. Update the live socket.id but
      // keep their slot (host status, name) intact instead of creating a
      // duplicate "ghost" entry.
      existing.socketId = socket.id;
      existing.name = playerName;
    } else {
      room.players.set(playerId, {
        playerId,
        socketId: socket.id,
        name: playerName,
        isHost: room.players.size === 0
      });
    }

    socketToPlayer.set(socket.id, { roomCode, playerId });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerId = playerId;

    broadcastPlayers(room, 'player-joined');

    console.log(`Player ${playerName} (${playerId}) joined room ${roomCode}`);
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

    // Pick impostor uniformly at random from the current players.
    const impostorIndex = Math.floor(Math.random() * players.length);
    const impostor = players[impostorIndex];
    const impostorPlayerId = impostor.playerId;

    console.log(`Round started - Impostor randomly selected: ${impostor.name} (from ${players.length} players)`);

    // Store assignments - randomly assign to each player
    room.wordAssignments.clear();
    players.forEach((player) => {
      const isImpostor = player.playerId === impostorPlayerId;
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

      room.wordAssignments.set(player.playerId, {
        word: word,
        isImpostor: isImpostor,
        isBlankCard: isBlankCard
      });
    });

    room.currentWords = { wordA, wordB };
    room.currentImpostor = { playerId: impostorPlayerId, name: impostor.name };
    room.gameState = 'playing';
    room.votes.clear();

    // Initialize turn order (randomize order) - stores playerId, not socket.id,
    // so it stays valid across reconnects.
    room.playerOrder = players.map(p => p.playerId);
    for (let i = room.playerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.playerOrder[i], room.playerOrder[j]] = [room.playerOrder[j], room.playerOrder[i]];
    }
    room.currentTurnIndex = 0;

    // Send words to each player
    players.forEach(player => {
      const assignment = room.wordAssignments.get(player.playerId);
      io.to(player.socketId).emit('word-assigned', {
        word: assignment.word,
        isImpostor: assignment.isImpostor,
        isBlankCard: assignment.isBlankCard || false
      });
    });

    // Notify all players game started with turn info
    const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
    const currentTurnPlayer = room.players.get(currentTurnPlayerId);

    io.to(roomCode).emit('game-started', {
      playerCount: players.length,
      currentTurn: {
        playerId: currentTurnPlayerId,
        playerName: currentTurnPlayer.name,
        playerIndex: 0
      },
      playerOrder: room.playerOrder.map(id => {
        const p = room.players.get(id);
        return { id: p.playerId, name: p.name };
      })
    });

    console.log(`Game started in room ${roomCode} with words: ${wordA} / ${wordB}`);
  });

  socket.on('next-turn', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'playing') return;
    if (room.playerOrder.length === 0) return;

    // Only the player whose turn it currently is may advance the turn.
    // Without this check, a stale/desynced client (or a double-click racing
    // the real current player) could advance the turn an extra time and
    // skip the next person.
    const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
    if (socket.playerId !== currentTurnPlayerId) {
      return;
    }

    // Move to next player
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.playerOrder.length;

    if (room.currentTurnIndex === 0) {
      // Wrapped back to the first speaker - everyone has spoken once this
      // round, so move to a vote instead of starting another speaking turn.
      room.gameState = 'voting';
      room.votes.clear();
      io.to(roomCode).emit('voting-started', {
        players: getPublicPlayers(room)
      });
      console.log(`Room ${roomCode}: speaking round complete, voting started`);
      return;
    }

    const nextTurnPlayerId = room.playerOrder[room.currentTurnIndex];
    const nextTurnPlayer = room.players.get(nextTurnPlayerId);

    if (nextTurnPlayer) {
      io.to(roomCode).emit('turn-changed', {
        currentTurn: {
          playerId: nextTurnPlayerId,
          playerName: nextTurnPlayer.name,
          playerIndex: room.currentTurnIndex
        }
      });
    }
  });

  socket.on('cast-vote', (data) => {
    // votedForId is omitted/null when a player chooses to give up their vote
    // (abstain) instead of accusing someone.
    const { roomCode, votedForId } = data;
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'voting') return;

    const voterId = socket.playerId;
    if (!voterId || !room.players.has(voterId)) return;

    if (votedForId) {
      if (!room.players.has(votedForId)) return;
      if (votedForId === voterId) return; // no self-votes
      room.votes.set(voterId, votedForId);
    } else {
      room.votes.set(voterId, null); // gave up their vote
    }

    // No auto-resolve and no time limit - the room owner decides when to
    // end voting (via 'end-voting') and see the results.
    io.to(roomCode).emit('vote-progress', {
      votesIn: room.votes.size,
      totalVoters: room.players.size
    });
  });

  socket.on('end-voting', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'voting') return;

    const player = room.players.get(socket.playerId);
    if (!player || !player.isHost) return; // only the room owner can end voting

    resolveVotes(room, roomCode);
  });

  socket.on('reveal-words', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);

    if (!room || !room.currentWords) return;

    const { wordA, wordB } = room.currentWords;

    // Check if impostor had a blank card this round
    let impostorHadBlankCard = false;
    room.wordAssignments.forEach((assignment) => {
      if (assignment.isImpostor && assignment.isBlankCard) {
        impostorHadBlankCard = true;
      }
    });

    // Get impostor info
    const impostorName = room.currentImpostor ? room.currentImpostor.name : 'Unknown';

    io.to(roomCode).emit('words-revealed', {
      wordA,
      wordB,
      blankCardMode: room.gameSettings && room.gameSettings.blankCardMode || false,
      impostorHadBlankCard,
      impostorName: impostorName
    });
  });

  socket.on('disconnect', () => {
    const info = socketToPlayer.get(socket.id);
    socketToPlayer.delete(socket.id);

    if (info) {
      const { roomCode, playerId } = info;
      const room = rooms.get(roomCode);
      if (room) {
        const player = room.players.get(playerId);

        // If this player already reconnected with a new socket before this
        // (now stale) socket's disconnect fired, their entry's socketId will
        // no longer match. In that case, do nothing - the player is still in
        // the room under their new connection.
        if (player && player.socketId === socket.id) {
          room.players.delete(playerId);
          room.wordAssignments.delete(playerId);

          if (room.players.size === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted`);
          } else {
            // Update host if host left
            const wasHost = player.isHost;
            if (wasHost) {
              const remaining = Array.from(room.players.values());
              if (remaining.length > 0) {
                remaining[0].isHost = true;
              }
            }

            // Keep playerOrder/currentTurnIndex consistent whether we're
            // mid-speaking or mid-voting, so a later round of discussion
            // still has a correct turn order.
            if ((room.gameState === 'playing' || room.gameState === 'voting') && room.playerOrder.length > 0) {
              const disconnectedIndex = room.playerOrder.indexOf(playerId);
              if (disconnectedIndex !== -1) {
                room.playerOrder.splice(disconnectedIndex, 1);
                // Adjust current turn index if needed
                if (room.playerOrder.length === 0) {
                  room.currentTurnIndex = 0;
                } else if (room.currentTurnIndex >= room.playerOrder.length) {
                  room.currentTurnIndex = 0;
                } else if (disconnectedIndex < room.currentTurnIndex) {
                  room.currentTurnIndex--;
                }

                // Notify about turn change only if we're actively speaking
                if (room.gameState === 'playing' && room.playerOrder.length > 0) {
                  const currentTurnPlayerId = room.playerOrder[room.currentTurnIndex];
                  const currentTurnPlayer = room.players.get(currentTurnPlayerId);
                  if (currentTurnPlayer) {
                    io.to(roomCode).emit('turn-changed', {
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

            // If a voter leaves mid-vote, drop their vote. There's no auto
            // resolve here - the room owner decides when to end voting via
            // the "Done Voting" button, even if someone left.
            if (room.gameState === 'voting') {
              room.votes.delete(playerId);
            }

            broadcastPlayers(room, 'player-left');
          }
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
