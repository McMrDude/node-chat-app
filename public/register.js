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
            // Migrate local visited private rooms to server
            const localVisited = JSON.parse(localStorage.getItem("visitedPrivateRooms") || "[]");
            if (localVisited.length) {
                for (const roomId of localVisited) {
                    await fetch("/api/users/visit-room", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ roomId })
                    });
                }
                localStorage.removeItem("visitedPrivateRooms");
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