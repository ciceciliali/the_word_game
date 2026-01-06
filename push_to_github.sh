#!/bin/bash

# Configure git
git config user.email "cichloeli@gmail.com"
git config user.name "ciceciliali"

# Initialize and commit
git init
git add .
git commit -m "Initial commit - Word Game"

# Set up remote and push
git remote add origin git@github.com:ciceciliali/the_word_game.git
git branch -M main
git push -u origin main

echo "✅ Done! Your code has been pushed to GitHub."

