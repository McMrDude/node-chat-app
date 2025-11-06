// public/rooms.js
const roomsDiv = document.getElementById('rooms');
const paginationDiv = document.getElementById('pagination');
const roomNameInput = document.getElementById('roomName');
const isPrivateInput = document.getElementById('isPrivate');
const createBtn = document.getElementById('createBtn');

let currentPage = 1;
let totalPages = 1;
let currentUser = null; // {id, username, color, visitedPrivateRooms}

// Fetch current logged-in user
async function fetchMe() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
    } else {
      currentUser = null;
    }
  } catch (err) {
    currentUser = null;
  }
}

// Load public rooms with pagination
async function loadRooms(page = 1) {
  currentPage = page;
  try {
    const res = await fetch(`/api/rooms?page=${page}`);
    const data = await res.json();

    roomsDiv.innerHTML = '';
    if (!data.success || !Array.isArray(data.rooms) || data.rooms.length === 0) {
      roomsDiv.textContent = 'No public rooms yet. Create one above!';
    } else {
      data.rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room';
        div.textContent = room.name;
        div.onclick = () => visitRoom(room.id);
        roomsDiv.appendChild(div);
      });
    }

    totalPages = data.totalPages || 1;
    currentPage = data.currentPage || 1;
    renderPagination();
  } catch (err) {
    console.error('Error loading rooms:', err);
    roomsDiv.textContent = 'Error loading rooms.';
  }
}

// Pagination rendering
function renderPagination() {
  paginationDiv.innerHTML = '';
  if (totalPages <= 1) return;

  const makeBtn = (text, page) => {
    const span = document.createElement('span');
    span.className = 'page-btn';
    span.textContent = text;
    span.onclick = () => loadRooms(page);
    return span;
  };

  if (currentPage > 1) paginationDiv.appendChild(makeBtn('<<', 1));
  if (currentPage > 1) paginationDiv.appendChild(makeBtn('<', currentPage - 1));

  const start = Math.max(1, currentPage - 3);
  const end = Math.min(totalPages, currentPage + 3);
  for (let i = start; i <= end; i++) {
    const p = document.createElement('span');
    p.className = 'page-btn';
    p.textContent = i;
    if (i === currentPage) p.style.fontWeight = 'bold';
    p.onclick = () => loadRooms(i);
    paginationDiv.appendChild(p);
  }

  if (currentPage < totalPages) paginationDiv.appendChild(makeBtn('>', currentPage + 1));
  if (currentPage < totalPages) paginationDiv.appendChild(makeBtn('>>', totalPages));
}

// Create room
createBtn.addEventListener('click', async () => {
  const name = roomNameInput.value.trim();
  const isPrivate = isPrivateInput.checked;

  if (!name) return alert('Please enter a room name');

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_private: isPrivate }),
    });
    const room = await res.json();
    if (!room || !room.success) return alert('Could not create room.');

    if (room.is_private) {
      const inviteLink = `${window.location.origin}/chat.html?invite=${encodeURIComponent(room.invite_code)}`;
      showInviteModal(inviteLink);
    } else {
      window.location.href = `/chat.html?roomId=${room.id}`;
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Could not create room.');
  }
});

// Show invite modal for private rooms
function showInviteModal(inviteLink) {
  const modal = document.createElement('div');
  modal.className = 'invite-modal';
  modal.innerHTML = `
    <h3>Private Room Created</h3>
    <p>Share this link:</p>
    <input id="inviteLinkInput" type="text" readonly value="${inviteLink}">
    <div style="display:flex; gap:8px;">
      <button id="copyBtn">Copy Link</button>
      <button id="closeBtn">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('copyBtn').addEventListener('click', async () => {
    const input = document.getElementById('inviteLinkInput');
    try {
      await navigator.clipboard.writeText(input.value);
      alert('Link copied!');
    } catch {
      input.select();
      document.execCommand('copy');
      alert('Link copied (fallback)');
    }
  });

  document.getElementById('closeBtn').addEventListener('click', () => {
    modal.remove();
    loadRooms(currentPage);
  });
}

// Visit room (handles private room sidebar update)
async function visitRoom(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) return;

    // 1️⃣ If logged in, update server-side
    if (currentUser) {
      if (data.visitedPrivateRooms) {
        currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
        loadVisitedPrivateRooms();
      }
    } else {
      // 2️⃣ Anonymous user → store locally
      let localVisited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
      if (!localVisited.includes(roomId)) {
        localVisited.push(roomId);
        localStorage.setItem("visitedPrivateRooms", JSON.stringify(localVisited));
      }
      loadVisitedPrivateRooms(); // redraw sidebar
    }

    // Go to the chat page
    window.location.href = `/chat.html?roomId=${roomId}`;
  } catch (err) {
    console.error('Error visiting room:', err);
  }
}

// Render visited private rooms sidebar
async function loadVisitedPrivateRooms() {
  const sidebar = document.getElementById("privateSidebar") || createSidebar();
  sidebar.innerHTML = "<h3>My Private Rooms</h3>";

  let visitedRooms = [];
  if (currentUser && Array.isArray(currentUser.visitedPrivateRooms)) {
    visitedRooms = currentUser.visitedPrivateRooms;
  } else {
    // anonymous users → get from localStorage
    visitedRooms = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
  }

  if (!visitedRooms.length) {
    const p = document.createElement("div");
    p.textContent = "No private rooms yet (visit a private room once to save it).";
    sidebar.appendChild(p);
    return;
  }

  for (const rid of visitedRooms) {
    try {
      const rres = await fetch(`/api/rooms/${rid}`);
      const rdata = await rres.json();
      if (!rdata.success || !rdata.room) continue;
      const d = document.createElement("div");
      d.textContent = rdata.room.name;
      d.style.cursor = "pointer";
      d.style.padding = "6px";
      d.style.border = "1px solid #ddd";
      d.style.marginBottom = "6px";
      d.onclick = () => window.location.href = `/chat.html?roomId=${rid}`;
      sidebar.appendChild(d);
    } catch (e) {
      // ignore
    }
  }
}

// Initial load
(async function init() {
  await fetchMe();
  await loadRooms(1);
  loadVisitedPrivateRooms();
})();