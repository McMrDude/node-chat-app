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
const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");

let attachedImageFile = null;
let currentUser = null;

document.getElementById("updateIdentity").addEventListener("click", async () => {
  const newName = document.getElementById("username").value.trim();
  const newColor = document.getElementById("color").value;

  if (!newName) return alert("Please enter a name");

  // Always save locally
  localStorage.setItem("username", newName);
  localStorage.setItem("color", newColor);

  // Try to update account if looged in
  try {
    const res = await fetch("/api/update-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newName, color: newColor }),
    });
    const data = await res.json();
    if (data.success) {
      console.log("Identity updated in DB");
    } else {
      console.log("Local update only (not logged in)");
    }
  } catch (err) {
    console.error("Identity update failed", err);
  }

  alert("Name and color updated!");
})

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

// When you click +, open file picker
uploadBtn.addEventListener("click", () => imageInput.click());

// When a file is chosen
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Please select an image file.");
  attachedImageFile = file;
  alert(`Attached: ${file.name}`);
});

input.addEventListener("paste", async (event) => {
  const items = event.clipboardData.items;

  for (let item of items) {
    if (item.type.startsWith("image/")) {
      // User pasted an actual image file
      attachedImageFile = item.getAsFile();
      alert(`Attached image from clipboard.`);
      return;
    }
  }

  // If they pasted text that looks like an image link
  const text = event.clipboardData.getData("text");
  if (text.match(/\.(jpeg|jpg|png|gif|webp)$/i)) {
    // Send message with image link direclty
    socket.emit("chat message", {
      username: usernameInput.value.trim() || "Anonymous",
      color: colorInput.value,
      text: "",
      imageUrl: text,
      roomId,
      user_id: currentUser ? currentUser.id : null
    });
  }
});

function addMessageToDOM(msgData) {
  const li = document.createElement("li");

  // Timestamp
  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;


  // Username
  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  const userColor = msgData.color || "#000000";
  name.style.color = userColor;

  // Calculate brightness of user color (0–255)
  const brightness = getBrightness(userColor);

  // Choose shadow color based on brightness
  const shadowColor = brightness > 90 ? "rgba(0, 0, 0, 1)" : "rgba(255, 255, 255, 1)";
  name.style.textShadow = `0 0 2px ${shadowColor}, 0 0 2px ${shadowColor}`;

  // Message text (always white in your dark theme)
  const text = document.createElement("span");
  text.textContent = msgData.text || msgData.content || msgData;
  text.style.color = "white";
  text.style.textShadow = "0 0 2px rgba(0,0,0,0.8)";

  // Append text elements
  li.append(meta, name, text);

  // If message contains an image
  if (msgData.imageUrl) {
    const img = document.createElement("img");
    img.src = msgData.imageUrl;
    img.alt = "semt image";
    img.loading = "lazy";
    img.style.display = "block";
    img.style.maxWidth = "250px";
    img.style.borderRadius = "8px";
    img.style.marginTop = "6px";
    img.style.boxShadow = "0 0 4px rgb(0,0,0,0.5";
    li.appendChild(img);
  }

  // Append to message list
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text && !attachedImageFile) return;

      let imageUrl = null;

      // If there’s an attached file, upload it first
      if (attachedImageFile) {
        try {
          const formData = new FormData();
          formData.append('image', attachedImageFile);

          const uploadResp = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });

          const uploadData = await uploadResp.json();
          if (!uploadData.success || !uploadData.url) {
            console.error("Upload failed:", uploadData);
            alert("Image upload failed. Try a smaller image or different file.");
            // clear attachment so it doesn't block next messages
            attachedImageFile = null;
            imageInput.value = '';
          } else {
            imageUrl = uploadData.url;
            attachedImageFile = null;
            imageInput.value = '';
          }
        } catch (err) {
          console.error("Upload error:", err);
          alert("Image upload error.");
          attachedImageFile = null;
          imageInput.value = '';
        }
      }

      socket.emit('chat message', {
        username: usernameInput.value.trim() || (currentUser ? currentUser.username : 'Anonymous'),
        color: colorInput.value || (currentUser ? currentUser.color : '#000000'),
        text,
        imageUrl,
        roomId,
        user_id: currentUser ? currentUser.id : null
      });

      input.value = '';
    });
  }
})();

// --- Delete Room Button ---
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
if (deleteRoomBtn) {
  deleteRoomBtn.addEventListener("click", async () => {
    if (!roomId) return alert("No room specified.");
    const confirmDelete = confirm("Are you sure you want to delete this room?");
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        alert("Room deleted successfully!");
        window.location.href = "/"; // back to homepage
      } else {
        alert("Failed to delete room: " + (data.error || "unknown error"));
      }
    } catch (err) {
      console.error("Delete room failed:", err);
      alert("Error deleting room.");
    }
  });
}
