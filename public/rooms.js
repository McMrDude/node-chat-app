const roomsDiv = document.getElementById("rooms");
const paginationDiv = document.getElementById("pagination");
const roomNameInput = document.getElementById("roomName");
const isPrivateInput = document.getElementById("isPrivate");
const createBtn = document.getElementById("createBtn");
const seedBtn = document.getElementById("seedBtn");

let currentPage = 1;
let totalPages = 1;

async function loadRooms(page = 1) {
    currentPage = page;
    try {
        const res = await fetch(`/api/rooms?page=${page}`);
        if (!res.ok) throw new Error("Failed to fetch rooms");
        const data = await res.json();
        roomsDiv.innerHTML = "";

        if (data.rooms.length === 0) {
            roomsDiv.textContent = "No public rooms yet. Create one above!";
        } else {
            data.rooms.foreach(room => {
                const div = document.createElement("div");
                div.className = "room";
                div.textContent = room.name;
                div.onclick = () => {
                    window.location.href = `/chat.html?roomId=${room.id}`;
                };
                roomsDiv.appendChild(div);
            });
        }

        currentPage = data.currentPage;
        totalPages = data.totalPages;
        renderPagination();
    } catch (err) {
        console.error(err);
        roomsDiv.textContent = "Error loading rooms.";
    }
}

function renderPagination() {
  paginationDiv.innerHTML = "";
  if (totalPages <= 1) return;

  const createPageBtn = (text, page) => {
    const el = document.createElement("span");
    el.className = "page-btn";
    el.textContent = text;
    el.onclick = () => loadRooms(page);
    return el;
  };

  if (currentPage > 1) paginationDiv.appendChild(createPageBtn("<<", 1));
  if (currentPage > 1) paginationDiv.appendChild(createPageBtn("<", currentPage - 1));

  const start = Math.max(1, currentPage - 3);
  const end = Math.min(totalPages, currentPage + 3);
  for (let i = start; i <= end; i++) {
    const p = document.createElement("span");
    p.className = "page-btn";
    p.textContent = i;
    if (i === currentPage) p.style.fontWeight = "bold";
    p.onclick = () => loadRooms(i);
    paginationDiv.appendChild(p);
  }

  if (currentPage < totalPages) paginationDiv.appendChild(createPageBtn(">", currentPage + 1));
  if (currentPage < totalPages) paginationDiv.appendChild(createPageBtn(">>", totalPages));
}

createBtn.addEventListener("click", async () => {
    const name = (roomNameInput.value || "").trim();
    const is_private = !!isPrivateInput.checked;
    if (!name) return alert("Enter a room name");

    try {
        const res = await fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, is_private })
        });
        if (!res.ok) throw new Error("Failed to create room");
        const room = await res.json();

        if (room.is_private) {
            // show invite link for private room
            alert(`Private room created. Share this link:\n${window.location.origin}/chat.html?invite=${room.invite_code}`);
        } else {
            // redirect to room or reload rooms listing
            window.location.href = `/chat.html?roomId=${room.id}`;
        }
    } catch (err) {
        console.error(err);
        alert("Could not create room.");
    }
});

// quick sample seed button
seedBtn.addEventListener("click", async () => {
    try {
        const name = "Sample Public Room " + Math.floor(Math.random()*1000);
        await fetch("/api/rooms", {
            method: "POST",
            headers: { "content-Type": "application/json" },
            body: JSON.stringify({ name, is_private: false })
        });
        loadRooms(currentPage);
    } catch (e) { console.error(e); alert("seed failed"); }
});

loadRooms();