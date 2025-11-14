// public/login.js
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
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
          localStorage.removeItem("visitedPrivateRooms");
        }
      } catch (e) {
        console.warn("Failed to sync local visited rooms:", e);
      }
      window.location.href = "/";
    } else {
      alert(data.error || "Login failed");
    }
  } catch (err) {
    console.error(err);
    alert("Login error");
  }
});