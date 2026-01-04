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
                    const username = data.username || clientId;
                    
                    if (!rooms.has(currentRoom)) {
                        rooms.set(currentRoom, new Map());
                    }
                    
                    rooms.get(currentRoom).set(ws, { clientId, username });
                    ws.clientId = clientId;
                    ws.username = username;
                    
                    console.log(`${username} (${clientId}) joined room ${currentRoom} (${rooms.get(currentRoom).size} users)`);
                    
                    // Get list of all users in room
                    const userList = Array.from(rooms.get(currentRoom).values()).map(u => u.username);
                    
                    broadcast(currentRoom, {
                        type: "user-joined",
                        clientId: clientId,
                        username: username,
                        userCount: rooms.get(currentRoom).size,
                        users: userList
                    }, ws);
                    
                    ws.send(JSON.stringify({
                        type: "room-info",
                        userCount: rooms.get(currentRoom).size,
                        users: userList
                    }));
                    break;

                case "audio":
                    if (currentRoom && rooms.has(currentRoom)) {
                        broadcast(currentRoom, {
                            type: "audio",
                            clientId: clientId,
                            username: ws.username,
                            data: data.data,
                            volume: data.volume || 0
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
        rooms.get(roomId).forEach((userInfo, client) => {
            if (client !== exclude && client.readyState === 1) { // WebSocket.OPEN
                client.send(messageStr);
            }
        });
    }

    function leaveRoom(ws, roomId, clientId) {
        if (roomId && rooms.has(roomId)) {
            const username = ws.username || clientId;
            rooms.get(roomId).delete(ws);
            
            const remainingUsers = rooms.get(roomId).size;
            
            if (remainingUsers === 0) {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                const userList = Array.from(rooms.get(roomId).values()).map(u => u.username);
                broadcast(roomId, {
                    type: "user-left",
                    clientId: clientId,
                    username: username,
                    userCount: remainingUsers,
                    users: userList
                });
                console.log(`${username} left room ${roomId} (${remainingUsers} remaining)`);
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
