#!/bin/bash
set -e
sudo su
REPO="/home/admin/project-name"

echo "📁 Repo path: $REPO"

git config --global --add safe.directory "$REPO"

cd "$REPO"

echo "📥 Fetching latest code..."
git fetch origin

echo "🔄 Resetting staging to origin/staging..."
git checkout staging
git reset --hard origin/staging

echo "🔨 Building Docker images..."
export COMPOSE_BAKE=true
docker compose up --build -d

echo "✅ Deployment complete."
