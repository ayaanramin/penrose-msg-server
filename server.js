// Voice Call Server for Production Hosting
// Install dependencies: npm install ws express
// This version works with Render, Railway, Fly.io, etc.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // roomId -> Set of clients

// Health check endpoint for hosting platforms
app.get('/', (req, res) => {
  res.send('Voice Call Server is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  let currentRoom = null;
  let clientId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          // Join a room
          currentRoom = data.roomId;
          clientId = data.clientId;
          
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          
          rooms.get(currentRoom).add(ws);
          ws.clientId = clientId;
          
          console.log(`Client ${clientId} joined room ${currentRoom} (${rooms.get(currentRoom).size} users)`);
          
          // Notify others in room
          broadcast(currentRoom, {
            type: 'user-joined',
            clientId: clientId,
            userCount: rooms.get(currentRoom).size
          }, ws);
          
          // Send current user count to the joiner
          ws.send(JSON.stringify({
            type: 'room-info',
            userCount: rooms.get(currentRoom).size
          }));
          break;

        case 'audio':
          // Forward audio to others in the same room
          if (currentRoom && rooms.has(currentRoom)) {
            broadcast(currentRoom, {
              type: 'audio',
              clientId: clientId,
              data: data.data
            }, ws);
          }
          break;

        case 'leave':
          leaveRoom(ws, currentRoom, clientId);
          break;
          
        case 'ping':
          // Keep connection alive
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    leaveRoom(ws, currentRoom, clientId);
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  function broadcast(roomId, message, exclude = null) {
    if (!rooms.has(roomId)) return;
    
    const messageStr = JSON.stringify(message);
    rooms.get(roomId).forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  function leaveRoom(ws, roomId, clientId) {
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(ws);
      
      const remainingUsers = rooms.get(roomId).size;
      
      if (remainingUsers === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        broadcast(roomId, {
          type: 'user-left',
          clientId: clientId,
          userCount: remainingUsers
        });
        console.log(`Client ${clientId} left room ${roomId} (${remainingUsers} remaining)`);
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`Voice call server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`When deployed, use: wss://your-app-url.com`);
});