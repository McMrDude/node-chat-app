// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me"; // set securely in Render
const JWT_COOKIE_NAME = "token";

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper: generate invite codes
function makeInviteCode(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// --------------------
// AUTH HELPERS
// --------------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" }); // expires in 30 days
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// middleware to get auth from cookie
async function getUserFromRequest(req) {
  try {
    const raw = req.headers.cookie;
    if (!raw) return null;
    const parsed = cookie.parse(raw || "");
    const token = parsed[JWT_COOKIE_NAME];
    if (!token) return null;
    const data = verifyToken(token);
    if (!data || !data.id) return null;
    // fetch fresh user info
    const q = await pool.query("SELECT id, username, color FROM users WHERE id = $1 LIMIT 1", [data.id]);
    if (!q.rows.length) return null;
    return q.rows[0];
  } catch (err) {
    console.error("getUserFromRequest error:", err);
    return null;
  }
}

// --------------------
// AUTH ROUTES
// --------------------

// Register: username + password (no email)
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, color } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: "username and password required" });
    const hashed = await bcrypt.hash(password, 10);
    const q = await pool.query(
      "INSERT INTO users (username, password_hash, color) VALUES ($1, $2, $3) RETURNING id, username, color",
      [username, hashed, color || "#000000"]
    );
    const user = q.rows[0];
    const token = signToken({ id: user.id });
    res.setHeader("Set-Cookie", cookie.serialize(JWT_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    }));
    res.json({ success: true, user });
  } catch (err) {
    if (err.code === "23505") { // unique violation
      return res.status(400).json({ success: false, error: "username already taken" });
    }
    console.error("register error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: "username and password required" });
    const q = await pool.query("SELECT id, username, password_hash, color FROM users WHERE username = $1 LIMIT 1", [username]);
    if (!q.rows.length) return res.status(400).json({ success: false, error: "invalid credentials" });
    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ success: false, error: "invalid credentials" });
    const token = signToken({ id: user.id });
    res.setHeader("Set-Cookie", cookie.serialize(JWT_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    }));
    res.json({ success: true, user: { id: user.id, username: user.username, color: user.color } });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", cookie.serialize(JWT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  }));
  res.json({ success: true });
});

// server.js — add this route
app.post("/api/users/visit-rooms-batch", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });

    const { roomIds } = req.body;
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return res.json({ success: true, inserted: 0 });
    }

    // Build a parameterized multi-row insert: (user.id, $1), (user.id, $2), ...
    const values = [];
    const params = [];
    let paramIdx = 1;
    for (const rid of roomIds) {
      params.push(`($${paramIdx}, $${paramIdx + 1})`);
      values.push(user.id, rid);
      paramIdx += 2;
    }

    const sql = `
      INSERT INTO user_private_rooms (user_id, room_id)
      VALUES ${params.join(", ")}
      ON CONFLICT DO NOTHING
    `;
    await pool.query(sql, values);

    return res.json({ success: true });
  } catch (err) {
    console.error("visit-rooms-batch error:", err);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

// GET /api/me -> return current user if logged in
app.get("/api/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.json({ success: false });
    // also load visited private rooms ids
    const v = await pool.query("SELECT room_id FROM user_private_rooms WHERE user_id = $1", [user.id]);
    const visited = v.rows.map(r => r.room_id);
    res.json({ success: true, user: { ...user, visitedPrivateRooms: visited } });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// Save a visited private room for a logged-in user
app.post("/api/users/visit-room", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: "not authenticated" });
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ success: false, error: "roomId required" });
    await pool.query("INSERT INTO user_private_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, roomId]);
    res.json({ success: true });
  } catch (err) {
    console.error("visit-room error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// --------------------
// ROOMS & MESSAGES API (existing behavior, slight tweaks)
// --------------------

// GET paginated public rooms
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
    res.json({ success: true, currentPage: page, totalPages, rooms: roomsRes.rows });
  } catch (err) {
    console.error("rooms fetch error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// Create room
app.post("/api/rooms", async (req, res) => {
  try {
    const { name, is_private } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "name required" });
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
    const room = insert.rows[0];
    // If user is logged in and room was created private, add to visited list
    const user = await getUserFromRequest(req);
    if (user && room.is_private) {
      await pool.query("INSERT INTO user_private_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, room.id]);
    }
    res.json({ success: true, ...room });
  } catch (err) {
    console.error("create room error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// Resolve room by id or invite code
app.get("/api/rooms/:idOrCode", async (req, res) => {
  try {
    const { idOrCode } = req.params;

    // 1️⃣ Fetch the room
    const result = await pool.query(
      `SELECT id, name, is_private, invite_code FROM rooms WHERE id::text = $1 OR invite_code = $1 LIMIT 1`,
      [idOrCode]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, error: "Room not found" });

    const room = result.rows[0];

    // 2️⃣ Fetch the logged-in user
    const user = await getUserFromRequest(req);

    // 3️⃣ Mark as visited if private
    if (user && room.is_private) {
      await pool.query(
        `INSERT INTO user_private_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.id, room.id]
      );

      const visitedRes = await pool.query(
        `SELECT room_id FROM user_private_rooms WHERE user_id = $1`,
        [user.id]
      );

      const visitedRooms = visitedRes.rows.map(r => r.room_id);

      // 4️⃣ Return room + visited rooms to client
      return res.json({ success: true, room, visitedPrivateRooms: visitedRooms });
    }

    // 5️⃣ If room is not private or user not logged in
    return res.json({ success: true, room });

  } catch (err) {
    console.error("resolve room error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// Room messages history
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
    const messages = q.rows.map(row => ({
      id: row.id,
      text: row.content,
      time: row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
      username: row.username || "Anonymous",
      color: row.color || "#000000"
    }));
    res.json({ success: true, messages });
  } catch (err) {
    console.error("messages fetch error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// Delete room (and its messages)
app.delete("/api/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM messages WHERE room_id = $1", [id]);
    await pool.query("DELETE FROM user_private_rooms WHERE room_id = $1", [id]);
    await pool.query("DELETE FROM rooms WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("delete room error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// --------------------
// SOCKET.IO CHAT
// --------------------
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRoom", (roomId) => {
    if (!roomId) return;
    socket.join(roomId.toString());
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // messages coming from client
  socket.on("chat message", async (msg) => {
    try {
      // payload: { username, color, text, roomId, (optional) user_id }
      const username = (msg.username || "Anonymous").trim();
      const color = msg.color || "#000000";
      const text = msg.text || msg.content || "";
      const roomId = msg.roomId || msg.room_id || msg.room;
      let userId = msg.user_id || null;

      // Try to get userId from cookie token if not provided
      if (!userId && socket.handshake?.headers?.cookie) {
        const parsed = cookie.parse(socket.handshake.headers.cookie || "");
        const token = parsed[JWT_COOKIE_NAME];
        if (token) {
          const payload = verifyToken(token);
          if (payload && payload.id) userId = payload.id;
        }
      }

      if (userId) {
        try {
          const check = await pool.query("SELECT 1 FROM users WHERE id = $1", [userId]);
          if (check.rows.length === 0) {
            console.warn(`user_id ${userId} not found in users table — treating as anonymous`);
            userId = null;
          }
        } catch (err) {
          console.error("User existence check failed:", err);
          userId = null;
        }
      }

      // Don’t process empty messages or invalid rooms
      if (!text || !roomId) return;

      // 🔹 Allow anonymous users to send messages WITHOUT creating DB user rows
      // So we skip this old "upsert user" step unless needed
      if (userId) {
        // insert message with user reference
        await pool.query(
          `INSERT INTO messages (room_id, user_id, content, timestamp)
           VALUES ($1, $2, $3, NOW())`,
          [roomId, userId, text]
        );
      } else {
        // anonymous message, no user_id
        await pool.query(
          `INSERT INTO messages (room_id, content, timestamp)
           VALUES ($1, $2, NOW())`,
          [roomId, text]
        );
      }

      // prepare outgoing message object
      const outMsg = {
        username,
        color,
        text,
        time: new Date().toLocaleTimeString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        roomId
      };

      // 🔹 Only mark private rooms as visited if a logged-in user sent a message
      if (userId) {
        try {
          const roomRes = await pool.query("SELECT is_private FROM rooms WHERE id = $1 LIMIT 1", [roomId]);
          if (roomRes.rows.length && roomRes.rows[0].is_private) {
            await pool.query(
              `INSERT INTO user_private_rooms (user_id, room_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [userId, roomId]
            );
          }
        } catch (e) {
          console.error("Error marking private room visited:", e);
        }
      }

      // 🔹 Broadcast the message to everyone in the room
      io.to(roomId.toString()).emit("chat message", outMsg);
    } catch (err) {
      console.error("socket chat message error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});


// start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));