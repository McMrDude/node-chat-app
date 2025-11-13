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

// --- Identity update ---
document.getElementById("updateIdentity").addEventListener("click", async () => {
  const newName = usernameInput.value.trim();
  const newColor = colorInput.value;

  if (!newName) return alert("Please enter a name");

  localStorage.setItem("username", newName);
  localStorage.setItem("color", newColor);

  try {
    const res = await fetch("/api/update-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newName, color: newColor }),
    });
    const data = await res.json();
    if (data.success) console.log("Identity updated in DB");
  } catch (err) {
    console.log("Local update only (not logged in)");
  }

  alert("Name and color updated!");
});

// --- Fetch current user ---
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
  } catch {
    currentUser = null;
  }
}

// --- Resolve invite links ---
async function resolveInviteIfNeeded() {
  if (!roomId && invite) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(invite)}`);
      const data = await res.json();
      if (!data.success || !data.room) throw new Error("Room not found");
      roomId = data.room.id;

      await fetchMe();

      if (currentUser) {
        if (data.visitedPrivateRooms) {
          currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
        } else {
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
        } catch (e) { console.error(e); }
      }

      window.history.replaceState({}, "", `/chat.html?roomId=${roomId}`);
    } catch (err) {
      console.error("Failed to resolve invite:", err);
      alert("Invalid invite link.");
      window.location.href = "/";
    }
  }
}

// --- Attach image file ---
uploadBtn.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Please select an image file.");
  attachedImageFile = file;
  alert(`Attached: ${file.name}`);
});

// --- Paste handling ---
input.addEventListener("paste", async (event) => {
  const items = event.clipboardData.items;
  for (let item of items) {
    if (item.type.startsWith("image/")) {
      attachedImageFile = item.getAsFile();
      alert("Attached image from clipboard.");
      return;
    }
  }

  const text = event.clipboardData.getData("text");
  if (text.match(/\.(jpeg|jpg|png|gif|webp)$/i)) {
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

// --- Add message to DOM ---
function addMessageToDOM(msgData) {
  const li = document.createElement("li");

  const meta = document.createElement("span");
  meta.textContent = `[${msgData.time}] `;

  const name = document.createElement("strong");
  name.textContent = msgData.username + ": ";
  const userColor = msgData.color || "#000000";
  name.style.color = userColor;
  const brightness = getBrightness(userColor);
  const shadowColor = brightness > 90 ? "rgba(0, 0, 0, 1)" : "rgba(255, 255, 255, 1)";
  name.style.textShadow = `0 0 2px ${shadowColor}, 0 0 2px ${shadowColor}`;

  const text = document.createElement("span");
  text.textContent = msgData.text || msgData.content || "";
  text.style.color = "white";
  text.style.textShadow = "0 0 2px rgba(0,0,0,0.8)";

  li.append(meta, name, text);

  if (msgData.imageUrl) {
    const img = document.createElement("img");
    img.src = msgData.imageUrl;
    img.alt = "sent image";
    img.loading = "lazy";
    img.style.display = "block";
    img.style.maxWidth = "250px";
    img.style.borderRadius = "8px";
    img.style.marginTop = "6px";
    img.style.marginLeft = "170px";
    img.style.boxShadow = "0 0 4px rgba(0,0,0,0.5)";
    li.appendChild(img);
  }

  messagesUL.appendChild(li);
  messagesUL.scrollTop = messagesUL.scrollHeight;
}

function getBrightness(hexColor) {
  const c = hexColor.replace("#", "");
  const fullHex = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// --- Load message history ---
async function loadHistory() {
  try {
    const res = await fetch(`/api/messages/${roomId}`);
    const data = await res.json();
    if (!data.success) return;
    messagesUL.innerHTML = "";
    data.messages.forEach(addMessageToDOM);
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

// --- Load room info ---
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
      document.getElementById("copyInviteBtn").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(inviteLink); alert("Invite link copied!"); }
        catch { alert("Failed to copy."); }
      });
    }
  } catch (err) {
    console.error("Could not load room name:", err);
  }
}

// --- Main init ---
(async function init() {
  await resolveInviteIfNeeded();
  if (!roomId) { alert("No room specified"); window.location.href = "/"; return; }
  await fetchMe();
  await loadRoomName();
  await loadHistory();

  socket.emit("joinRoom", roomId);

  socket.on("chat message", addMessageToDOM);

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

          const uploadResp = await fetch("/api/upload", { method: "POST", body: formData });
          const uploadData = await uploadResp.json();

          if (!uploadData.success || !uploadData.url) {
            alert("Image upload failed.");
          } else {
            imageUrl = uploadData.url;
          }
        } catch (err) {
          console.error(err);
          alert("Image upload error.");
        }
        attachedImageFile = null;
        imageInput.value = "";
      }

      socket.emit("chat message", {
        username: usernameInput.value.trim() || (currentUser ? currentUser.username : "Anonymous"),
        color: colorInput.value || (currentUser ? currentUser.color : "#000000"),
        text,
        imageUrl,
        roomId,
        user_id: currentUser ? currentUser.id : null
      });

      input.value = "";
    });
  }
})();

// --- Delete room ---
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
if (deleteRoomBtn) {
  deleteRoomBtn.addEventListener("click", async () => {
    if (!roomId) return alert("No room specified.");
    if (!confirm("Are you sure you want to delete this room?")) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { alert("Room deleted!"); window.location.href = "/"; }
      else alert("Failed to delete room: " + (data.error || "unknown error"));
    } catch (err) { console.error(err); alert("Error deleting room."); }
  });
}