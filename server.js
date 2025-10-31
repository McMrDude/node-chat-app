// ----------------------
// server.js
// ----------------------

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (your frontend)
app.use(express.static(path.join(__dirname, "public")));

// ---- Chat history persistence ----
const HISTORY_FILE = path.join(__dirname, "chatHistory.json");
const MAX_HISTORY = 200; // keep last 200 messages

// Load chat history from disk when server starts
let history = [];
try {
  const raw = fs.readFileSync(HISTORY_FILE, "utf8");
  history = JSON.parse(raw);
  console.log(`Loaded ${history.length} messages from chatHistory.json`);
} catch (e) {
  console.log("No previous chat history found, starting fresh.");
  history = [];
}

// ---- Handle socket connections ----
io.on("connection", (socket) => {
  console.log("A user connected");

  // Send chat history to the new user
  socket.emit("chat history", history);

  // Listen for chat messages
  socket.on("chat message", (msgData) => {
    const now = new Date();
    msgData.time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Add to in-memory history and limit size
    history.push(msgData);
    if (history.length > MAX_HISTORY) history.shift();

    // Save updated history to disk
    fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), (err) => {
      if (err) console.error("Failed to write history file:", err);
    });

    // Broadcast to all clients
    io.emit("chat message", msgData);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// ---- Start the server ----
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});