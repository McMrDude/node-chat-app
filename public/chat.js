const socket = io();
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("roomId");
const invite = urlParams.get("invite");

const roomTitle = document.getElementById("roomTitle");
const messages = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");

// Helper to add a message to the DOM
function addMessage(msgData) {
  const li = document.createElement("li");

  const meta = document.createElement("span");
  meta.textContent = `[${msgData.timestamp}] `;

  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  name.style.color = msgData.color;

  const text = document.createElement("span");
  text.textContent = msgData.text;

  li.append(meta, name, text);
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

// If invite code exists, resolve to roomId
(async function () {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(invite)}`);
      const room = await res.json();
      roomId = room.id;
      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to resolve invite code.");
    }
  }

  if (!roomId) {
    alert("No roomId or invite code provided");
    return;
  }

  roomTitle.textContent = `Chat Room #${roomId}`;
  const username = usernameInput.value || "Anonymous";
  const color = colorInput.value || "#000000";

  socket.emit("joinRoom", { roomId, username, color });

  socket.on("chat history", (history) => {
    messages.innerHTML = "";
    history.forEach(addMessage);
  });

  socket.on("chat message", addMessage);

  // Form submission
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim() || "Anonymous";
    const color = colorInput.value || "#000000";
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chat message", { roomId, username, color, text });
    input.value = "";
  });
})();