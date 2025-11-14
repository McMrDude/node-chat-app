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

// update-identity button exists in your HTML
const updateIdentityBtn = document.getElementById("updateIdentity");

// helper: fetch current logged in user (non-fatal)
async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      // prefill fields
      if (currentUser.username && usernameInput) usernameInput.value = currentUser.username;
      if (currentUser.color && colorInput) colorInput.value = currentUser.color;
    } else {
      currentUser = null;
      // fallback to localStorage if present
      const localName = localStorage.getItem("username");
      const localColor = localStorage.getItem("color");
      if (localName && usernameInput) usernameInput.value = localName;
      if (localColor && colorInput) colorInput.value = localColor;
    }
  } catch (err) {
    currentUser = null;
    const localName = localStorage.getItem("username");
    const localColor = localStorage.getItem("color");
    if (localName && usernameInput) usernameInput.value = localName;
    if (localColor && colorInput) colorInput.value = localColor;
  }
}

// Update identity button
if (updateIdentityBtn) {
  updateIdentityBtn.addEventListener("click", async () => {
    const newName = (usernameInput && usernameInput.value.trim()) || "";
    const newColor = (colorInput && colorInput.value) || "#000000";
    if (!newName) return alert("Please enter a name");

    // Save locally always
    localStorage.setItem("username", newName);
    localStorage.setItem("color", newColor);

    // Try to update server-side account if logged in
    try {
      const res = await fetch("/api/update-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newName, color: newColor })
      });
      const data = await res.json();
      if (data.success) {
        console.log("Identity updated on server");
        // refresh currentUser so messages use server-side name/color going forward
        await fetchMe();
      } else {
        console.log("Not logged in; saved locally only");
      }
    } catch (err) {
      console.error("Identity update failed", err);
    }

    alert("Name and color updated!");
  });
}

// Resolve invite param (if used)
async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      if (!data.success || !data.room) throw new Error("Room not found");
      roomId = data.room.id;

      // If logged in, server already added visited; if not logged in, store locally
      await fetchMe();
      if (currentUser) {
        if (data.visitedPrivateRooms) {
          currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
        } else {
          // best-effort write to server
          fetch("/api/users/visit-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId })
          }).catch(() => {});
        }
      } else {
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

      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } catch (err) {
      console.error("Failed to resolve invite:", err);
      alert("Invalid invite link.");
      window.location.href = "/";
    }
  }
}

// image attach flow
if (uploadBtn && imageInput) {
  uploadBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please select an image file.");
    attachedImageFile = file;
    alert(`Attached: ${file.name}`);
  });
}

// paste handling (image or link)
input.addEventListener("paste", (event) => {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (let item of items) {
    if (item.type && item.type.startsWith("image/")) {
      attachedImageFile = item.getAsFile();
      alert("Attached image from clipboard.");
      event.preventDefault();
      return;
    }
  }
  // if pasted text looks like an image URL, auto-send it (or attach it as imageUrl)
  const text = event.clipboardData.getData("text");
  if (text && text.match(/\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i)) {
    // send immediately as image-only message
    socket.emit("chat message", {
      username: (usernameInput && usernameInput.value.trim()) || (currentUser ? currentUser.username : "Anonymous"),
      color: (colorInput && colorInput.value) || (currentUser ? currentUser.color : "#000000"),
      text: "",
      imageUrl: text,
      roomId,
      user_id: currentUser ? currentUser.id : null
    });
    event.preventDefault();
  }
});

// add message DOM
function addMessageToDOM(msgData) {
  const li = document.createElement("li");

  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;

  const name = document.createElement("strong");
  name.textContent = (msgData.username || "Anonymous") + ": ";
  const userColor = msgData.color || "#000000";
  name.style.color = userColor;

  // dynamic shadow for username based on brightness
  const brightness = getBrightness(userColor);
  const shadowColor = brightness > 100 ? "rgba(0,0,0,0.95)" : "rgba(255,255,255,1)";
  name.style.textShadow = `0 0 2px ${shadowColor}`;

  const text = document.createElement("span");
  text.textContent = msgData.text || "";
  text.style.color = "white";
  text.style.textShadow = "0 0 2px rgba(0,0,0,0.8)";

  li.append(meta, name, text);

  if (msgData.imageUrl) {
    const img = document.createElement("img");
    img.src = msgData.imageUrl;
    img.alt = "sent image";
    img.loading = "lazy";
    img.style.display = "block";
    img.style.maxWidth = "320px";
    img.style.borderRadius = "8px";
    img.style.marginTop = "6px";
    img.style.marginLeft = "270px";
    img.style.boxShadow = "0 4px 12px rgba(0,0,0,0.6)";
    li.appendChild(img);
  }

  messagesUL.appendChild(li);
  messagesUL.scrollTop = messagesUL.scrollHeight;
}

function getBrightness(hexColor) {
  try {
    const c = (hexColor || "#000000").replace("#", "");
    const fullHex = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  } catch (e) {
    return 0;
  }
}

// load history
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

// load room name / invite link UI
async function loadRoomName() {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) return;
    roomTitle.textContent = data.room.name;
    const container = document.getElementById("inviteLinkContainer");
    if (container && data.room.is_private && data.room.invite_code) {
      const inviteLink = `${window.location.origin}/chat.html?invite=${encodeURIComponent(data.room.invite_code)}`;
      container.innerHTML = `
        <strong>Invite Link:</strong>
        <input type="text" value="${inviteLink}" readonly style="width:60%">
        <button id="copyInviteBtn">Copy</button>
      `;
      const copyBtn = document.getElementById("copyInviteBtn");
      if (copyBtn) copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(inviteLink);
          alert("Invite link copied!");
        } catch {
          alert("Failed to copy. Try manually selecting the text.");
        }
      });
    }
  } catch (err) {
    console.error("Could not load room name:", err);
  }
}

// init
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
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text && !attachedImageFile) return;

      let imageUrl = null;

      if (attachedImageFile) {
        try {
          const formData = new FormData();
          formData.append("image", attachedImageFile);
          const resp = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await resp.json();
          if (!data.success || !data.url) {
            console.error("Upload failed:", data);
            alert("Image upload failed. Try smaller file or different image.");
            attachedImageFile = null;
            imageInput.value = "";
            return;
          }
          imageUrl = data.url;
          attachedImageFile = null;
          imageInput.value = "";
        } catch (err) {
          console.error("Upload error:", err);
          alert("Image upload error.");
          attachedImageFile = null;
          imageInput.value = "";
          return;
        }
      }

      const usernameToSend = (usernameInput && usernameInput.value.trim()) || (currentUser ? currentUser.username : "Anonymous");
      const colorToSend = (colorInput && colorInput.value) || (currentUser ? currentUser.color : "#000000");

      socket.emit("chat message", {
        username: usernameToSend,
        color: colorToSend,
        text,
        imageUrl,
        roomId,
        user_id: currentUser ? currentUser.id : null
      });

      input.value = "";
    });
  }
})();

// delete room button behavior (you already had it)
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
if (deleteRoomBtn) {
  deleteRoomBtn.addEventListener("click", async () => {
    if (!roomId) return alert("No room specified.");
    const ok = confirm("Are you sure you want to delete this room?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert("Room deleted successfully!");
        window.location.href = "/";
      } else {
        alert("Failed to delete room: " + (data.error || "unknown"));
      }
    } catch (err) {
      console.error("Delete room failed:", err);
      alert("Error deleting room.");
    }
  });
}