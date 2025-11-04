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
    if (data.rooms.length === 0) {
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

    totalPages = data.totalPages;
    renderPagination();
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

function renderPagination() {
  paginationDiv.innerHTML = '';
  if (totalPages <= 1) return;

  const createPageBtn = (text, page) => {
    const span = document.createElement('span');
    span.className = 'page-btn';
    span.textContent = text;
    span.onclick = () => loadRooms(page);
    return span;
  };

  if (currentPage > 1) paginationDiv.appendChild(createPageBtn('<<', 1));
  if (currentPage > 1) paginationDiv.appendChild(createPageBtn('<', currentPage - 1));

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('span');
    btn.className = 'page-btn';
    btn.textContent = i;
    if (i === currentPage) btn.style.fontWeight = 'bold';
    btn.onclick = () => loadRooms(i);
    paginationDiv.appendChild(btn);
  }

  if (currentPage < totalPages) paginationDiv.appendChild(createPageBtn('>', currentPage + 1));
  if (currentPage < totalPages) paginationDiv.appendChild(createPageBtn('>>', totalPages));
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
    if (room.is_private) {
      alert(`Private room created. Share this link:\n${window.location.origin}/chat.html?invite=${room.invite_code}`);
    } else {
      window.location.href = `/chat.html?roomId=${room.id}`;
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Could not create room.');
  }
});

loadRooms();