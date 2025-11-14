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
      // merge local visited private rooms (if any)
      try {
        const arr = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
        if (Array.isArray(arr) && arr.length > 0) {
          await fetch("/api/users/visit-rooms-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomIds: arr })
          });
          // optional: clear local copy so it won't be re-sent
          localStorage.removeItem("visitedPrivateRooms");
        }
      } catch (e) {
        console.warn("Failed to sync local visited rooms:", e);
      }
      // already logged in via cookie
      window.location.href = "/";
    } else {
      alert(data.error || "Registration failed");
    }
  } catch (err) {
    console.error(err);
    alert("Registration error");
  }
});