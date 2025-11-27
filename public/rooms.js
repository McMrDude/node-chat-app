// public/rooms.js
// Reworked to support live search across all pages while keeping paginated view when search is empty.

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
const searchInput = document.getElementById("searchBar"); // the actual text input

let allRooms = [];             // cached list of all public rooms (populated via /api/rooms-all)
let allRoomsLoaded = false;
let currentSearch = "";        // current search text
const roomsPerPage = 12;

let currentPage = 1;
let totalPages = 1;
let currentUser = null; // will be {id, username, color, visitedPrivateRooms} or null

// Toggle sidebar/topbar button
btn.onclick = () => {
  bar.classList.toggle("open");
  btn.classList.toggle("open");
  btn.textContent = bar.classList.contains("open") ? "▲" : "▼";
};

// Tabs
createTab.onclick = () => {
  createTab.classList.add("open");
  searchTab.classList.remove("open");
  createForm.style.display = "flex";
  searchForm.style.display = "none";
  // Reset search
  currentSearch = "";
  searchInput.value = "";
  loadRooms(1);
};
searchTab.onclick = async () => {
  searchTab.classList.add("open");
  createTab.classList.remove("open");
  createForm.style.display = "none";
  searchForm.style.display = "flex";

  // Load ALL rooms once (for search across pages)
  if (!allRoomsLoaded) {
    try {
      const res = await fetch("/api/rooms-all");
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        allRooms = data.rooms;
        allRoomsLoaded = true;
      } else {
        allRooms = [];
        allRoomsLoaded = true; // avoid refetch loops
      }
    } catch (err) {
      console.error("Failed to load all rooms for search:", err);
      allRooms = [];
      allRoomsLoaded = true;
    }
  }

  // If there's already text in the search box, render results immediately
  if (searchInput.value.trim() !== "") {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderSearchResults(currentSearch);
  } else {
    // If no search text, show first page of normal paginated view
    loadRooms(1);
  }
};

// Keep UI tab state correct on load
function tabCheck() {
  if (createForm.style.display !== "none") {
    createTab.classList.add("open");
    searchTab.classList.remove("open");
  }
  if (searchForm.style.display !== "none") {
    searchTab.classList.add("open");
    createTab.classList.remove("open");
  }
}
tabCheck();

// Listen on the actual text input for live updates
searchInput.addEventListener("input", async (evt) => {
  const q = (evt.target.value || "").trim().toLowerCase();
  currentSearch = q;

  if (q === "") {
    // empty search -> go back to normal paginated view
    // ensure pagination visible
    await loadRooms(1);
    return;
  }

  // ensure allRooms is loaded
  if (!allRoomsLoaded) {
    try {
      const res = await fetch("/api/rooms-all");
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        allRooms = data.rooms;
      } else {
        allRooms = [];
      }
    } catch (err) {
      console.error("Failed to fetch all rooms for search:", err);
      allRooms = [];
    }
    allRoomsLoaded = true;
  }

  // render results for query
  renderSearchResults(q);
});

// Render search results (no pagination when searching)
function renderSearchResults(query) {
  roomsDiv.innerHTML = "";
  paginationDiv.innerHTML = ""; // hide pagination during search

  if (!query) {
    roomsDiv.textContent = "Type to search rooms.";
    return;
  }

  // startsWith behaviour, case-insensitive
  const results = allRooms.filter(r => {
    if (!r || typeof r.name !== "string") return false;
    return r.name.toLowerCase().startsWith(query);
  });

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

// Fetch user session (as before)
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

// Normal paginated loader
async function loadRooms(page = 1) {
  // if user currently has a search query, ignore paginated load
  if (currentSearch && currentSearch.length > 0) {
    // user is actively searching — render search results instead of fetching pages
    renderSearchResults(currentSearch);
    return;
  }

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
        div.className = 'room';
        div.textContent = room.name;
        div.onclick = () => visitRoom(room.id);
        roomsDiv.appendChild(div);
      });
    }

    totalPages = data.totalPages || 1;
    currentPage = data.currentPage || page;
    renderPagination();
  } catch (err) {
    console.error('Error loading rooms:', err);
    roomsDiv.textContent = 'Error loading rooms.';
  }
}

// Pagination renderer (only shown in normal mode)
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

// create room handler (unchanged)
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

// local visited
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

// visit room (unchanged)
async function visitRoom(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}`);
    const data = await res.json();
    if (!data.success || !data.room) {
      window.location.href = `/chat.html?roomId=${roomId}`;
      return;
    }
    if (data.visitedPrivateRooms && currentUser) {
      currentUser.visitedPrivateRooms = data.visitedPrivateRooms;
    } else if (!currentUser) {
      if (data.room && data.room.is_private) {
        addRoomToLocalVisited(data.room.id);
      }
    }
    loadVisitedPrivateRooms();
    window.location.href = `/chat.html?roomId=${roomId}`;
  } catch (err) {
    console.error('Error visiting room:', err);
    window.location.href = `/chat.html?roomId=${roomId}`;
  }
}

// visited private rooms rendering (unchanged)
async function loadVisitedPrivateRooms() {
  const list = document.getElementById('privateRoomsList');
  if (!list) return;
  list.innerHTML = '';

  let visited = [];
  if (currentUser && Array.isArray(currentUser.visitedPrivateRooms)) {
    visited = currentUser.visitedPrivateRooms.slice();
  } else {
    visited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
  }

  if (!visited.length) {
    list.textContent = 'No private rooms yet.';
    return;
  }

  list.innerHTML = '';
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

// auth UI update (unchanged except use server to confirm)
async function updateAuthUI() {
    const status = document.getElementById("loginStatus");
    const loginBtn = document.getElementById("loginBtn");
    const registerBtn = document.getElementById("registerBtn");

    let user = null;
    try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (data.success) user = data.user;
    } catch (err) {
        console.error("Failed to check /api/me:", err);
    }

    if (user) {
        status.textContent = "Logged in as: " + user.username;
        loginBtn.textContent = "Logout";
        registerBtn.style.display = "none";
        loginBtn.onclick = async () => {
            await fetch("/api/logout", { method: "POST" });
            updateAuthUI();
            window.location.reload();
        };
    } else {
        status.textContent = "You are not logged in or don't have an account yet";
        loginBtn.textContent = "Login";
        loginBtn.onclick = () => window.location.href = "/login.html";
        registerBtn.style.display = "inline-block";
    }
}

// Run once on page load to set auth UI
updateAuthUI();