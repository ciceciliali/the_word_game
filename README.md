# Word Game - Find the Impostor

A multiplayer word game where players try to find the impostor. One player gets a different word than everyone else, and the group must figure out who it is!

## How to Play

1. **Join a Room**: Enter your name and a room code (or create a new one)
2. **Wait for Players**: The host needs at least 3 players to start
3. **Get Your Word**: Each player receives a word (one player gets a different word)
4. **Discuss**: Players discuss and try to find the impostor
5. **New Round**: Host can start a new round with new words

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and go to `http://localhost:3000`

## Free Hosting Options

### Option 1: Render (Recommended - Easiest)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and sign up
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Settings:
   - **Name**: word-game (or any name)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
6. Click "Create Web Service"
7. Your app will be live at `https://your-app-name.onrender.com`

### Option 2: Railway

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) and sign up
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will auto-detect Node.js and deploy
6. Your app will be live at `https://your-app-name.up.railway.app`

### Option 3: Fly.io

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. Run `fly launch` in your project directory
3. Follow the prompts
4. Your app will be live at `https://your-app-name.fly.dev`

### Option 4: Heroku (if you have an account)

1. Install Heroku CLI
2. Run `heroku create your-app-name`
3. Run `git push heroku main`
4. Your app will be live at `https://your-app-name.herokuapp.com`

## Customizing Word Pairs

Edit the `wordPairs.json` file to add or modify word pairs. Each pair should be an array with two words: `["wordA", "wordB"]`.

## Features

- ✅ Real-time multiplayer using Socket.io
- ✅ Room-based gameplay
- ✅ Host controls (start game, new round)
- ✅ Minimum 3 players requirement
- ✅ Random word pair selection
- ✅ One impostor per round
- ✅ Responsive design
- ✅ Easy to deploy for free

## Technology Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Real-time**: Socket.io for WebSocket communication

## Notes

- The app uses WebSockets, so make sure your hosting provider supports persistent connections
- Free tiers may have some limitations (e.g., sleep after inactivity on Render)
- For better performance, consider upgrading to a paid plan if you have many concurrent users

