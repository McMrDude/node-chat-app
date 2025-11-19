// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_COOKIE_NAME = "token";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// Supabase (file uploads)
// --------------------
// BUCKET: img_links (you said this is your bucket)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn("Supabase vars missing. /api/upload will fail if used.");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// multer: memory storage so we can pipe buffer to Supabase
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// --------------------
// Helpers
// --------------------
function makeInviteCode(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * Safe helper to read current user from request cookies (returns null if not authenticated)
 */
async function getUserFromRequest(req) {
  try {
    const raw = req.headers.cookie;
    if (!raw) return null;
    const parsed = cookie.parse(raw || "");
    const token = parsed[JWT_COOKIE_NAME];
    if (!token) return null;
    const data = verifyToken(token);
    if (!data || !data.id) return null;
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
      maxAge: 60 * 60 * 24 * 30
    }));
    res.json({ success: true, user });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ success: false, error: "username already taken" });
    console.error("register error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

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
      maxAge: 60 * 60 * 24 * 30
    }));
    res.json({ success: true, user: { id: user.id, username: user.username, color: user.color } });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", cookie.serialize(JWT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  }));
  res.json({ success: true });
});

// update username/color for authenticated user
app.post("/api/update-identity", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });

    const { username, color } = req.body;
    if (!username || typeof username !== "string") return res.status(400).json({ success: false, error: "username required" });
    const colorVal = (typeof color === "string" && /^#?[0-9A-Fa-f]{6}$/.test(color)) ? (color.startsWith("#") ? color : `#${color}`) : null;

    await pool.query("UPDATE users SET username = $1, color = $2 WHERE id = $3", [username, colorVal || "#000000", user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Update-identity error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// --------------------
// IMAGE UPLOAD -> Supabase storage bucket (img_links)
// --------------------
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error("Supabase credentials missing.");
      return res.status(500).json({ success: false, error: "server misconfigured" });
    }

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    // create a stable path (images/<timestamp>-random.<ext>)
    const fileName = `images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET || "img_links")
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      throw uploadError;
    }

    // get public URL (this returns an object; older/newer SDKs differ)
    // This code works for both typical v1/v2 SDK responses
    const { data: pub, error: pubErr } = supabase.storage.from(process.env.SUPABASE_BUCKET || "img_links").getPublicUrl(fileName);
    if (pubErr) {
      console.error("Supabase getPublicUrl error:", pubErr);
      return res.status(500).json({ success: false, error: "could not get public url" });
    }

    // pub.publicURL or pub.publicUrl depending on SDK; normalize
    const publicUrl = pub?.publicURL || pub?.publicUrl || pub?.url || null;
    if (!publicUrl) {
      console.warn("Public URL missing from supabase response, returning path instead.");
      return res.json({ success: true, url: `/${fileName}` });
    }

    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("Supabase upload error:", err);
    res.status(500).json({ success: false, error: "upload failed" });
  }
});

// --------------------
// BATCH VISIT ROOMS (merge local -> account on login/register)
// --------------------
app.post("/api/users/visit-rooms-batch", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });

    const { roomIds } = req.body;
    if (!Array.isArray(roomIds) || roomIds.length === 0) return res.json({ success: true, inserted: 0 });

    const values = [];
    const params = [];
    let paramIdx = 1;
    for (const rid of roomIds) {
      params.push(`($${paramIdx}, $${paramIdx + 1})`);
      values.push(user.id, rid);
      paramIdx += 2;
    }

    const sql = `INSERT INTO user_private_rooms (user_id, room_id) VALUES ${params.join(", ")} ON CONFLICT DO NOTHING`;
    await pool.query(sql, values);

    return res.json({ success: true });
  } catch (err) {
    console.error("visit-rooms-batch error:", err);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

// --------------------
// /api/me
// --------------------
app.get("/api/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.json({ success: false });
    const v = await pool.query("SELECT room_id FROM user_private_rooms WHERE user_id = $1", [user.id]);
    const visited = v.rows.map(r => r.room_id);
    res.json({ success: true, user: { ...user, visitedPrivateRooms: visited } });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ success: false, error: "server error" });
  }
});

// --------------------
// ROOMS & MESSAGES API
// --------------------
app.get("/api/rooms", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const PAGE_SIZE = 12;
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

app.post("/api/rooms", async (req, res) => {
  try {
    const { name, is_private } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "name required" });
    let invite_code = null;
    if (is_private) {
      invite_code = makeInviteCode(12);
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

app.get("/api/rooms/:idOrCode", async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const result = await pool.query(
      `SELECT id, name, is_private, invite_code FROM rooms WHERE id::text = $1 OR invite_code = $1 LIMIT 1`,
      [idOrCode]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: "Room not found" });
    const room = result.rows[0];
    const user = await getUserFromRequest(req);
    if (user && room.is_private) {
      await pool.query(`INSERT INTO user_private_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, room.id]);
      const visitedRes = await pool.query(`SELECT room_id FROM user_private_rooms WHERE user_id = $1`, [user.id]);
      const visitedRooms = visitedRes.rows.map(r => r.room_id);
      return res.json({ success: true, room, visitedPrivateRooms: visitedRooms });
    }
    return res.json({ success: true, room });
  } catch (err) {
    console.error("resolve room error:", err);
    res.status(500).json({ success: false, error: "db error" });
  }
});

// messages with image_url support
app.get("/api/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const q = await pool.query(
      `SELECT m.id, m.content, m.image_url, m.timestamp, u.username, u.color
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.room_id = $1
       ORDER BY m.timestamp ASC`,
      [roomId]
    );
    const messages = q.rows.map(row => ({
      id: row.id,
      text: row.content,
      imageUrl: row.image_url || null,
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

// delete room
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

  socket.on("chat message", async (msg) => {
    try {
      // payload: { username, color, text, roomId, user_id (optional), imageUrl (optional) }
      const usernameFromClient = (msg.username || "Anonymous").trim();
      const colorFromClient = msg.color || "#000000";
      const text = msg.text || msg.content || "";
      const roomId = msg.roomId || msg.room_id || msg.room;
      let userId = msg.user_id || null;

      // Try token from handshake cookies if user_id not provided
      if (!userId && socket.handshake?.headers?.cookie) {
        try {
          const parsed = cookie.parse(socket.handshake.headers.cookie || "");
          const token = parsed[JWT_COOKIE_NAME];
          if (token) {
            const payload = verifyToken(token);
            if (payload && payload.id) userId = payload.id;
          }
        } catch (e) {
          // ignore
        }
      }

      // validate userId exists in users table; if missing, treat as anonymous
      let dbUser = null;
      if (userId) {
        try {
          const check = await pool.query("SELECT id, username, color FROM users WHERE id = $1 LIMIT 1", [userId]);
          if (check.rows.length === 0) {
            console.warn(`user_id ${userId} not found — treating as anonymous`);
            userId = null;
          } else {
            dbUser = check.rows[0];
          }
        } catch (err) {
          console.error("User existence check failed:", err);
          userId = null;
        }
      }

      const imageUrl = msg.imageUrl || null;

      // allow image-only messages
      if (!text && !imageUrl) return;
      if (!roomId) return;

      // Insert: include image_url column (DB must have it; you said it does)
      if (userId) {
        await pool.query(
          `INSERT INTO messages (room_id, user_id, content, image_url, timestamp)
           VALUES ($1, $2, $3, $4, NOW())`,
          [roomId, userId, text, imageUrl]
        );
      } else {
        // anonymous message — do not set user_id
        await pool.query(
          `INSERT INTO messages (room_id, content, image_url, timestamp)
           VALUES ($1, $2, $3, NOW())`,
          [roomId, text, imageUrl]
        );
      }

      // Prepare outgoing message — prefer DB username/color for logged in user
      const outUsername = dbUser ? dbUser.username : usernameFromClient;
      const outColor = dbUser ? dbUser.color : colorFromClient;

      const outMsg = {
        username: outUsername,
        color: outColor,
        text,
        imageUrl,
        time: new Date().toLocaleTimeString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        roomId
      };

      // If logged in user sent message and it's a private room, mark visited
      if (userId) {
        try {
          const roomRes = await pool.query("SELECT is_private FROM rooms WHERE id = $1 LIMIT 1", [roomId]);
          if (roomRes.rows.length && roomRes.rows[0].is_private) {
            await pool.query(`INSERT INTO user_private_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roomId]);
          }
        } catch (e) {
          console.error("Error marking private room visited:", e);
        }
      }

      io.to(roomId.toString()).emit("chat message", outMsg);
    } catch (err) {
      console.error("socket chat message error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// --------------------
// START
// --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));