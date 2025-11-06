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

let currentUser = null;

// helper to get current user
async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      // prefill username & color
      if (currentUser.username) usernameInput.value = currentUser.username;
      if (currentUser.color) colorInput.value = currentUser.color;
    } else {
      currentUser = null;
    }
  } catch (err) {
    currentUser = null;
  }
}

// delete handler
if (deleteBtn) {
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
}

async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      let resolvedId = null;
      if (data.id) resolvedId = data.id;
      else if (data.room && data.room.id) resolvedId = data.room.id;
      if (!resolvedId) {
        alert("Invalid invite link or room not found.");
        window.location.href = "/";
        return;
      }
      roomId = resolvedId;
      // if logged in, save visited private room server-side
      await fetchMe();
      if (currentUser) {
        try {
          await fetch("/api/users/visit-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId })
          });
        } catch (e) { /* ignore */ }
      }
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

    if (data.room.is_private && data.room.invite_code) {
      const inviteLink = `${window.location.origin}/chat.html?invite=${encodeURIComponent(data.room.invite_code)}`;
      const container = document.getElementById('inviteLinkContainer');
      container.innerHTML = `
        <strong>Invite Link:</strong>
        <input type="text" value="${inviteLink}" readonly style="width:60%">
        <button id="copyInviteBtn">Copy</button>
      `;
      document.getElementById('copyInviteBtn').addEventListener('click', async () => {
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

// main init
(async function init() {
  await resolveInviteIfNeeded();
  if (!roomId) {
    alert("No room specified");
    window.location.href = "/";
    return;
  }

  await fetchMe();
  await loadRoomName();
  await loadHistory();

  socket.emit("joinRoom", roomId);

  // receive messages
  socket.on("chat message", (msg) => {
    addMessageToDOM(msg);
  });

  // submit handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim() || (currentUser ? currentUser.username : "Anonymous");
    const color = colorInput.value || (currentUser ? currentUser.color : "#000000");
    const text = input.value.trim();
    if (!text) return;

    const payload = {
      username,
      color,
      text,
      roomId,
      user_id: currentUser ? currentUser.id : null
    };

    // send to server
    socket.emit("chat message", payload);
    input.value = "";
  });
})();