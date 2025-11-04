// public/rooms.js
const roomsDiv = document.getElementById('rooms');
const paginationDiv = document.getElementById('pagination');
const roomNameInput = document.getElementById('roomName');
const isPrivateInput = document.getElementById('isPrivate');
const createBtn = document.getElementById('createBtn');

let currentPage = 1;
let totalPages = 1;

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
          // If room is public, navigate by id
          window.location.href = `/chat.html?roomId=${room.id}`;
        };
        roomsDiv.appendChild(div);
      });
    }

    // pagination info from server
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

  // show window of pages
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
      // show modal with invite link and copy button
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
          // fallback
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
      // public room: redirect to the chat immediately
      window.location.href = `/chat.html?roomId=${room.id}`;
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Could not create room.');
  }
});

loadRooms();