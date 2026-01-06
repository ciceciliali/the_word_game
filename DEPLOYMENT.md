# 🚀 How to Deploy Your Word Game

Follow these steps to publish your game online for free!

## Step 1: Push to GitHub

### 1.1 Initialize Git (if not already done)
```bash
cd /Users/ceciliali/Desktop/word_game
git init
git add .
git commit -m "Initial commit - Word Game"
```

### 1.2 Create GitHub Repository
1. Go to [github.com](https://github.com) and sign in
2. Click the **"+"** icon → **"New repository"**
3. Name it: `word-game` (or any name you like)
4. Make it **Public** (required for free hosting)
5. **Don't** initialize with README (we already have files)
6. Click **"Create repository"**

### 1.3 Push Your Code
GitHub will show you commands. Run these in your terminal:
```bash
git remote add origin https://github.com/YOUR_USERNAME/word-game.git
git branch -M main
git push -u origin main
```
*(Replace YOUR_USERNAME with your GitHub username)*

---

## Step 2: Deploy to Render (Easiest - Recommended)

### 2.1 Sign Up
1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with your GitHub account (easiest way)

### 2.2 Create Web Service
1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Click **"Connect GitHub"** and authorize Render
3. Find and select your `word-game` repository
4. Click **"Connect"**

### 2.3 Configure Settings
Fill in these settings:
- **Name**: `word-game` (or any name)
- **Environment**: `Node`
- **Region**: Choose closest to you
- **Branch**: `main`
- **Root Directory**: (leave empty)
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Select **"Free"**

### 2.4 Deploy
1. Scroll down and click **"Create Web Service"**
2. Wait 2-3 minutes for deployment
3. Your game will be live at: `https://word-game.onrender.com`
   *(or whatever name you chose)*

### 2.5 Share Your Game
- Share the URL with friends: `https://your-app-name.onrender.com`
- They can join rooms like: `https://your-app-name.onrender.com/ROOM123`

---

## Alternative: Deploy to Railway (Also Easy)

### Railway Steps
1. Go to [railway.app](https://railway.app) and sign up with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `word-game` repository
5. Railway auto-detects Node.js - just wait for deployment!
6. Your game will be at: `https://your-app-name.up.railway.app`

---

## Important Notes

### Free Tier Limitations
- **Render**: App may sleep after 15 minutes of inactivity (wakes up on first request)
- **Railway**: Limited free credits per month
- Both are perfect for playing with friends!

### Custom Domain (Optional)
- Both services allow you to add a custom domain later
- For now, the free subdomain works great

### Troubleshooting
- If deployment fails, check the build logs in Render/Railway dashboard
- Make sure `package.json` has the correct start script
- Ensure all files are committed to GitHub

---

## Quick Test After Deployment

1. Visit your deployed URL
2. Create a room code (e.g., "TEST123")
3. Share the URL with friends: `https://your-app.onrender.com/TEST123`
4. Everyone joins with the same room code
5. Host clicks "Start Game" when 3+ players join
6. Play!

---

## Need Help?

- Render Docs: https://render.com/docs
- Railway Docs: https://docs.railway.app
- Check build logs if something goes wrong

