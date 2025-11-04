// ----------------------
// server.js
// ----------------------

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// Connect to Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
    rejectUnauthorized: false,
  },
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to generate invite codes
function makeInviteCode(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// GET /api/rooms?page=number
app.get('/api/rooms', async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const PAGE_SIZE = 21;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const totalRes = await pool.query('SELECT COUNT(*) FROM rooms WHERE is_private = false');
    const totalRooms = parseInt(totalRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalRooms / PAGE_SIZE) || 1;

    const roomsRes = await pool.query(
      `SELECT * FROM rooms WHERE is_private = false
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset]
    );

    res.json({
      currentPage: page,
      totalPages,
      rooms: roomsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching rooms:', error);
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
      `INSERT INTO rooms (name, is_private, invite_code, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [name, !!is_private, invite_code]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to create room:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/room/:inviteCode (get room by invite code)
app.get('/api/room/:inviteCode', async (req, res) => {
  const { inviteCode } = req.params;
  try {
    const result = await pool.query('SELECT * FROM rooms WHERE invite_code = $1', [inviteCode]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Room not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching room by invite code:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Socket.IO events for chat functionality
const roomMessages = {}; // In memory for now, could be moved to DB later

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('joinRoom', ({ roomId, username, color }) => {
    socket.join(roomId);
    console.log(`${username} joined room ${roomId}`);

    if (!roomMessages[roomId]) roomMessages[roomId] = [];

    // Send recent messages to the user
    socket.emit('chat history', roomMessages[roomId]);
  });

  socket.on('chat message', ({ roomId, username, color, text }) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgData = { username, color, text, timestamp };

    if (!roomMessages[roomId]) roomMessages[roomId] = [];
    roomMessages[roomId].push(msgData);

    // Broadcast to everyone in the room
    io.to(roomId).emit('chat message', msgData);
  });
});

// Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});