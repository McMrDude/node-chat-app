// ----------------------
// public/script.js
// ----------------------

// Connect to server
const socket = io();

// Get HTML elements
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const usernameInput = document.getElementById("username");
const colorInput = document.getElementById("color");

// Helper function to add message to chat window
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

  messages.scrollTop = messages.scrollHeight; // auto scroll
}

// When the user submits the chat form
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim() || "Anonymous";
  const color = colorInput.value || "#000000";
  const text = input.value.trim();

  if (!text) return;

  const msgData = { username, color, text };

  // Send message to server
  socket.emit("chat message", msgData);

  // Clear input box
  input.value = "";
});

// Receive chat history when connecting
socket.on("chat history", (history) => {
  messages.innerHTML = ""; // clear current
  history.forEach((msg) => addMessageToDOM(msg));
});

// Receive new chat messages
socket.on("chat message", (msgData) => {
  addMessageToDOM(msgData);
});