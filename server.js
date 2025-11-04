// ----------------------
// server.js
// ----------------------

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");

// ---- Database Connection ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://chat_db_8gq8_user:aiIsaBjJWthbBOS97S62LOwmSnR78Plg@dpg-d446r6mmcj7s73bt602g-a.oregon-postgres.render.com/chat_db_8gq8",
  ssl: { rejectUnauthorized: false }
});

// ---- Express and Socket.IO ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middlewares
app.use(express.json());
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Helper to generate invite code
function makeInviteCode(length = 10) {
  let code = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---- REST API ----

// GET /api/rooms?limit=21&offset=0 (public rooms listing with pagination)
app.get('/api/rooms', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 21;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, name, is_private, invite_code, created_at
       FROM rooms
       WHERE is_private = FALSE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2;`,
      [limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM rooms WHERE is_private = FALSE;`
    );

    const totalRooms = parseInt(countResult.rows[0].count);

    res.json({
      rooms: result.rows,
      total: totalRooms,
    });
  } catch (err) {
    console.error('Failed to get rooms:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/rooms (create room)
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, is_private } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });

    let invite_code = null;
    if (is_private) {
      invite_code = makeInviteCode(10);
      let exists = true;
      while (exists) {
        const check = await pool.query('SELECT 1 FROM rooms WHERE invite_code = $1', [invite_code]);
        if (check.rowCount === 0) exists = false;
        else invite_code = makeInviteCode(10);
      }
    }

    const result = await pool.query(
      `INSERT INTO rooms (name, is_private, invite_code)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, !!is_private, invite_code]
    );

    if (!result.rows.length) {
      console.error("⚠️ Room insert returned no rows");
      return res.status(500).json({ error: 'Insert failed' });
    }

    console.log("✅ Room created:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to create room:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/rooms/:id (get room by id or invite code)
app.get('/api/rooms/:idOrCode', async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const result = await pool.query(
      `SELECT * FROM rooms 
       WHERE id = $1 OR invite_code = $1 LIMIT 1`,
      [idOrCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to get room:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---- Socket.IO for chat ----
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  socket.on("chat message", (msgData) => {
    console.log(`Message in room ${msgData.roomId}: ${msgData.text}`);
    io.to(msgData.roomId).emit("chat message", msgData);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// ---- Start the Server ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});