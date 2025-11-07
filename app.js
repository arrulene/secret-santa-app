const proxyBase = "http://localhost:3000/"; // proxy server URL

let currentUser, assignedUser;
let lastAssignedWishlist = "";

// --- Login ---
function handleLogin(){
  const email=document.getElementById("email").value.trim();
  const code=document.getElementById("code").value.trim();
  if(!email||!code){alert("Enter both email and login code");return;}

  const loader = document.getElementById("loader");

  // --- Lock scrolling while loader is visible ---
  document.body.style.overflow = "hidden";
  loader.style.display="block";

  fetch(`${proxyBase}/loginUser?email=${email}&code=${code}`)
    .then(res=>res.json())
    .then(res=>{
      loader.style.display="none";           // hide loader
      document.body.style.overflow="auto";   // --- Restore scrolling here ---
      if(res.status==="ok"){
        currentUser=res.user;
        assignedUser=res.assigned;
        loadDashboard();
      } else {
        alert(res.message);
      }
    })
    .catch(err => {
      loader.style.display="none";
      document.body.style.overflow="auto";   // --- Restore scrolling on error ---
      alert("Error connecting to server: " + err.message);
    });
}

// --- Dashboard ---
function loadDashboard() {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("userName").textContent = currentUser.Name;
  document.getElementById("myWishlist").value = currentUser.Wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.Name;

  fetchAssignedWishlist();
  fetchChats();

  setInterval(() => {
    fetchAssignedWishlist();
    fetchChats();
  }, 3000);
}

// --- Wishlist ---
function saveWishlist() {
  const wishlist = document.getElementById("myWishlist").value;
  fetch(`${proxyBase}writeWishlist`, {
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
  fetch(`${proxyBase}readParticipants?email=${currentUser.Email}`)
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
  fetch(`${proxyBase}readChat?thread=${currentUser.Email}_to_${assignedUser.Email}`)
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

  fetch(`${proxyBase}readChat?thread=${assignedUser.Email}_to_${currentUser.Email}`)
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
  fetch(`${proxyBase}writeChat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "chat", from: currentUser.Email, to: toEmail, message })
  }).then(fetchChats);
}
