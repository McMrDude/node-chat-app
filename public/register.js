// public/register.js
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
      // Start migration in the background (fire-and-forget)
      (async function migrate() {
        try {
          // Migrate local visited private rooms to server (batch)
            const localVisited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
            if (localVisited.length) {
                await fetch("/api/users/visit-rooms-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roomIds: localVisited })
                }).catch(() => {});
                localStorage.removeItem("visitedPrivateRooms");
            }
        } catch (e) {
          // swallow errors so migration never blocks
          console.error("Migration error (register):", e);
        }
      })();

      // Already logged in via cookie — redirect immediately
      window.location.href = "/";
    } else {
      alert(data.error || "Registration failed");
    }
  } catch (err) {
    console.error(err);
    alert("Registration error");
  }
});