#!/bin/bash
# AgentAudit Deploy Script
# Usage: ./deploy.sh [railway|render|docker|vercel]

set -e

ENV=${1:-railway}

echo "🚀 AgentAudit Deployment"
echo "========================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prereqs() {
    echo "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        echo "${RED}❌ Node.js not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "${RED}❌ npm not installed${NC}"
        exit 1
    fi
    
    echo "${GREEN}✓ Prerequisites met${NC}"
    echo ""
}

# Build
deploy_railway() {
    echo "${YELLOW}Deploying to Railway...${NC}"
    
    if ! command -v railway &> /dev/null; then
        echo "Installing Railway CLI..."
        npm install -g @railway/cli
    fi
    
    echo "Building project..."
    npm ci
    npx prisma generate
    npm run build
    
    echo "Deploying..."
    railway up
    
    echo "${GREEN}✓ Deployed to Railway${NC}"
}

deploy_render() {
    echo "${YELLOW}Deploying to Render...${NC}"
    
    echo "Ensure you have:"
    echo "1. Created a Render account"
    echo "2. Connected your GitHub repo"
    echo "3. Created a PostgreSQL database"
    echo ""
    
    echo "Building locally to verify..."
    npm ci
    npx prisma generate
    npm run build
    
    echo "${GREEN}✓ Build successful. Push to GitHub to trigger Render deploy.${NC}"
}

deploy_docker() {
    echo "${YELLOW}Deploying with Docker...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo "${RED}❌ Docker not installed${NC}"
        exit 1
    fi
    
    echo "Building Docker image..."
    docker build -t agentaudit-api .
    
    echo "Starting services..."
    docker-compose up -d
    
    echo "${GREEN}✓ Docker deployment complete${NC}"
    echo "API available at: http://localhost:8080"
    echo "Docs available at: http://localhost:8080/docs"
}

deploy_vercel() {
    echo "${YELLOW}Deploying to Vercel...${NC}"
    
    if ! command -v vercel &> /dev/null; then
        echo "Installing Vercel CLI..."
        npm install -g vercel
    fi
    
    echo "Deploying..."
    vercel --prod
    
    echo "${GREEN}✓ Deployed to Vercel${NC}"
}

# Main
check_prereqs

case $ENV in
    railway)
        deploy_railway
        ;;
    render)
        deploy_render
        ;;
    docker)
        deploy_docker
        ;;
    vercel)
        deploy_vercel
        ;;
    *)
        echo "Usage: ./deploy.sh [railway|render|docker|vercel]"
        exit 1
        ;;
esac

echo ""
echo "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Set environment variables in your platform dashboard"
echo "2. Run database migrations: npx prisma migrate deploy"
echo "3. Test the API: curl http://your-domain/health"
echo "4. View docs: http://your-domain/docs"
