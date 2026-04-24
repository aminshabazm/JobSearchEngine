FROM python:3.11-slim

# Install Node.js 18 for Vite frontend build
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend dependencies (cached layer)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --legacy-peer-deps

# Build React app
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy rest of application
COPY . .

# Create runtime directories
RUN mkdir -p data logs

EXPOSE 8000

# Railway injects $PORT; fall back to 8000 locally
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}
