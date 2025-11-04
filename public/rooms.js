// Function to fetch and display rooms
async function loadRooms(page = 1) {
  const response = await fetch(`/api/rooms?page=${page}`);
  const data = await response.json();

  const roomContainer = document.getElementById("roomContainer");
  roomContainer.innerHTML = "";

  if (data.success) {
    data.rooms.forEach((room) => {
      const roomDiv = document.createElement("div");
      roomDiv.className = "room";
      roomDiv.innerHTML = `
        <a href="chat.html?roomId=${room.id}">
          ${room.name}
        </a>
      `;
      roomContainer.appendChild(roomDiv);
    });
  }
}

// Room creation form handler
document.getElementById("createRoomForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const roomName = document.getElementById("roomName").value;
  const isPrivate = document.getElementById("isPrivate").checked;

  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: roomName, is_private: isPrivate }),
  });

  const data = await response.json();
  if (data.success) {
    if (data.is_private) {
      const inviteLink = `${window.location.origin}/chat.html?roomId=${data.id}`;
      alert(`Private Room Created! Invite Link: ${inviteLink}`);
    } else {
      loadRooms();
    }
  } else {
    alert("Could not create room");
  }
});

// Load rooms on page load
loadRooms();