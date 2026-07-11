#!/bin/bash

# Duroos Deployment Script
# This script helps with common deployment tasks

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Duroos Deployment Helper${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Function to print colored messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    error ".env file not found!"
    echo "Please copy .env.production to .env and configure it:"
    echo "  cp .env.production .env"
    echo "  nano .env"
    exit 1
fi

# Menu
echo "Select deployment task:"
echo ""
echo "1) Pull latest changes and restart"
echo "2) Install/update dependencies"
echo "3) Check application health"
echo "4) View logs"
echo "5) Backup database"
echo "6) Full deployment (pull + install + restart)"
echo "7) Docker deployment"
echo "8) Exit"
echo ""
read -p "Enter your choice (1-8): " choice

case $choice in
    1)
        info "Pulling latest changes..."
        cd "$PROJECT_DIR"
        git pull origin main

        info "Restarting application with PM2..."
        pm2 restart duroos

        info "Done! Checking status..."
        pm2 status
        ;;

    2)
        info "Installing/updating dependencies..."
        cd "$PROJECT_DIR"
        npm install --production

        info "Dependencies updated!"
        ;;

    3)
        info "Checking application health..."

        # Check if PM2 process is running
        if pm2 list | grep -q duroos; then
            info "PM2 process is running"
            pm2 status duroos
        else
            warn "PM2 process not found!"
        fi

        # Check health endpoint
        if command -v curl &> /dev/null; then
            echo ""
            info "Testing health endpoint..."
            curl -f http://localhost:3000/health && echo "" || echo ""
        fi
        ;;

    4)
        info "Viewing logs (Press Ctrl+C to exit)..."
        pm2 logs duroos --lines 50
        ;;

    5)
        info "Creating database backup..."

        BACKUP_DIR="$PROJECT_DIR/backups"
        mkdir -p "$BACKUP_DIR"

        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.gz"

        # Note: You need to update this with your MongoDB URI
        warn "Make sure to configure your MongoDB URI in this script!"
        echo "For now, run manually:"
        echo "  mongodump --uri='your-mongodb-uri' --gzip --archive=$BACKUP_FILE"
        ;;

    6)
        info "Starting full deployment..."

        # Pull changes
        info "Step 1/4: Pulling latest changes..."
        cd "$PROJECT_DIR"
        git pull origin main

        # Install dependencies
        info "Step 2/4: Installing dependencies..."
        npm install --production

        # Restart application
        info "Step 3/4: Restarting application..."
        pm2 restart duroos

        # Check status
        info "Step 4/4: Checking status..."
        sleep 2
        pm2 status duroos

        # Test health
        if command -v curl &> /dev/null; then
            echo ""
            info "Testing health endpoint..."
            curl -f http://localhost:3000/health && echo "" || echo ""
        fi

        info "Deployment complete! ✅"
        ;;

    7)
        info "Docker deployment..."
        cd "$PROJECT_DIR"

        echo "Select Docker action:"
        echo "1) Build and start containers"
        echo "2) Stop containers"
        echo "3) View logs"
        echo "4) Restart containers"
        read -p "Enter choice (1-4): " docker_choice

        case $docker_choice in
            1)
                info "Building and starting containers..."
                docker-compose up -d --build
                info "Done! Use 'docker-compose logs -f app' to view logs"
                ;;
            2)
                info "Stopping containers..."
                docker-compose down
                ;;
            3)
                info "Viewing logs (Press Ctrl+C to exit)..."
                docker-compose logs -f app
                ;;
            4)
                info "Restarting containers..."
                docker-compose restart
                ;;
            *)
                error "Invalid choice"
                ;;
        esac
        ;;

    8)
        info "Goodbye!"
        exit 0
        ;;

    *)
        error "Invalid choice"
        exit 1
        ;;
esac

echo ""
info "Script completed!"
