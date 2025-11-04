// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://chat_db_8gq8_user:aiIsaBjJWthbBOS97S62LOwmSnR78Plg@dpg-d446r6mmcj7s73bt602g-a.oregon-postgres.render.com/chat_db_8gq8",
  ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// helper to generate invite codes
function makeInviteCode(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// -------------------
// API: List public rooms (paginated)
// -------------------
app.get("/api/rooms", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const PAGE_SIZE = 21;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const countRes = await pool.query("SELECT COUNT(*) FROM rooms WHERE is_private = FALSE");
    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const roomsRes = await pool.query(
      `SELECT id, name, is_private, invite_code, created_at
       FROM rooms
       WHERE is_private = FALSE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset]
    );

    res.json({
      success: true,
      currentPage: page,
      totalPages,
      rooms: roomsRes.rows
    });
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// -------------------
// API: Create room
// -------------------
app.post("/api/rooms", async (req, res) => {
  try {
    const { name, is_private } = req.body;
    if (!name || typeof name !== "string") return res.status(400).json({ success: false, error: "name required" });

    let invite_code = null;
    if (is_private) {
      invite_code = makeInviteCode(12);
      // ensure unique
      let exists = true;
      while (exists) {
        const q = await pool.query("SELECT 1 FROM rooms WHERE invite_code = $1 LIMIT 1", [invite_code]);
        if (q.rowCount === 0) exists = false;
        else invite_code = makeInviteCode(12);
      }
    }

    const insert = await pool.query(
      `INSERT INTO rooms (name, is_private, invite_code, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, name, is_private, invite_code`,
      [name, !!is_private, invite_code]
    );

    if (!insert.rows.length) {
      console.error("Room insert returned no rows");
      return res.status(500).json({ success: false, error: "Insert failed" });
    }

    const room = insert.rows[0];
    console.log("Room created:", room);
    res.json({ success: true, ...room });
  } catch (err) {
    console.error("Failed to create room:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// -------------------
// API: Resolve room by id or invite code
// -------------------
app.get("/api/rooms/:idOrCode", async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const result = await pool.query(
      `SELECT id, name, is_private, invite_code FROM rooms WHERE id::text = $1 OR invite_code = $1 LIMIT 1`,
      [idOrCode]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: "Room not found" });
    res.json({ success: true, room: result.rows[0] });
  } catch (err) {
    console.error("Failed to fetch room:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// -------------------
// API: messages for a room (history)
// returns messages joined with users (username, color)
// -------------------
app.get("/api/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const q = await pool.query(
      `SELECT m.id, m.content, m.timestamp, u.username, u.color
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.room_id = $1
       ORDER BY m.timestamp ASC`,
      [roomId]
    );

    // normalize to client fields
    const messages = q.rows.map(row => ({
      id: row.id,
      text: row.content,
      time: row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      username: row.username || "Anonymous",
      color: row.color || "#000000"
    }));

    res.json({ success: true, messages });
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// -------------------
// Socket.IO: real-time chat
// Handles both 'joinRoom' and 'join room' events from clients
// Handles 'chat message' (client) and saves to DB then broadcasts
// -------------------
io.on("connection", (socket) => {
  console.log("A user connected (socket id:", socket.id, ")");

  // support both event names just in case
  socket.on("joinRoom", joinRoomHandler);
  socket.on("join room", joinRoomHandler);

  async function joinRoomHandler(roomId) {
    if (!roomId) return;
    socket.join(roomId.toString());
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  }

  // Listen for messages from client
  // support both 'chat message' and 'chatMessage'
  socket.on("chat message", async (msg) => {
    await handleIncomingMessage(msg);
  });
  socket.on("chatMessage", async (msg) => {
    await handleIncomingMessage(msg);
  });

  async function handleIncomingMessage(msg) {
    // msg should contain: username, color, text (or 'text'/'content'), roomId (or room_id)
    try {
      const username = (msg.username || msg.userName || "Anonymous").trim();
      const color = msg.color || "#000000";
      const text = msg.text || msg.content || "";
      const roomId = msg.roomId || msg.room_id || msg.room;

      if (!text || !roomId) return;

      // 1) upsert user (find by username, else create). We'll keep it simple: try insert ON CONFLICT (username)
      let userId = null;
      try {
        const userRes = await pool.query(
          `INSERT INTO users (username, color) VALUES ($1, $2)
           ON CONFLICT (username) DO UPDATE SET color = EXCLUDED.color
           RETURNING id`,
          [username, color]
        );
        userId = userRes.rows[0].id;
      } catch (uerr) {
        console.error("User upsert error:", uerr);
      }

      // 2) insert message
      const insert = await pool.query(
        `INSERT INTO messages (room_id, user_id, content, timestamp)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, content, timestamp`,
        [roomId, userId, text]
      );

      const saved = insert.rows[0];
      // Compose broadcast message payload with username and color (so clients don't need to join users)
      const outMsg = {
        id: saved.id,
        username,
        color,
        text: saved.content,
        time: new Date(saved.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        roomId
      };

      io.to(roomId.toString()).emit("chat message", outMsg);
    } catch (err) {
      console.error("Error handling incoming message:", err);
    }
  }

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});