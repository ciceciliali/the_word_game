#!/bin/bash

echo "🔧 Fixing Command Line Tools issue..."

# Try to reset xcode-select path (may require password)
echo "Attempting to reset xcode-select path..."
sudo xcode-select --reset

# If that doesn't work, try setting it to the default
echo "Setting to default path..."
sudo xcode-select --switch /Library/Developer/CommandLineTools

# Verify installation
echo "Checking if Command Line Tools are installed..."
xcode-select -p

echo ""
echo "If the above didn't work, you may need to:"
echo "1. Run: xcode-select --install"
echo "2. Or download from: https://developer.apple.com/download/more/"
echo ""
echo "After fixing, you can push to GitHub with:"
echo "  cd /Users/ceciliali/Desktop/word_game"
echo "  git config user.email 'cichloeli@gmail.com'"
echo "  git config user.name 'ciceciliali'"
echo "  git init"
echo "  git add ."
echo "  git commit -m 'Initial commit - Word Game'"
echo "  git remote add origin git@github.com:ciceciliali/the_word_game.git"
echo "  git branch -M main"
echo "  git push -u origin main"

