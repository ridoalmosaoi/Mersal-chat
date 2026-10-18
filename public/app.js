const socket = io();

let currentUser = null;
let currentColor = "#ffd700";
let currentPrivateUser = null;
let currentPrivateName = null;
let replyData = null;
let usersCache = [];
let privateListMode = false;
let loginPending = false;
let toastTimer = null;

const $ = id => document.getElementById(id);

const loginPage = $("loginPage");
const chatPage = $("chatPage");
const username = $("username");
const adminPassword = $("adminPassword");
const messages = $("messages");
const usersList = $("usersList");
const usersMenu = $("usersMenu");
const menuTitle = $("menuTitle");
const loginStatus = $("loginStatus");
const privateMessages = $("privateMessages");
const privateInput = $("privateInput");

/* MOBILE VIEWPORT */
function updateViewportHeight(){
  const height = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;

  document.documentElement.style.setProperty(
    "--app-height",
    `${height}px`
  );
}

updateViewportHeight();

window.addEventListener("resize", updateViewportHeight);

if(window.visualViewport){
  window.visualViewport.addEventListener(
    "resize",
    updateViewportHeight
  );

  window.visualViewport.addEventListener(
    "scroll",
    updateViewportHeight
  );
}

/* HELPERS */
function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(text){
  const toast = $("toast");

  if(!toast) return;

  toast.textContent = text;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function setLoginStatus(text, error = false){
  if(!loginStatus) return;

  loginStatus.textContent = text || "";
  loginStatus.style.color = error
    ? "#ff9d9d"
    : "#9dffca";
}

/* ADMIN PASSWORD FIELD */
username.addEventListener("input", () => {

  const name = username.value.trim();

  setLoginStatus("");

  if(!name){
    adminPassword.style.display = "none";
    adminPassword.value = "";
    return;
  }

  socket.emit("check admin", name);
});

socket.on("admin check result", isAdmin => {

  if(isAdmin){

    adminPassword.style.display = "block";

  }else{

    adminPassword.style.display = "none";
    adminPassword.value = "";

  }

});

/* COLORS */
document
  .querySelectorAll(".color-option")
  .forEach(el => {

    el.addEventListener("click", () => {

      document
        .querySelectorAll(".color-option")
        .forEach(x =>
          x.classList.remove("active-color")
        );

      el.classList.add("active-color");

      currentColor =
        el.dataset.color || "#ffd700";

    });

  });

/* LOGIN */
function joinChat(){

  if(loginPending) return;

  const name = username.value.trim();

  if(!name){

    setLoginStatus(
      "اكتب اسمك أولاً",
      true
    );

    username.focus();

    return;
  }

  loginPending = true;

  setLoginStatus(
    "جارٍ الدخول...",
    false
  );

  socket.emit("join", {

    username: name,

    adminPassword:
      adminPassword.value,

    color:
      currentColor,

    deviceToken:
      navigator.userAgent

  });

}

window.joinChat = joinChat;

/* LOGIN SUCCESS */
socket.on("login success", () => {

  currentUser =
    username.value.trim();

  loginPending = false;

  loginPage.style.display = "none";

  chatPage.style.display = "flex";

  setLoginStatus("");

  messages.innerHTML = "";

  privateMessages.innerHTML = "";

});

/* LOGIN ERROR */
socket.on("banned", msg => {

  loginPending = false;

  setLoginStatus(
    msg || "تعذر الدخول",
    true
  );

  showToast(
    msg || "تعذر تنفيذ العملية"
  );

});

/* CONNECTION */
socket.on("connect", () => {

  if(!currentUser){

    setLoginStatus("");

  }

});

socket.on("disconnect", () => {

  if(currentUser){

    showToast(
      "⚠️ انقطع الاتصال بالخادم"
    );

  }

});

/* PUBLIC CHAT */
function sendMessage(){

  const input =
    $("messageInput");

  const text =
    input.value.trim();

  if(!text) return;

  socket.emit(
    "chat message",
    {
      message: text,
      reply: replyData
    }
  );

  input.value = "";

  cancelReply();

  input.focus();

}

window.sendMessage =
  sendMessage;

/* ENTER TO SEND */
$("messageInput")
  .addEventListener("keydown", e => {

    if(
      e.key === "Enter" &&
      !e.shiftKey
    ){

      e.preventDefault();

      sendMessage();

    }

  });

/* RECEIVE PUBLIC MESSAGE */
socket.on(
  "chat message",
  data => {

    const div =
      document.createElement("div");

    div.className =
      "message";

    if(
      data.username === currentUser
    ){

      div.classList.add(
        "my-message"
      );

    }

    const user =
      document.createElement("div");

    user.className =
      "message-user";

    user.style.color =
      data.color || "#ffd700";

    user.textContent =
      data.username || "مستخدم";

    user.addEventListener(
      "click",
      () => showUserPopup(data)
    );

    if(data.reply){

      const reply =
        document.createElement("div");

      reply.className =
        "reply-preview";

      reply.textContent =
        `↩️ ${
          data.reply.user || ""
        }: ${
          data.reply.text || ""
        }`;

      div.appendChild(reply);

    }

    const text =
      document.createElement("div");

    text.className =
      "message-text";

    text.textContent =
      data.message || "";

    div.appendChild(user);

    div.appendChild(text);

    messages.appendChild(div);

    messages.scrollTop =
      messages.scrollHeight;

  }
);

/* USERS */
socket.on(
  "online users",
  users => {

    usersCache =
      Array.isArray(users)
        ? users
        : [];

    renderUsers();

  }
);

function renderUsers(){

  usersList.innerHTML = "";

  const list = usersCache.filter(user => user);

  if(!list.length){

    const empty =
      document.createElement("div");

    empty.className =
      "empty-users";

    empty.textContent =
      privateListMode
        ? "لا يوجد مستخدمون للمراسلة الآن"
        : "لا يوجد مستخدمون آخرون متصلون";

    usersList.appendChild(empty);

    return;
  }

  list.forEach(user => {

    const div =
      document.createElement("div");

    div.className =
      "user-item";

    div.textContent =
      `👤 ${user.username}`;

    div.addEventListener(
      "click",
      () => {

        if(privateListMode){

          openPrivate(
            user.id,
            user.username
          );

        }else{

          showUserPopup(user);

        }

      }
    );

    usersList.appendChild(div);

  });

}

/* USERS MENU */
function openUsers(){

  privateListMode = false;

  menuTitle.textContent =
    "👥 المتواجدون";

  renderUsers();

  usersMenu.style.display =
    "flex";

  requestAnimationFrame(() => {

    usersMenu.classList.add(
      "show"
    );

  });

  usersMenu.setAttribute(
    "aria-hidden",
    "false"
  );

}

window.openUsers =
  openUsers;

/* PRIVATE USERS LIST */
function openPrivateList(){

  privateListMode = true;

  menuTitle.textContent =
    "💬 اختر شخصًا للمراسلة";

  renderUsers();

  usersMenu.style.display =
    "flex";

  requestAnimationFrame(() => {

    usersMenu.classList.add(
      "show"
    );

  });

  usersMenu.setAttribute(
    "aria-hidden",
    "false"
  );

}

window.openPrivateList =
  openPrivateList;

/* CLOSE USERS MENU */
function closeUsers(){

  usersMenu.classList.remove(
    "show"
  );

  usersMenu.setAttribute(
    "aria-hidden",
    "true"
  );

  setTimeout(() => {

    if(
      !usersMenu.classList.contains(
        "show"
      )
    ){

      usersMenu.style.display =
        "none";

    }

  }, 230);

}

window.closeUsers =
  closeUsers;

/* USER POPUP */
function showUserPopup(user){

  closeUsers();

  const overlay =
    $("userPopupOverlay");

  const title =
    $("popupUsername");

  const buttons =
    $("popupButtons");

  title.textContent =
    `👤 ${
      user.username || "مستخدم"
    }`;

  buttons.innerHTML = "";

  /* COPY */
  const copyBtn =
    document.createElement("button");

  copyBtn.textContent =
    "📋 نسخ الاسم";

  copyBtn.addEventListener(
    "click",
    () =>
      copyName(user.username)
  );

  /* REPLY */
  const replyBtn =
    document.createElement("button");

  replyBtn.textContent =
    "↩️ رد";

  replyBtn.addEventListener(
    "click",
    () =>
      replyTo(
        user.username,
        user.message || ""
      )
  );

  /* PRIVATE */
  const privateBtn =
    document.createElement("button");

  privateBtn.textContent =
    "💬 مرسال خاص";

  privateBtn.addEventListener(
    "click",
    () =>
      openPrivate(
        user.id,
        user.username
      )
  );

  buttons.append(
    copyBtn,
    replyBtn,
    privateBtn
  );

  overlay.style.display =
    "flex";

}

window.showUserPopup =
  showUserPopup;

/* CLOSE USER POPUP */
function closeUserPopup(){

  $("userPopupOverlay")
    .style.display = "none";

}

window.closeUserPopup =
  closeUserPopup;

/* COPY USERNAME */
async function copyName(name){

  try{

    await navigator.clipboard.writeText(
      name || ""
    );

    showToast(
      "✅ تم نسخ الاسم"
    );

  }catch{

    showToast(
      "تعذر نسخ الاسم"
    );

  }

  closeUserPopup();

}

window.copyName =
  copyName;

/* REPLY */
function replyTo(user, text){

  closeUsers();

  closeUserPopup();

  replyData = {
    user,
    text
  };

  $("replyBox").style.display =
    "flex";

  $("replyText").textContent =
    `↩️ ${user}: ${text}`;

  $("messageInput").focus();

}

window.replyTo =
  replyTo;

/* CANCEL REPLY */
function cancelReply(){

  replyData = null;

  $("replyBox").style.display =
    "none";

}

window.cancelReply =
  cancelReply;

/* PRIVATE CHAT */
function openPrivate(id, name){

  if(!id) return;

  currentPrivateUser =
    id;

  currentPrivateName =
    name || "مستخدم";

  closeUsers();

  closeUserPopup();

  $("privateTitle").textContent =
    `💬 ${currentPrivateName}`;

  privateMessages.innerHTML =
    "";

  $("privateChatBox")
    .style.display = "flex";

  privateInput.focus();

}

window.openPrivate =
  openPrivate;

/* CLOSE PRIVATE */
function closePrivate(){

  $("privateChatBox")
    .style.display = "none";

  currentPrivateUser =
    null;

  currentPrivateName =
    null;

  privateInput.value =
    "";

}

window.closePrivate =
  closePrivate;

/* SEND PRIVATE */
function sendPrivate(){

  const text =
    privateInput.value.trim();

  if(
    !text ||
    !currentPrivateUser
  ) return;

  socket.emit(
    "private message",
    {
      to: currentPrivateUser,
      from: currentUser,
      message: text
    }
  );

  // إظهار رسالتك عندك مباشرة
  const div =
    document.createElement("div");

  div.className =
    "private-message me";

  const name =
    document.createElement("div");

  name.className =
    "private-name";

  name.textContent =
    currentUser;

  const message =
    document.createElement("div");

  message.textContent =
    text;

  div.appendChild(name);
  div.appendChild(message);

  privateMessages.appendChild(div);

  privateMessages.scrollTop =
    privateMessages.scrollHeight;

  privateInput.value = "";

}

window.sendPrivate =
  sendPrivate;

/* PRIVATE ENTER */
privateInput.addEventListener(
  "keydown",
  e => {

    if(e.key === "Enter"){

      e.preventDefault();

      sendPrivate();

    }

  }
);

/* RECEIVE PRIVATE */
socket.on(
  "private message",
  data => {

    const div =
      document.createElement("div");

    div.className =
      "private-message " +
      (
        data.from === currentUser
          ? "me"
          : "other"
      );

    const name =
      document.createElement("div");

    name.className =
      "private-name";

    name.textContent =
      data.from || "مستخدم";

    const text =
      document.createElement("div");

    text.textContent =
      data.message || "";

    div.append(
      name,
      text
    );

    privateMessages.appendChild(
      div
    );

    privateMessages.scrollTop =
      privateMessages.scrollHeight;

  }
);

/* ESC */
document.addEventListener(
  "keydown",
  e => {

    if(e.key !== "Escape")
      return;

    closeUserPopup();

    closeUsers();

    if(
      $("privateChatBox")
        .style.display === "flex"
    ){

      closePrivate();

    }

  }
);
