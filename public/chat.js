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
const deleteBtn = document.getElementById('deleteRoomBtn');

deleteBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete this room?')) return;
  try {
    const res = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert('Room deleted.');
      window.location.href = '/'; // redirect to index
    } else {
      alert('Could not delete room.');
    }
  } catch (err) {
    console.error(err);
    alert('Error deleting room.');
  }
});

async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();

      let resolvedId = null;

      if (!data.id) {
        resolvedId = data.id;
      } else if ( data.room && data.room.id) {
        resolvedId = data.room.id;
      }

      if (!resolvedId) {
        alert("Invalid invite link or room not found.");
        window.location.href = "/";
        return;
      }

      roomId = resolvedId;
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

  // load room name first
  await loadRoomName();

  // load message history
  await loadHistory();

  // join socket room
  socket.emit("joinRoom", roomId);

  // receive messages from server
  socket.on("chat message", (msg) => {
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

    input.value = "";
  });
})();

async function loadRoomName() {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    
    if (data.name) {
      roomTitle.textContent = data.name;
    } else if (data.room && data.room.name) {
      roomTitle.textContent = data.room.name;
    } else {
      roomTitle.textContent = `Chat Room #${roomId}`;
    }
  } catch (err) {
    console.error("Could not load room name: ", err);
    roomTitle.textContent = `Chat Room #${roomId}`;
  }
}

// Load saved user settings from localStorage
const savedUsername = localStorage.getItem("username");
const savedColor = localStorage.getItem("color");

if (savedUsername) usernameInput.value = savedUsername;
if (savedColor) colorInput.value = savedColor;

// Save settings when they change
usernameInput.addEventListener("input", () => {
  localStorage.setItem("username", usernameInput.value);
});
colorInput.addEventListener("input", () => {
  localStorage.setItem("color", colorInput.value);
});
