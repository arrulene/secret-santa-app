let user = {}, assigned = {};
let backendURL = "https://script.google.com/macros/s/AKfycbyZDIi_bAfRVUx8wf0CSDlNZra7fF2maG04GgGQU0hSw7SZLmtluP13wcJte3c1KW4x/exec"; // Replace with your Apps Script web app URL

let chatIntervals = {};
let lastMessages = { assigned: [], secretSanta: [] };
let lastAssignedWishlist = "";

// --- Login ---
function handleLogin() {
  const email = document.getElementById("email").value.trim();
  if(!email) { alert("Please enter your email."); return; }

  document.getElementById("loader").style.display="block";

  fetch(`${backendURL}?action=readParticipants&email=${email}`)
    .then(res=>res.json())
    .then(data=>{
      if(data.status==="error") { alert(data.message); return; }

      user = data.user;
      assigned = data.assigned;

      document.getElementById("loader").style.display="none";

      if(user.FirstLogin==="TRUE") {
        document.getElementById("loginScreen").style.display="none";
        document.getElementById("assignedRevealName").textContent = assigned.Name;
        document.getElementById("revealScreen").style.display="block";
      } else {
        continueToDashboard();
      }
    });
}

// --- Dashboard ---
function continueToDashboard() {
  if(user.FirstLogin==="TRUE") {
    fetch(backendURL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ type:"completeFirstLogin", email:user.Email })
    }).then(()=>{ user.FirstLogin="FALSE"; });
  }

  document.getElementById("loginScreen").style.display="none";
  document.getElementById("revealScreen").style.display="none";
  document.getElementById("dashboard").style.display="block";

  document.getElementById("userName").textContent = user.Name;
  document.getElementById("myWishlistText").value = user.Wishlist || "";
  document.getElementById("assignedWishlistText").textContent = assigned.Wishlist || "";

  document.getElementById("assignedChatName").textContent = assigned.Name;
  document.getElementById("assignedChatNameHeader").textContent = assigned.Name;

  startChatPolling('assigned', `${user.Email}_to_${assigned.Email}`);
  startChatPolling('secretSanta', `${assigned.Email}_to_${user.Email}`);
  startAssignedWishlistPolling();
}

// --- Tabs ---
function showTab(tabId) {
  document.querySelectorAll(".tabContent").forEach(el=>el.style.display="none");
  document.getElementById(tabId).style.display="block";
}

// --- Wishlist ---
function saveWishlist() {
  const text = document.getElementById("myWishlistText").value;
  fetch(backendURL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ type:"wishlist", email:user.Email, wishlist:text })
  }).then(()=>{ alert("Wishlist saved!"); });
}

function startAssignedWishlistPolling() {
  setInterval(()=>{
    fetch(`${backendURL}?action=readParticipants&email=${assigned.Email}`)
      .then(res=>res.json())
      .then(data=>{
        const newWishlist = data.user.Wishlist || "";
        const el = document.getElementById("assignedWishlistText");
        if(newWishlist !== lastAssignedWishlist) {
          lastAssignedWishlist = newWishlist;
          el.textContent = newWishlist;
          el.classList.add("highlight");
          setTimeout(()=>el.classList.remove("highlight"),1000);
        }
      });
  }, 5000);
}

// --- Chat ---
function startChatPolling(threadType, threadId) {
  if(chatIntervals[threadType]) clearInterval(chatIntervals[threadType]);

  function loadThread() {
    fetch(`${backendURL}?action=readChat&thread=${threadId}`)
      .then(res=>res.json())
      .then(messages=>{
        const container = document.getElementById(
          threadType==='assigned' ? 'chatAssignedContainer':'chatSecretSantaContainer'
        );

        // Append new messages
        const oldMessages = lastMessages[threadType];
        const newMessages = messages.slice(oldMessages.length);
        if(newMessages.length===0) return;

        newMessages.forEach(m=>{
          const p = document.createElement("p");
          if(m.FromEmail === user.Email) p.textContent = `You: ${m.Message}`;
          else p.textContent = `${threadType==='assigned'?assigned.Name:'SecretSanta'}: ${m.Message}`;
          container.appendChild(p);
        });
        container.scrollTop = container.scrollHeight;
        lastMessages[threadType] = messages;
      });
  }

  loadThread();
  chatIntervals[threadType] = setInterval(loadThread, 3000);
}

function sendChat(threadType) {
  const inputId = threadType==='assigned'?'chatAssignedInput':'chatSecretSantaInput';
  const threadId = threadType==='assigned'?`${user.Email}_to_${assigned.Email}`:`${assigned.Email}_to_${user.Email}`;
  const message = document.getElementById(inputId).value.trim();
  if(!message) return;

  fetch(backendURL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      type:"chat",
      from:user.Email,
      to:assigned.Email,
      message
    })
  }).then(()=>{
    document.getElementById(inputId).value="";
    startChatPolling(threadType, threadId);
  });
}
