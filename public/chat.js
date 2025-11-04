// public/chat.js
const socket = io();

// parse URL params
const params = new URLSearchParams(window.location.search);
let roomId = params.get("roomId");
const invite = params.get("invite");

const roomTitle = document.getElementById("roomTitle");
const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");
const messagesUL = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");

async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      if (!data.success || !data.room) {
        alert("Invalid invite link or room not found.");
        window.location.href = "/";
        return;
      }
      roomId = data.room.id;
      // update URL for clarity
      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } catch (err) {
      console.error("Failed to resolve invite:", err);
      alert("Failed to resolve invite.");
      window.location.href = "/";
    }
  }
}

function addMessageToDOM(msgData) {
  const li = document.createElement("li");

  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;

  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  name.style.color = msgData.color || "#000000";

  const text = document.createElement("span");
  text.textContent = msgData.text || msgData.content || msgData;

  li.append(meta, name, text);
  messagesUL.appendChild(li);
  messagesUL.scrollTop = messagesUL.scrollHeight;
}

async function loadHistory() {
  try {
    const res = await fetch(`/api/messages/${roomId}`);
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load history", data);
      return;
    }
    messagesUL.innerHTML = "";
    data.messages.forEach((m) => {
      addMessageToDOM({
        username: m.username,
        color: m.color,
        text: m.text,
        time: m.time
      });
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

// join and wire up socket
(async function init() {
  await resolveInviteIfNeeded();

  if (!roomId) {
    alert("No room specified");
    window.location.href = "/";
    return;
  }

  roomTitle.textContent = `Chat Room #${roomId}`;

  // load history from server
  await loadHistory();

  // join socket room
  socket.emit("joinRoom", roomId);

  // receive messages from server
  socket.on("chat message", (msg) => {
    // if the message came from ourselves, we already added it locally on send;
    // but it's fine to show again (no dedupe)
    addMessageToDOM(msg);
  });

  // form submit -> send message
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim() || "Anonymous";
    const color = colorInput.value || "#000000";
    const text = input.value.trim();
    if (!text) return;

    const payload = {
      username,
      color,
      text,
      roomId
    };

    // send to server - server will save and broadcast
    socket.emit("chat message", payload);

    // optimistic UI: add message immediately
    const now = new Date();
    addMessageToDOM({
      username,
      color,
      text,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });

    input.value = "";
  });
})();