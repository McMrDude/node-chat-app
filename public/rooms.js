const roomsDiv = document.getElementById("rooms");
const paginationDiv = document.getElementById("pagination");

let currentPage = 1;
let totalPages = 1;

async function loadRooms(page = 1) {
  const res = await fetch(`/api/rooms?page=${page}`);
  const data = await res.json();
  roomsDiv.innerHTML = "";
  data.rooms.forEach(room => {
    const div = document.createElement("div");
    div.className = "room";
    div.textContent = room.name;
    div.onclick = () => {
      window.location.href = `/chat.html?roomId=${room.id}`;
    };
    roomsDiv.appendChild(div);
  });

  currentPage = data.currentPage;
  totalPages = data.totalPages;
  renderPagination();
}

function renderPagination() {
  paginationDiv.innerHTML = "";
  if (currentPage > 1) {
    const prev = document.createElement("span");
    prev.className = "page-btn";
    prev.textContent = "<";
    prev.onclick = () => loadRooms(currentPage - 1);
    paginationDiv.appendChild(prev);
  }

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement("span");
    pageBtn.className = "page-btn";
    pageBtn.textContent = i;
    if (i === currentPage) pageBtn.style.fontWeight = "bold";
    pageBtn.onclick = () => loadRooms(i);
    paginationDiv.appendChild(pageBtn);
  }

  if (currentPage < totalPages) {
    const next = document.createElement("span");
    next.className = "page-btn";
    next.textContent = ">";
    next.onclick = () => loadRooms(currentPage + 1);
    paginationDiv.appendChild(next);
  }
}

loadRooms();