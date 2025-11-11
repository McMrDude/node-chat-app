// public/chat.js
const socket = io();
const params = new URLSearchParams(window.location.search);
let roomId = params.get("roomId");
const invite = params.get("invite");

const roomTitle = document.getElementById("roomTitle");
const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");
const messagesUL = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");

let currentUser = null;

// Fetch current user if logged in (non-fatal)
async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      if (currentUser.username && usernameInput) usernameInput.value = currentUser.username;
      if (currentUser.color && colorInput) colorInput.value = currentUser.color;
    } else {
      currentUser = null;
    }
  } catch (err) {
    currentUser = null;
  }
}

// If the page was opened via an invite param, resolve it
async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      if (!data.success || !data.room) throw new Error("Room not found");
      roomId = data.room.id;

      // Try to get current user (non-fatal)
      await fetchMe();

      if (currentUser) {
        // If logged in, server already inserted visited room via /api/rooms/:id route and returned visitedPrivateRooms
        if (data.visitedPrivateRooms) {
          currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
        } else {
          // fallback: ensure server has record (fire-and-forget)
          fetch("/api/users/visit-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId })
          }).catch(() => {});
        }
      } else {
        // anonymous: save locally
        try {
          const arr = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
          if (!arr.includes(roomId)) {
            arr.push(roomId);
            localStorage.setItem("visitedPrivateRooms", JSON.stringify(arr));
          }
        } catch (e) {
          console.error("localStorage write error (invite):", e);
        }
      }

      // Update URL and continue
      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);

      // If you have a sidebar on chat page that uses loadVisitedPrivateRooms from rooms.js,
      // it will use localStorage if currentUser is null.
    } catch (err) {
      console.error("Failed to resolve invite:", err);
      alert("Invalid invite link.");
      window.location.href = "/";
    }
  }
}

function addMessageToDOM(msgData) {
  const li = document.createElement("li");
  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;

  // Username element
  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  const userColor = msgData.color || "#000000";
  name.style.color = userColor;

  // Calculate brightness of user color (0–255)
  const brightness = getBrightness(userColor);

  // Choose shadow color based on brightness
  const shadowColor = brightness > 90 ? "rgba(0, 0, 0, 1)" : "rgba(169, 169, 169, 1)";
  name.style.textShadow = `0 0 4px ${shadowColor}, 0 0 8px ${shadowColor}`;

  // Message text (always white in your dark theme)
  const text = document.createElement("span");
  text.textContent = msgData.text || msgData.content || msgData;
  text.style.color = "white";
  text.style.textShadow = "0 0 4px rgba(0,0,0,0.8)";

  li.append(meta, name, text);
  messagesUL.appendChild(li);
  messagesUL.scrollTop = messagesUL.scrollHeight;
}

// Utility: get brightness (approximation)
function getBrightness(hexColor) {
  // Normalize 3- or 6-digit hex (#fff or #ffffff)
  const c = hexColor.replace("#", "");
  const fullHex = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);
  // Perceived brightness formula
  return (r * 299 + g * 587 + b * 114) / 1000;
}

async function loadHistory() {
  try {
    const res = await fetch(`/api/messages/${roomId}`);
    const data = await res.json();
    if (!data.success) return;
    messagesUL.innerHTML = "";
    data.messages.forEach(m => addMessageToDOM(m));
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

async function loadRoomName() {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) return;
    roomTitle.textContent = data.room.name;
    // show invite link UI if the element exists
    const container = document.getElementById('inviteLinkContainer');
    if (container && data.room.is_private && data.room.invite_code) {
      const inviteLink = `${window.location.origin}/chat.html?invite=${encodeURIComponent(data.room.invite_code)}`;
      container.innerHTML = `
        <strong>Invite Link:</strong>
        <input type="text" value="${inviteLink}" readonly style="width:60%">
        <button id="copyInviteBtn">Copy</button>
      `;
      const copyBtn = document.getElementById('copyInviteBtn');
      if (copyBtn) copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(inviteLink);
          alert('Invite link copied!');
        } catch {
          alert('Failed to copy. Try manually selecting the text.');
        }
      });
    }
  } catch (err) {
    console.error('Could not load room name:', err);
  }
}

// Main init
(async function init() {
  await resolveInviteIfNeeded();
  if (!roomId) {
    alert("No room specified");
    window.location.href = "/";
    return;
  }

  // fetchMe is non-fatal, it just pre-fills username if user is logged in
  await fetchMe();

  await loadRoomName();
  await loadHistory();

  socket.emit("joinRoom", roomId);

  socket.on("chat message", (msg) => {
    addMessageToDOM(msg);
  });

  // submit handler: anonymous users can still type and send messages
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = (usernameInput && usernameInput.value.trim()) || (currentUser ? currentUser.username : "Anonymous");
      const color = (colorInput && colorInput.value) || (currentUser ? currentUser.color : "#000000");
      const text = input.value.trim();
      if (!text) return;

      socket.emit("chat message", {
        username,
        color,
        text,
        roomId,
        user_id: currentUser ? currentUser.id : null
      });

      input.value = "";
    });
  }
})();