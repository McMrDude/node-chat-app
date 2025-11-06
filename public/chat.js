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

// Fetch current user
async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      if (currentUser.username) usernameInput.value = currentUser.username;
      if (currentUser.color) colorInput.value = currentUser.color;
    }
  } catch { currentUser = null; }
}

// Handle invite link visits
async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      if (!data.success || !data.room) throw new Error("Room not found");
      roomId = data.room.id;

      await fetchMe();

      // Save visited private room if logged in
      if (currentUser) {
        await fetch("/api/users/visit-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId })
        });
      }

      if (data.visitedPrivateRooms) currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } catch (err) {
      console.error("Failed to resolve invite:", err);
      alert("Invalid invite link.");
      window.location.href = "/";
    }
  }
}

// Refresh user info (updates visited rooms)
async function refreshUser() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.success) currentUser = data.user;
  } catch (err) { console.error(err); }
}

// Add message to DOM
function addMessageToDOM(msgData) {
  const li = document.createElement("li");
  li.innerHTML = `<span>[${msgData.time}] </span>
                  <strong style="color:${msgData.color}">${msgData.username}:</strong>
                  <span>${msgData.text}</span>`;
  messagesUL.appendChild(li);
  messagesUL.scrollTop = messagesUL.scrollHeight;
}

// Load room message history
async function loadHistory() {
  try {
    const res = await fetch(`/api/messages/${roomId}`);
    const data = await res.json();
    if (!data.success) return;
    messagesUL.innerHTML = '';
    data.messages.forEach(addMessageToDOM);
  } catch (err) { console.error(err); }
}

// Load room name
async function loadRoomName() {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) return;
    roomTitle.textContent = data.room.name;
  } catch (err) { console.error(err); }
}

// Main init
(async function init() {
  await resolveInviteIfNeeded();
  if (!roomId) return window.location.href = "/";

  await fetchMe();
  await loadRoomName();
  await loadHistory();

  socket.emit("joinRoom", roomId);

  socket.on("chat message", addMessageToDOM);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim() || (currentUser ? currentUser.username : "Anonymous");
    const color = colorInput.value || (currentUser ? currentUser.color : "#000000");
    const text = input.value.trim();
    if (!text) return;

    socket.emit("chat message", { username, color, text, roomId, user_id: currentUser ? currentUser.id : null });
    input.value = "";
  });
})();
