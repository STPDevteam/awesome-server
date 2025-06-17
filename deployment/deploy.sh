#!/bin/bash

# MCP Backend 部署脚本
# Usage: ./deploy.sh [local|docker] [options]

set -e

# Default values
ENVIRONMENT="local"
SKIP_BUILD=false
DETACHED=true
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_usage() {
    cat << EOF
Usage: ./deploy-simple.sh [ENVIRONMENT] [OPTIONS]

ENVIRONMENTS:
    local       - 本地开发 (mcp-server + 数据库)
    docker      - Docker 容器部署 (后端 + 数据库)

OPTIONS:
    --skip-build        跳过 Docker 镜像构建
    --foreground        前台运行（不后台运行）
    --verbose           详细输出
    --help              显示帮助

EXAMPLES:
    ./deploy-simple.sh local                    # 本地开发
    ./deploy-simple.sh docker                   # Docker 部署
    ./deploy-simple.sh docker --verbose         # Docker 部署 + 详细输出

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        local|docker)
            ENVIRONMENT="$1"
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --foreground)
            DETACHED=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

log_info "Starting MCP Backend deployment: $ENVIRONMENT"

# Verbose mode
if [[ "$VERBOSE" == true ]]; then
    set -x
fi

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check if we have the necessary tools
if [[ "$ENVIRONMENT" == "docker" ]]; then
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
fi

log_success "Pre-deployment checks passed"

if [[ "$ENVIRONMENT" == "local" ]]; then
    # Local development setup
    log_info "Setting up local development environment..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Install dependencies for mcp-server
    if [[ ! -d "mcp-server/node_modules" ]]; then
        log_info "Installing mcp-server dependencies..."
        cd mcp-server
        npm install
        cd ..
    fi
    
    # Install dependencies for mcp-fe
    if [[ ! -d "mcp-fe/node_modules" ]]; then
        log_info "Installing mcp-fe dependencies..."
        cd mcp-fe
        npm install
        cd ..
    fi
    
    # Set environment variables for local development
    export NODE_ENV=development
    export MCP_MODE=stdio
    export DATABASE_URL="postgresql://postgres:password@localhost:5432/mcp_local"
    
    log_success "Local environment setup completed!"
    
    echo
    echo "==================== 后端本地开发 ===================="
    echo "1. Start PostgreSQL database:"
    echo "   docker run --name mcp-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=mcp_local -p 5432:5432 -d postgres:15-alpine"
    echo
    echo "2. Start mcp-server:"
    echo "   npm run dev"
    echo
    echo "3. Access the backend:"
    echo "   Backend:  http://localhost:3001"
    echo
    echo "前端开发："
    echo "   - 进入 ../mcp-fe 目录运行 ./deploy.sh local"
    echo "   - 或直接运行: cd ../mcp-fe && npm run dev"
    echo "==========================================================="
    
elif [[ "$ENVIRONMENT" == "docker" ]]; then
    # Docker deployment
    log_info "Setting up Docker environment..."
    
    # Load environment variables if .env exists
    if [[ -f ".env" ]]; then
        log_info "Loading environment variables from .env"
        export $(cat .env | grep -v '^#' | xargs)
    else
        log_warning "No .env file found, using defaults"
        # Set default values
        export NODE_ENV=production
        export MCP_MODE=http
        export DB_USER=postgres
        export DB_PASSWORD=password
        export DB_NAME=mcp_db
        export JWT_ACCESS_SECRET=default-secret-change-in-production
        export JWT_REFRESH_SECRET=default-refresh-secret-change-in-production
    fi
    
    # Stop existing containers
    log_info "Stopping existing containers..."
    docker-compose down --remove-orphans || true
    
    # Build images if not skipped
    if [[ "$SKIP_BUILD" != true ]]; then
        log_info "Building Docker images..."
        docker-compose build
        log_success "Docker images built successfully"
    else
        log_info "Skipping Docker image building"
    fi
    
    # Create necessary directories
    mkdir -p logs
    
    # Set up Docker Compose options
    COMPOSE_OPTS=""
    if [[ "$DETACHED" == true ]]; then
        COMPOSE_OPTS="-d"
    fi
    
    # Start services
    log_info "Starting backend services..."
    docker-compose up $COMPOSE_OPTS
    
    # Wait for services to be ready (only in detached mode)
    if [[ "$DETACHED" == true ]]; then
        log_info "Waiting for services to be ready..."
        
        # Wait for database
        log_info "Waiting for database..."
        timeout=60
        counter=0
        while ! docker-compose exec -T postgres pg_isready -U postgres &> /dev/null; do
            if [[ $counter -ge $timeout ]]; then
                log_error "Database failed to start within $timeout seconds"
                exit 1
            fi
            sleep 2
            ((counter += 2))
        done
        log_success "Database is ready"
        
        # Wait for mcp-server
        log_info "Waiting for mcp-server..."
        timeout=90
        counter=0
        while ! curl -f http://localhost:3001/health &> /dev/null; do
            if [[ $counter -ge $timeout ]]; then
                log_error "mcp-server failed to start within $timeout seconds"
                exit 1
            fi
            sleep 3
            ((counter += 3))
        done
        log_success "mcp-server is ready"
    fi
    
    log_success "Docker deployment completed successfully!"
    
    echo
    echo "==================== 后端 Docker 部署 ===================="
    echo "Service URLs:"
    echo "  - Backend:     http://localhost:3001"
    echo "  - Database:    localhost:5432"
    echo
    echo "Useful commands:"
    echo "  - View logs:    docker-compose logs -f [service]"
    echo "  - Stop:         docker-compose down"
    echo "  - Restart:      docker-compose restart [service]"
    echo "  - Status:       docker-compose ps"
    echo
    echo "前端部署："
    echo "  - 进入 ../mcp-fe 目录运行 ./deploy.sh docker"
    echo "==========================================================="
    
    # Show running containers
    echo
    log_info "Running containers:"
    docker-compose ps
fi

log_success "Backend deployment completed!" 