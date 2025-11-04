// public/chat.js

const socket = io();
const params = new URLSearchParams(window.location.search);
const roomId = params.get('roomId');

if (!roomId) {
  alert("No room specified.");
  window.location.href = '/';
}

const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

// Join room on load
socket.emit("joinRoom", roomId);

// Helper to add message to chat
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

// Handle message form submission
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim() || "Anonymous";
  const color = colorInput.value || "#000000";
  const text = input.value.trim();

  if (!text) return;

  const now = new Date();
  const msgData = {
    username,
    color,
    text,
    roomId,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  socket.emit("chat message", msgData); // Send to server

  input.value = ""; // Clear input box
  addMessageToDOM(msgData); // Add to self view
});

// Receive messages from server
socket.on("chat message", (msgData) => {
  addMessageToDOM(msgData);
});