// public/rooms.js
const roomsDiv = document.getElementById('rooms');
const paginationDiv = document.getElementById('pagination');
const roomNameInput = document.getElementById('roomName');
const isPrivateInput = document.getElementById('isPrivate');
const createBtn = document.getElementById('createBtn');

let currentPage = 1;
let totalPages = 1;
let currentUser = null; // will be set to {id, username, color, visitedPrivateRooms}

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

// load public rooms with pagination
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
        div.className = 'room';
        div.textContent = room.name;
        div.onclick = () => {
          window.location.href = `/chat.html?roomId=${room.id}`;
        };
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
    } else {
      // redirect to the public room
      window.location.href = `/chat.html?roomId=${room.id}`;
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Could not create room.');
  }
});

// load visited private rooms for the sidebar (if logged in)
async function loadVisitedPrivateRooms() {
  const sidebarId = "privateSidebar";
  let sidebar = document.getElementById(sidebarId);
  if (!sidebar) {
    sidebar = document.createElement("div");
    sidebar.id = sidebarId;
    sidebar.style.marginBottom = "12px";
    sidebar.innerHTML = "<h3>My Private Rooms</h3>";
    // insert before rooms div
    document.body.insertBefore(sidebar, document.getElementById("rooms"));
  }
  sidebar.innerHTML = "<h3>My Private Rooms</h3>";
  if (!currentUser || !Array.isArray(currentUser.visitedPrivateRooms) || currentUser.visitedPrivateRooms.length === 0) {
    const p = document.createElement("div");
    p.textContent = "No private rooms yet (visit a private room once to save it).";
    sidebar.appendChild(p);
    return;
  }

  for (const rid of currentUser.visitedPrivateRooms) {
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

// initial load
(async function init() {
  await fetchMe();
  await loadRooms(1);
  await loadVisitedPrivateRooms();
})();