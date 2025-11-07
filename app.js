const proxyBase = "http://localhost:3000"; // proxy server URL

let currentUser, assignedUser;
let lastAssignedWishlist = "";

// --- Login ---
function handleLogin() {
  loginBox.style.display = "flex";
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
      loader.style.display = "none";
      document.body.style.overflow = "auto";
      if (res.status === "ok") {
        currentUser = res.user;
        assignedUser = res.assigned;
        loadDashboard();
      } else {
        alert(res.message);
      }
    })
    .catch(err => {
      loader.style.display = "none";
      document.body.style.overflow = "auto";
      alert("Error connecting to server: " + err.message);
    });
}

// REVEAL
function loadDashboard() {
  const loginBox = document.getElementById("loginBox");
  const dashboard = document.getElementById("dashboard");
  const revealScreen = document.getElementById("revealScreen");
  const assignedNameReveal = document.getElementById("assignedNameReveal");
  const continueBtn = document.getElementById("continueButton");

  // First hide all screens
  loginBox.style.display = "none";
  dashboard.style.display = "none";
  revealScreen.style.display = "none";

  const isFirstLogin = currentUser.FirstLogin === "TRUE";

  if (isFirstLogin) {
    // Show reveal screen
    revealScreen.style.display = "flex";
    assignedNameReveal.textContent = assignedUser.Name;

    // Confetti effect
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

    // Continue button
    continueBtn.onclick = () => {
      revealScreen.style.display = "none";
      dashboard.style.display = "block";

      // Mark first login complete
      fetch(`${proxyBase}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "firstLoginComplete", email: currentUser.Email })
      })
      .then(res => res.json())
      .then(res => {
        if (res.status === "ok") {
          currentUser.FirstLogin = "FALSE";
        }
      })
      .catch(err => console.error("Error marking first login:", err));

      initDashboardContent();
    };

  } else {
    // Show dashboard directly if not first login
    dashboard.style.display = "block";
    initDashboardContent();
  }
}


// --- Initialize dashboard content ---
function initDashboardContent() {
  document.getElementById("userName").textContent = currentUser.Name;
  document.getElementById("myWishlist").value = currentUser.Wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.Name;

  fetchAssignedWishlist();
  fetchChats();

  setInterval(() => {
    fetchAssignedWishlist();
    fetchChats();
  }, 3000);

  // Enter key for chats
  document.getElementById("chatAssignedInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat("assigned");
  });
  document.getElementById("chatSantaInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat("santa");
  });
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
    if (res.status === "ok") alert("Wishlist saved");
  });
}

function fetchAssignedWishlist() {
  fetch(`${proxyBase}/readParticipants?email=${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const assignedDiv = document.getElementById("assignedWishlist");
      const newWishlist = res.assigned?.Wishlist || "";

      if (lastAssignedWishlist && lastAssignedWishlist !== newWishlist) {
        assignedDiv.classList.add("highlight");
        setTimeout(() => assignedDiv.classList.remove("highlight"), 1000);
      }
      lastAssignedWishlist = newWishlist;
      assignedDiv.textContent = newWishlist;
    });
}

// --- Chats ---
function fetchChats() {
  // Assigned chat
  fetch(`${proxyBase}/readChat?thread=${currentUser.Email}_to_${assignedUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatAssigned");
      chatDiv.innerHTML = "";
      res.messages?.forEach(m => {
        const sender = m.FromEmail === currentUser.Email ? "You" : assignedUser.Name;
        const msg = document.createElement("div");
        msg.textContent = `${sender}: ${m.Message}`;
        chatDiv.appendChild(msg);
      });
      chatDiv.scrollTop = chatDiv.scrollHeight;
    });

  // Secret Santa chat
  fetch(`${proxyBase}/readChat?thread=${assignedUser.Email}_to_${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatSanta");
      chatDiv.innerHTML = "";
      res.messages?.forEach(m => {
        const msg = document.createElement("div");
        msg.textContent = `SecretSanta: ${m.Message}`;
        chatDiv.appendChild(msg);
      });
      chatDiv.scrollTop = chatDiv.scrollHeight;
    });
}

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
