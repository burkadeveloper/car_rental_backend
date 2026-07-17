version: '3.8'
services:
  mongo:
    image: mongo:6
    container_name: carrental-mongo
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
  redis:
    image: redis:alpine
    container_name: carrental-redis
    restart: always
    ports:
      - "6379:6379"
  backend:
    build: ./backend
    container_name: carrental-backend
    restart: always
    ports:
      - "5000:5000"
    depends_on:
      - mongo
      - redis
    env_file:
      - ./backend/.env
    volumes:
      - ./backend:/app
      - /app/node_modules
  frontend:
    build: ./frontend
    container_name: carrental-frontend
    restart: always
    ports:
      - "3000:3000"
    depends_on:
      - backend
    env_file:
      - ./frontend/.env
    volumes:
      - ./frontend:/app
      - /app/node_modules
volumes:
  mongo-data: