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

            window.location.href = "/";
        } else {
            alert(data.error || "Login failed");
        }
    } catch (err) {
        console.error(err);
        alert("Login error");
    }
});