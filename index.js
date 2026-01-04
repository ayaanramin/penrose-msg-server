import express from "express";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const __dirname = path.resolve();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Make sure images folder exists
const imgDir = path.join(__dirname, "images");
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

// Image upload endpoint (your existing code)
app.post("/upload", (req, res) => {
    try {
        const { dataUrl } = req.body;
        if (!dataUrl) return res.status(400).json({ error: "No data URL" });
        const id = nanoid(8);
        const base64 = dataUrl.split(",")[1];
        const filePath = path.join(imgDir, `${id}.png`);
        fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
        const fullUrl = `${req.protocol}://${req.get("host")}/img/${id}.png`;
        res.json({ url: fullUrl });
    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.use("/img", express.static("images"));

// Health check endpoint
app.get("/", (req, res) => {
    res.json({ 
        status: "ok", 
        services: ["image-upload", "voice-call"],
        rooms: rooms.size 
    });
});

// Voice call WebSocket functionality
const rooms = new Map(); // roomId -> Set of clients

wss.on("connection", (ws) => {
    console.log("Voice client connected");
    let currentRoom = null;
    let clientId = null;

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case "join":
                    currentRoom = data.roomId;
                    clientId = data.clientId;
                    
                    if (!rooms.has(currentRoom)) {
                        rooms.set(currentRoom, new Set());
                    }
                    
                    rooms.get(currentRoom).add(ws);
                    ws.clientId = clientId;
                    
                    console.log(`Client ${clientId} joined room ${currentRoom} (${rooms.get(currentRoom).size} users)`);
                    
                    broadcast(currentRoom, {
                        type: "user-joined",
                        clientId: clientId,
                        userCount: rooms.get(currentRoom).size
                    }, ws);
                    
                    ws.send(JSON.stringify({
                        type: "room-info",
                        userCount: rooms.get(currentRoom).size
                    }));
                    break;

                case "audio":
                    if (currentRoom && rooms.has(currentRoom)) {
                        broadcast(currentRoom, {
                            type: "audio",
                            clientId: clientId,
                            data: data.data
                        }, ws);
                    }
                    break;

                case "leave":
                    leaveRoom(ws, currentRoom, clientId);
                    break;
                    
                case "ping":
                    ws.send(JSON.stringify({ type: "pong" }));
                    break;
            }
        } catch (e) {
            console.error("Error parsing message:", e);
        }
    });

    ws.on("close", () => {
        leaveRoom(ws, currentRoom, clientId);
        console.log("Voice client disconnected");
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });

    const pingInterval = setInterval(() => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify({ type: "ping" }));
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);

    function broadcast(roomId, message, exclude = null) {
        if (!rooms.has(roomId)) return;
        
        const messageStr = JSON.stringify(message);
        rooms.get(roomId).forEach((client) => {
            if (client !== exclude && client.readyState === 1) { // WebSocket.OPEN
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
                    type: "user-left",
                    clientId: clientId,
                    userCount: remainingUsers
                });
                console.log(`Client ${clientId} left room ${roomId} (${remainingUsers} remaining)`);
            }
        }
    }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log("Server running on port", port);
    console.log("Image upload: POST /upload");
    console.log("Voice calls: WebSocket connection available");
});