// public/rooms.js
const roomsDiv = document.getElementById('rooms');
const paginationDiv = document.getElementById('pagination');
const roomNameInput = document.getElementById('roomName');
const isPrivateInput = document.getElementById('isPrivate');
const createBtn = document.getElementById('createBtn');
const bar = document.getElementById("sidebar");
const btn = document.getElementById("toggleBar");
const createTab = document.getElementById("createTab");
const searchTab = document.getElementById("searchTab");
const createForm = document.getElementById("createForm");
const searchForm = document.getElementById("searchForm");
const search = document.getElementById("searchBar");

let allRooms = [];
let allRoomsLoaded = false;

btn.onclick = () => {
  bar.classList.toggle("open");
  btn.classList.toggle("open");
  btn.textContent = bar.classList.contains("open") ? "▲" : "▼";
};

createTab.onclick = () => {
  createTab.classList.add("open");
  searchTab.classList.remove("open");
  createForm.style.display = "flex";
  searchForm.style.display = "none";

  childElements = roomsDiv.children;
  childElementArray = Array.from(childElements);
  childElementArray[i].style.display = "inline";
};
searchTab.onclick = async () => {
  searchTab.classList.add("open");
  createTab.classList.remove("open");
  createForm.style.display = "none";
  searchForm.style.display = "flex";

  // Load ALL rooms once
  if (!allRoomsLoaded) {
    const res = await fetch("/api/rooms-all");
    const data = await res.json();
    if (data.success) {
      allRooms = data.rooms;
      allRoomsLoaded = true;
    }
  }

  renderSearchResults("");
};

async function tabCheck() {
  if (createForm.style.display !== "none") {
    createTab.classList.add("open");
    searchTab.classList.remove("open");
  };
  if (searchForm.style.display !== "none") {
    searchTab.classList.add("open");
    createTab.classList.remove("open");
  };
};
tabCheck();

searchForm.addEventListener("input", function () {
  renderSearchResults(search.value.toLowerCase());
});

function renderSearchResults(query) {
  roomsDiv.innerHTML = "";
  paginationDiv.innerHTML = ""; // hide pagination during search

  const results = allRooms.filter(r =>
    r.name.toLowerCase().startsWith(query)
  );

  if (results.length === 0) {
    roomsDiv.textContent = "No rooms found.";
    return;
  }

  results.forEach(room => {
    const div = document.createElement("div");
    div.className = "room";
    div.textContent = room.name;
    div.onclick = () => visitRoom(room.id);
    roomsDiv.appendChild(div);
  });
}

let currentPage = 1;
let totalPages = 1;
let currentUser = null; // will be {id, username, color, visitedPrivateRooms} or null

// Get authenticated user (server returns visitedPrivateRooms for logged-in users)
async function fetchMe() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.success) currentUser = data.user;
    else currentUser = null;
  } catch (err) {
    currentUser = null;
  }
}

async function loadRooms(page = 1) {
  currentPage = page;
  try {
    const res = await fetch(`/api/rooms?page=${page}`);
    const data = await res.json();

    roomsDiv.innerHTML = '';
    if (!data.success || !Array.isArray(data.rooms) || data.rooms.length === 0) {
      roomsDiv.textContent = 'No public rooms yet. Create one above!';
    } else {
      data.rooms.forEach((room) => {
        const div = document.createElement('div');
        div.id = 'publicRoom';
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

createBtn.addEventListener('click', async () => {
  const name = roomNameInput.value.trim();
  const isPrivate = isPrivateInput.checked;

  if (!name) {
    alert('Please enter a room name');
    return;
  }

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_private: isPrivate }),
    });
    const room = await res.json();
    if (!room || !room.success) {
      console.error("Create room failed response:", room);
      alert('Could not create room.');
      return;
    }

    if (room.is_private) {
      const inviteLink = `${window.location.origin}/chat.html?invite=${encodeURIComponent(room.invite_code)}`;
      showInviteModal(inviteLink);
      // If user is logged in, ensure the server saved it already (server side is handling it)
      // For anonymous users, we also save locally
      if (!currentUser) {
        addRoomToLocalVisited(room.id);
        loadVisitedPrivateRooms();
      }
    } else {
      window.location.href = `/chat.html?roomId=${room.id}`;
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Could not create room.');
  }
});

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
      alert('Link copied to clipboard');
    } catch (err) {
      input.select();
      document.execCommand('copy');
      alert('Link copied to clipboard (fallback)');
    }
  });

  document.getElementById('closeBtn').addEventListener('click', () => {
    modal.remove();
    loadRooms(currentPage);
  });
}

// Add a roomId to localStorage visited list (anonymous users)
function addRoomToLocalVisited(roomId) {
  try {
    const arr = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
    if (!arr.includes(roomId)) {
      arr.push(roomId);
      localStorage.setItem("visitedPrivateRooms", JSON.stringify(arr));
    }
  } catch (e) {
    console.error("localStorage write error:", e);
  }
}

// Visit room: server returns visitedPrivateRooms when logged-in and private
async function visitRoom(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) {
      // fallback: still navigate
      window.location.href = `/chat.html?roomId=${roomId}`;
      return;
    }

    // If user is logged-in, backend may return visitedPrivateRooms; update currentUser
    if (data.visitedPrivateRooms && currentUser) {
      currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
    } else if (!currentUser) {
      // anonymous -> store locally (only if room is private)
      if (data.room && data.room.is_private) {
        addRoomToLocalVisited(data.room.id);
      }
    }

    // Refresh sidebar now
    loadVisitedPrivateRooms();

    // navigate to chat
    window.location.href = `/chat.html?roomId=${roomId}`;
  } catch (err) {
    console.error('Error visiting room:', err);
    window.location.href = `/chat.html?roomId=${roomId}`; // ensure navigation even on error
  }
}

// Render sidebar list using server-side list if logged in, otherwise localStorage
async function loadVisitedPrivateRooms() {
  const list = document.getElementById('privateRoomsList');
  if (!list) return;
  list.innerHTML = '';

  let visited = [];
  if (currentUser && Array.isArray(currentUser.visitedPrivateRooms)) {
    visited = currentUser.visitedPrivateRooms.slice(); // copy
  } else {
    visited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
  }

  if (!visited.length) {
    list.textContent = 'No private rooms yet.';
    return;
  }

  // populate with room names (fetch each)
  list.innerHTML = ''; // clear
  for (const rid of visited) {
    try {
      const rres = await fetch(`/api/rooms/${rid}`);
      const rdata = await rres.json();
      if (!rdata.success || !rdata.room) continue;
      const d = document.createElement('div');
      d.textContent = rdata.room.name;
      d.style.cursor = 'pointer';
      d.style.padding = '6px';
      d.style.border = '1px solid #ddd';
      d.style.marginBottom = '6px';
      d.onclick = () => visitRoom(rid);
      list.appendChild(d);
    } catch (e) {
      // ignore per-room fetch errors
    }
  }
}

// initial load
(async function init() {
  await fetchMe();
  await loadRooms(1);
  await loadVisitedPrivateRooms();
})();

async function updateAuthUI() {
    const status = document.getElementById("loginStatus");
    const loginBtn = document.getElementById("loginBtn");
    const registerBtn = document.getElementById("registerBtn");

    // Check real login state from server
    let user = null;
    try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (data.success) user = data.user;
    } catch (err) {
        console.error("Failed to check /api/me:", err);
    }

    if (user) {
        // User is truly logged in (server confirmed)
        status.textContent = "Logged in as: " + user.username;

        loginBtn.textContent = "Logout";
        registerBtn.style.display = "none";

        loginBtn.onclick = async () => {
            await fetch("/api/logout", { method: "POST" });
            updateAuthUI(); // Refresh UI after logging out
            window.location.reload();
        };
    } else {
        // No server session
        status.textContent = "You are not logged in or don't have an account yet";

        loginBtn.textContent = "Login";
        loginBtn.onclick = () => window.location.href = "/login.html";

        registerBtn.style.display = "inline-block";
    }
}

// Run once on page load
updateAuthUI();