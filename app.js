const proxyBase = "http://localhost:3000"; // proxy server URL

let currentUser, assignedUser;
let lastAssignedWishlist = "";
let lastAssignedChatsAssigned = [];
let lastAssignedChatsSanta = [];

// --- Startup: show loginBox on page load ---
document.addEventListener("DOMContentLoaded", () => {
  showScreen("loginBox");
});

// --- Helper: show one screen at a time ---
function showScreen(screenId) {
  const screens = ["loginBox","revealScreen","dashboard"];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) {
      // reveal screen needs flex
      if (id === "revealScreen") el.classList.add("show");
      el.style.display = id === "revealScreen" ? "flex" : "block";
    } else {
      el.classList.remove("show");
      el.style.display = "none";
    }
  });
}



// --- Login ---
function handleLogin() {
  const email = document.getElementById("email").value.trim();
  const code = document.getElementById("code").value.trim();
  if (!email || !code) { 
    alert("Enter both email and login code"); 
    return; 
  }

  const loader = document.getElementById("loader");
  document.body.style.overflow = "hidden"; // lock scrolling
  loader.style.display = "block";

  fetch(`${proxyBase}/loginUser?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`)
    .then(res => res.json())
    .then(res => {
      if (res.status !== "ok") {
        loader.style.display = "none";
        document.body.style.overflow = "auto";
        alert(res.message);
        return;
      }

      currentUser = res.user;
      assignedUser = res.assigned;

      fetch(`${proxyBase}/getUser?email=${encodeURIComponent(currentUser.Email)}`)
        .then(res => res.json())
        .then(userData => {
          loader.style.display = "none";
          document.body.style.overflow = "auto";
          //currentUser.FirstLogin = userData.FirstLogin || false;
          loadDashboard();
        })
        .catch(err => {
          loader.style.display = "none";
          document.body.style.overflow = "auto";
          console.error("Error fetching user data:", err);
          currentUser.FirstLogin = false; // fallback
          loadDashboard();
        });
    })
    .catch(err => {
      loader.style.display = "none";
      document.body.style.overflow = "auto";
      alert("Error connecting to server: " + err.message);
    });
}

// --- Dashboard / Reveal ---
function loadDashboard() {
  const assignedNameReveal = document.getElementById("assignedNameReveal");
  const continueBtn = document.getElementById("continueButton");

  const isFirstLogin = currentUser.FirstLogin === true;

  if (isFirstLogin) {
    showScreen("revealScreen");
    assignedNameReveal.textContent = assignedUser.Name;

    // Confetti
    document.querySelectorAll(".confetti-piece").forEach(el => el.remove());
    for (let i = 0; i < 25; i++) {
      const confetti = document.createElement("div");
      confetti.classList.add("confetti-piece");
      confetti.style.top = "-10px";
      confetti.style.left = `${Math.random() * 100}vw`;
      confetti.style.width = `${6 + Math.random() * 6}px`;
      confetti.style.height = confetti.style.width;
      confetti.style.borderRadius = "50%";
      confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
      confetti.style.zIndex = 10000;
      confetti.style.animationDuration = `${2 + Math.random() * 3}s`;
      document.body.appendChild(confetti);
    }

    continueBtn.onclick = () => {
      // Remove confetti
      document.querySelectorAll(".confetti-piece").forEach(el => el.remove());
      showScreen("dashboard");

      // Mark first login complete
      fetch(proxyBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "firstLoginComplete",  // <-- required for backend to recognize
          email: currentUser.Email
        })
      })
      .then(res => res.json())
      .then(res => {
        if (res.status === "ok") {
          currentUser.FirstLogin = false; // update local value
          console.log("✅ First login marked complete for:", currentUser.Email);
        } else {
          console.warn("⚠️ Failed to mark first login:", res);
        }
      })
      .catch(err => console.error("Error marking first login:", err));

      // Continue loading dashboard content
      initDashboardContent();
    };

  } else {
    showScreen("dashboard");
    initDashboardContent();
  }
}

// --- Dashboard content ---
function initDashboardContent() {
  document.getElementById("userName").textContent = currentUser.Name;
  document.getElementById("myWishlist").value = currentUser.Wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.Name;

  startPolling();
}

// --- Wishlist ---
function saveWishlist() {
  const wishlist = document.getElementById("myWishlist").value;
  fetch(`${proxyBase}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "wishlist", email: currentUser.Email, wishlist })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "ok") alert("Wishlist saved!");
  });
}

function fetchAssignedWishlist() {
  fetch(`${proxyBase}/readParticipants?email=${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const assignedDiv = document.getElementById("assignedWishlist");
      const newWishlist = res.assigned?.Wishlist || "";

      if (lastAssignedWishlist !== newWishlist) {
        if (lastAssignedWishlist) {
          assignedDiv.classList.add("highlight");
          setTimeout(() => assignedDiv.classList.remove("highlight"), 1000);
        }
        assignedDiv.textContent = newWishlist;
        lastAssignedWishlist = newWishlist;
      }
    });
}

// --- Chats ---
function fetchChats() {
  // Assigned chat
  fetch(`${proxyBase}/readChat?thread=${currentUser.Email}_to_${assignedUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatAssigned");
      const messages = res.messages || [];
      if (JSON.stringify(messages) !== JSON.stringify(lastAssignedChatsAssigned)) {
        chatDiv.innerHTML = "";
        messages.forEach(m => {
          const sender = m.FromEmail === currentUser.Email ? "You" : assignedUser.Name;
          const msg = document.createElement("div");
          msg.textContent = `${sender}: ${m.Message}`;
          chatDiv.appendChild(msg);
        });
        chatDiv.scrollTop = chatDiv.scrollHeight;
        lastAssignedChatsAssigned = messages;
      }
    });

  // SecretSanta chat
  fetch(`${proxyBase}/readChat?thread=${assignedUser.Email}_to_${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatSanta");
      const messages = res.messages || [];
      if (JSON.stringify(messages) !== JSON.stringify(lastAssignedChatsSanta)) {
        chatDiv.innerHTML = "";
        messages.forEach(m => {
          const msg = document.createElement("div");
          msg.textContent = `SecretSanta: ${m.Message}`;
          chatDiv.appendChild(msg);
        });
        chatDiv.scrollTop = chatDiv.scrollHeight;
        lastAssignedChatsSanta = messages;
      }
    });
}

// --- Send Chat ---
function sendChat(type) {
  let toEmail, msgInput;
  if (type === "assigned") {
    toEmail = assignedUser.Email;
    msgInput = document.getElementById("chatAssignedInput");
  } else {
    toEmail = currentUser.AssignedTo;
    msgInput = document.getElementById("chatSantaInput");
  }
  const message = msgInput.value.trim();
  if (!message) return;
  msgInput.value = "";

  fetch(`${proxyBase}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "chat", from: currentUser.Email, to: toEmail, message })
  }).then(fetchChats);
}

// --- Polling ---
function startPolling() {
  const dashboardVisible = document.getElementById("dashboard").style.display === "block";
  if (dashboardVisible) {
    fetchAssignedWishlist();
    fetchChats();
  }
  setTimeout(startPolling, 3000);
}
