const socket = io();

const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");
const joinBtn = document.getElementById("joinBtn");

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("roomId");
const invite = urlParams.get("invite");

if (!roomId && invite) {
  // resolve invite code to room id
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(invite)}`);
    if (res.ok) {
      const room = await res.json();
      roomId = room.id;
      // Optionally update the URL to ?roomId=... for clarity
      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } else {
      alert("Invalid invite code or room not found.");
    }
  } catch (e) {
    console.error(e);
    alert("Failed to resolve invite.");
  }
}

let joined = false;

function addMessageToDOM(msgData) {
  const li = document.createElement("li");
  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;
  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  name.style.color = msgData.color;
  const text = document.createElement("span");
  text.textContent = msgData.text;
  li.append(meta, name, text);
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

joinBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim() || "Anonymous";
  const color = colorInput.value || "#000000";
  if (!roomId) return alert("No room selected");
  socket.emit("join room", { roomId, username, color });
  joined = true;
  form.style.display = "flex";
});

socket.on("chat history", (history) => {
  messages.innerHTML = "";
  history.forEach(addMessageToDOM);
});

socket.on("chat message", addMessageToDOM);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!joined) return;
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat message", { text });
  input.value = "";
});