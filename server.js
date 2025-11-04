require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Fetch all public rooms with pagination
app.get("/api/rooms", async (req, res) => {
  const limit = 21;
  const page = req.query.page || 1;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      "SELECT * FROM rooms WHERE is_private = false ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ success: true, rooms: result.rows });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Could not fetch rooms" });
  }
});

// Create new chat room
app.post("/api/rooms", async (req, res) => {
  const { name, is_private } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO rooms (name, is_private, invite_code, created_at) 
       VALUES ($1, $2, $3, NOW())
       RETURNING id, name, invite_code, is_private`,
      [name, is_private, Math.random().toString(36).substring(2, 15)]
    );
    res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Could not create room" });
  }
});

// Get previous messages for a room
app.get("/api/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC",
      [roomId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Could not fetch messages" });
  }
});

// Socket.IO for real-time chat
io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
  });

  socket.on("chatMessage", async (data) => {
    const { user_id, room_id, content, username, color } = data;

    try {
      const result = await pool.query(
        `INSERT INTO messages (user_id, room_id, content, username, color, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [user_id || null, room_id, content, username, color]
      );
      io.in(room_id).emit("message", result.rows[0]);
    } catch (err) {
      console.error("Error saving message: ", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));