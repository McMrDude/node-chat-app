const socket = io();

// Extract roomId from URL params
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

// Ask for username and color
const username = prompt("Enter your username:");
const color = prompt("Pick a color for your name (e.g., red, blue):") || "black";

// Join selected room
socket.emit("joinRoom", roomId);

// Load previous messages
async function loadMessages() {
  const response = await fetch(`/api/messages/${roomId}`);
  const data = await response.json();

  if (data.success) {
    data.messages.forEach((msg) => displayMessage(msg));
  }
}

// Display a message in chat
function displayMessage(msg) {
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.innerHTML = `<strong style="color:${msg.color}">${msg.username}:</strong> ${msg.content}`;
  chatBox.appendChild(div);
}

// Send message on form submit
document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const message = document.getElementById("message").value;
  if (message.trim() !== "") {
    socket.emit("chatMessage", {
      user_id: null, // replace with real user id once auth is added
      room_id: roomId,
      content: message,
      username,
      color,
    });
    document.getElementById("message").value = "";
  }
});

// Listen for incoming messages
socket.on("message", (msg) => {
  displayMessage(msg);
});

// Load messages on page load
loadMessages();