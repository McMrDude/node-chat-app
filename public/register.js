document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const color = document.getElementById("color").value || "#000000";

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, color })
    });
    const data = await res.json();
    if (data.success) {
      // get local visited rooms
      const localVisited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
      if (Array.isArray(localVisited) && localVisited.length) {
        try {
          // send batch to server (await to ensure migration runs)
          await fetch("/api/users/visit-rooms-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomIds: localVisited })
          });
          // only clear local storage on success attempt
          localStorage.removeItem("visitedPrivateRooms");
        } catch (e) {
          console.error("Migration (register) failed:", e);
          // do not block redirect — best-effort
        }
      }

      // redirect after attempting migration
      window.location.href = "/";
    } else {
      alert(data.error || "Registration failed");
    }
  } catch (err) {
    console.error(err);
    alert("Registration error");
  }
});