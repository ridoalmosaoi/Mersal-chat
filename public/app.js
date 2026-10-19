/* =========================================================
   MERSAL CHAT - APP.JS
   ROOM SYSTEM + TABS + PRIVATE TABS
   ========================================================= */

const socket = io();

/* =========================================================
   GLOBAL
   ========================================================= */

let currentUser = null;
let currentUserId = null;
let currentColor = "#ffd700";
let currentUserRole = "";

let loginPending = false;
let replyData = null;
let toastTimer = null;

let usersCache = [];
let currentRoomId = null;

let rooms = [];
let openRooms = [];
let currentTab = null;

let privateChats = {};
let unreadPrivate = {};

let roomMessages = {};
let roomScrollPositions = {};

let roomTouchStartX = 0;
let roomTouchEndX = 0;

let isAdmin = false;
let adminPermissions = {};
let adminRooms = [];


/* =========================================================
   ELEMENTS
   ========================================================= */

const $ = id =>
  document.getElementById(id);

const loginPage =
  $("loginPage");

const chatPage =
  $("chatPage");

const usernameInput =
  $("username");

const adminPassword =
  $("adminPassword");

const messages =
  $("messages");

const usersList =
  $("usersList");

const usersMenu =
  $("usersMenu");

const menuTitle =
  $("menuTitle");

const loginStatus =
  $("loginStatus");

const privateMessages =
  $("privateMessages");

const privateInput =
  $("privateInput");

const messageInput =
  $("messageInput");


/* =========================================================
   IPHONE / SAFARI VIEWPORT
   ========================================================= */

function updateChatViewport(){

  const viewport =
    window.visualViewport;

  const height =
    viewport
      ? viewport.height
      : window.innerHeight;

  document.documentElement.style.setProperty(
    "--app-height",
    `${height}px`
  );
}

updateChatViewport();

window.addEventListener(
  "resize",
  updateChatViewport
);

if(window.visualViewport){

  window.visualViewport.addEventListener(
    "resize",
    updateChatViewport
  );

}


/* =========================================================
   IPHONE - PREVENT PAGE MOVING
   ========================================================= */

function lockPagePosition(){

  window.scrollTo(
    0,
    0
  );

}

window.addEventListener(
  "scroll",
  lockPagePosition,
  {
    passive: true
  }
);

if(window.visualViewport){

  window.visualViewport.addEventListener(
    "scroll",
    lockPagePosition
  );

}

document.addEventListener(
  "focusin",
  function(e){

    if(
      e.target &&
      (
        e.target.id ===
          "messageInput" ||
        e.target.id ===
          "privateInput"
      )
    ){

      setTimeout(
        () =>
          window.scrollTo(
            0,
            0
          ),
        50
      );

      setTimeout(
        () =>
          window.scrollTo(
            0,
            0
          ),
        300
      );

    }

  }
);


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value){

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function showToast(text){

  let toast =
    $("toast");

  if(!toast){

    toast =
      document.createElement(
        "div"
      );

    toast.id =
      "toast";

    toast.style.position =
      "fixed";

    toast.style.left =
      "50%";

    toast.style.bottom =
      "25px";

    toast.style.transform =
      "translateX(-50%)";

    toast.style.zIndex =
      "99999";

    toast.style.padding =
      "12px 18px";

    toast.style.borderRadius =
      "14px";

    toast.style.background =
      "rgba(0,0,0,.9)";

    toast.style.color =
      "#fff";

    toast.style.border =
      "1px solid rgba(255,255,255,.15)";

    document.body.appendChild(
      toast
    );

  }

  toast.textContent =
    text;

  toast.style.display =
    "block";

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(
      () => {

        toast.style.display =
          "none";

      },
      2500
    );

}


function setLoginStatus(
  text,
  error = false
){

  if(!loginStatus){
    return;
  }

  loginStatus.textContent =
    text || "";

  loginStatus.style.color =
    error
      ? "#ff9d9d"
      : "#9dffca";

}


/* =========================================================
   ADMIN PASSWORD
   ========================================================= */

if(usernameInput){

  usernameInput.addEventListener(
    "input",
    () => {

      const name =
        usernameInput.value.trim();

      setLoginStatus("");

      if(!name){

        if(adminPassword){

          adminPassword.style.display =
            "none";

          adminPassword.value =
            "";

        }

        return;
      }

      socket.emit(
        "check admin",
        name
      );

    }
  );

}


socket.on(
  "admin check result",
  isAdminResult => {

    if(!adminPassword){
      return;
    }

    if(isAdminResult){

      adminPassword.style.display =
        "block";

    }else{

      adminPassword.style.display =
        "none";

      adminPassword.value =
        "";

    }

  }
);


/* =========================================================
   COLORS
   ========================================================= */

document
  .querySelectorAll(
    ".color-option"
  )
  .forEach(
    element => {

      element.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".color-option"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active-color"
                )
            );

          element.classList.add(
            "active-color"
          );

          currentColor =
            element.dataset.color ||
            "#ffd700";

        }
      );

    }
  );


/* =========================================================
   JOIN
   ========================================================= */

function joinChat(){

  if(loginPending){
    return;
  }

  const name =
    usernameInput
      ?.value
      ?.trim();

  if(!name){

    setLoginStatus(
      "اكتب اسمك أولاً",
      true
    );

    usernameInput?.focus();

    return;
  }

  /*
     حماية إضافية في الواجهة.
     السيرفر هو الحماية الأساسية.
  */

  if(
    name.includes("&") ||
    name.includes("@")
  ){

    setLoginStatus(
      "❌ لا يمكن استخدام رموز الإدارة في الاسم",
      true
    );

    return;
  }

  loginPending =
    true;

  setLoginStatus(
    "جارٍ الدخول...",
    false
  );

  socket.emit(
    "join",
    {

      username:
        name,

      adminPassword:
        adminPassword
          ?.value || "",

      color:
        currentColor,

      deviceToken:
        navigator.userAgent

    }
  );

}

window.joinChat =
  joinChat;


/* =========================================================
   LOGIN SUCCESS
   ========================================================= */

socket.on(
  "login success",
  data => {

    loginPending =
      false;

    currentUser =
      data?.user?.username ||
      usernameInput
        ?.value
        ?.trim();

    currentUserId =
      data?.user?.id ||
      null;

    currentUserRole =
      data?.user?.role ||
      "";

    isAdmin =
      !!data?.isAdmin;

    rooms =
      Array.isArray(
        data?.rooms
      )
        ? data.rooms
        : [];

    if(
      data?.user?.color
    ){

      currentColor =
        data.user.color;

    }

    if(
      loginPage
    ){

      loginPage.style.display =
        "none";

    }

    if(
      chatPage
    ){

      chatPage.style.display =
        "flex";

    }

    setLoginStatus("");

    /*
       لا ندخل إلى الشات مباشرة.
       أولاً قائمة الغرف.
    */

    showRoomSelector();

    updateChatViewport();

  }
);


/* =========================================================
   BANNED / ERRORS
   ========================================================= */

socket.on(
  "banned",
  message => {

    loginPending =
      false;

    showToast(
      message ||
      "❌ تعذر تنفيذ العملية"
    );

    if(
      !currentUser
    ){

      setLoginStatus(
        message ||
        "تعذر الدخول",
        true
      );

    }

  }
);


socket.on(
  "room error",
  message => {

    showToast(
      message ||
      "❌ حدث خطأ في الغرفة"
    );

  }
);


socket.on(
  "disconnect",
  () => {

    if(currentUser){

      showToast(
        "⚠️ انقطع الاتصال بالخادم"
      );

    }

  }
);


/* =========================================================
   ROOM UI
   ========================================================= */

let roomSelector;
let roomTabs;
let roomAdminBar;
let privateButton;


function createRoomSystem(){

  /*
     نحاول وضع النظام داخل chatPage
  */

  if(!chatPage){
    return;
  }

  /*
     Room selector
  */

  roomSelector =
    document.createElement(
      "div"
    );

  roomSelector.id =
    "mersalRoomSelector";

  roomSelector.style.cssText = `
    position:absolute;
    inset:0;
    z-index:5000;
    background:#080808;
    color:#fff;
    display:none;
    flex-direction:column;
    overflow:auto;
    padding:20px;
    box-sizing:border-box;
  `;


  roomSelector.innerHTML = `

    <div style="
      max-width:900px;
      width:100%;
      margin:0 auto;
    ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:20px;
      ">

        <div>

          <div style="
            font-size:25px;
            font-weight:bold;
          ">
            🏠 غرف مرسال
          </div>

          <div style="
            color:#aaa;
            margin-top:5px;
          ">
            اختر الغرفة التي تريد الدخول إليها
          </div>

        </div>

        <div style="
          font-size:14px;
          color:#aaa;
        ">
          👤 ${escapeHtml(
            currentUser || ""
          )}
        </div>

      </div>

      <div
        id="mersalRoomsGrid"
        style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(230px,1fr)
            );
          gap:14px;
        "
      ></div>

    </div>
  `;


  chatPage.style.position =
    "relative";

  chatPage.appendChild(
    roomSelector
  );


  /*
     Room tabs
  */

  roomTabs =
    document.createElement(
      "div"
    );

  roomTabs.id =
    "mersalRoomTabs";

  roomTabs.style.cssText = `
    display:none;
    width:100%;
    overflow-x:auto;
    gap:7px;
    padding:7px;
    box-sizing:border-box;
    background:#0c0c0c;
    border-bottom:1px solid rgba(255,255,255,.08);
    scrollbar-width:none;
  `;


  /*
     نضع التبويبات أعلى chatPage
  */

  chatPage.insertBefore(
    roomTabs,
    chatPage.firstChild
  );


  /*
     Admin bar
  */

  roomAdminBar =
    document.createElement(
      "div"
    );

  roomAdminBar.id =
    "mersalRoomAdminBar";

  roomAdminBar.style.cssText = `
    display:none;
    width:100%;
    overflow-x:auto;
    gap:6px;
    padding:6px;
    box-sizing:border-box;
    background:#111;
    border-bottom:1px solid rgba(255,215,0,.15);
  `;

  chatPage.insertBefore(
    roomAdminBar,
    chatPage.firstChild
  );


  /*
     Private icon
  */

  privateButton =
    document.createElement(
      "button"
    );

  privateButton.id =
    "mersalPrivateButton";

  privateButton.innerHTML =
    "💬 الخاص";

  privateButton.style.cssText = `
    position:fixed;
    right:14px;
    bottom:90px;
    z-index:4000;
    border:none;
    border-radius:18px;
    padding:10px 14px;
    background:#151515;
    color:#fff;
    border:1px solid rgba(255,255,255,.12);
    cursor:pointer;
  `;

  privateButton.addEventListener(
    "click",
    openPrivateList
  );

  chatPage.appendChild(
    privateButton
  );


  /*
     Swipe
  */

  chatPage.addEventListener(
    "touchstart",
    e => {

      roomTouchStartX =
        e.changedTouches[0].screenX;

    },
    {
      passive:true
    }
  );


  chatPage.addEventListener(
    "touchend",
    e => {

      roomTouchEndX =
        e.changedTouches[0].screenX;

      handleRoomSwipe();

    },
    {
      passive:true
    }
  );

}


function handleRoomSwipe(){

  const difference =
    roomTouchEndX -
    roomTouchStartX;

  if(
    Math.abs(
      difference
    ) < 70
  ){

    return;
  }

  if(
    difference < 0
  ){

    switchRoomBy(
      1
    );

  }else{

    switchRoomBy(
      -1
    );

  }

}


/* =========================================================
   ROOM SELECTOR
   ========================================================= */

function showRoomSelector(){

  if(!roomSelector){

    createRoomSystem();

  }

  roomSelector.style.display =
    "flex";

  if(roomTabs){

    roomTabs.style.display =
      "none";

  }

  if(roomAdminBar){

    roomAdminBar.style.display =
      "none";

  }

  renderRooms();

}


function hideRoomSelector(){

  if(roomSelector){

    roomSelector.style.display =
      "none";

  }

  if(roomTabs){

    roomTabs.style.display =
      "flex";

  }

}


function renderRooms(){

  if(!roomSelector){
    return;
  }

  const grid =
    $("mersalRoomsGrid");

  if(!grid){
    return;
  }

  grid.innerHTML =
    "";

  if(!rooms.length){

    grid.innerHTML = `

      <div style="
        grid-column:1/-1;
        padding:30px;
        text-align:center;
        color:#aaa;
      ">

        💤 لا توجد غرف مفعلة حالياً

      </div>

    `;

    return;
  }


  rooms
    .filter(
      room =>
        room.enabled !== false
    )
    .forEach(
      room => {

        const card =
          document.createElement(
            "button"
          );

        card.type =
          "button";

        card.style.cssText = `
          text-align:right;
          border:1px solid rgba(255,255,255,.10);
          background:#111;
          color:#fff;
          border-radius:18px;
          padding:18px;
          cursor:pointer;
          min-height:125px;
        `;

        card.innerHTML = `

          <div style="
            font-size:21px;
            font-weight:bold;
            margin-bottom:8px;
          ">
            🏠 ${escapeHtml(
              room.name
            )}
          </div>

          <div style="
            color:#aaa;
            line-height:1.6;
          ">
            ${escapeHtml(
              room.description ||
              "بدون وصف"
            )}
          </div>

          <div style="
            margin-top:12px;
            color:#777;
            font-size:12px;
          ">
            اضغط للدخول
          </div>

        `;

        card.addEventListener(
          "click",
          () =>
            openPublicRoom(
              room.id
            )
        );

        grid.appendChild(
          card
        );

      }
    );

}


socket.on(
  "rooms list",
  list => {

    rooms =
      Array.isArray(list)
        ? list
        : [];

    if(
      roomSelector &&
      roomSelector.style.display !==
        "none"
    ){

      renderRooms();

    }

  }
);


/* =========================================================
   OPEN PUBLIC ROOM
   ========================================================= */

function openPublicRoom(
  roomId
){

  const room =
    rooms.find(
      item =>
        String(item.id) ===
        String(roomId)
    );

  if(!room){
    return;
  }


  /*
     Maximum 3 public rooms
  */

  if(
    !openRooms.includes(
      String(roomId)
    ) &&
    openRooms.length >= 3
  ){

    showToast(
      "⚠️ يمكنك فتح 3 غرف عامة كحد أقصى"
    );

    return;

  }


  if(
    !openRooms.includes(
      String(roomId)
    )
  ){

    openRooms.push(
      String(roomId)
    );

    roomMessages[
      String(roomId)
    ] ||= [];

    roomScrollPositions[
      String(roomId)
    ] ||= 0;

  }


  socket.emit(
    "join room",
    roomId
  );

}


socket.on(
  "room joined",
  data => {

    const room =
      data?.room;

    if(!room){
      return;
    }

    currentRoomId =
      String(room.id);

    currentTab =
      "room:" +
      currentRoomId;

    roomMessages[
      currentRoomId
    ] ||= [];


    hideRoomSelector();

    renderRoomTabs();

    showPublicRoomInterface();

    renderRoomMessages(
      currentRoomId
    );

    updateRoomAdminBar();

    showToast(
      `🏠 دخلت ${room.name}`
    );

    requestAnimationFrame(
      () =>
        focusMessageInput()
    );

  }
);


/* =========================================================
   ROOM TABS
   ========================================================= */

function renderRoomTabs(){

  if(!roomTabs){
    return;
  }

  roomTabs.innerHTML =
    "";


  /*
     Public rooms
  */

  openRooms.forEach(
    roomId => {

      const room =
        rooms.find(
          item =>
            String(
              item.id
            ) ===
            String(roomId)
        );

      if(!room){
        return;
      }

      const tab =
        document.createElement(
          "div"
        );

      tab.style.cssText = `
        display:flex;
        align-items:center;
        gap:7px;
        flex:0 0 auto;
        border-radius:13px;
        padding:7px 8px 7px 12px;
        background:${
          currentTab ===
          "room:" + roomId
            ? "#242424"
            : "#111"
        };
        color:#fff;
        border:1px solid rgba(255,255,255,.08);
      `;

      const open =
        document.createElement(
          "button"
        );

      open.type =
        "button";

      open.textContent =
        "🏠 " +
        room.name;

      open.style.cssText = `
        background:none;
        border:none;
        color:#fff;
        cursor:pointer;
      `;

      open.onclick =
        () =>
          switchToRoom(
            roomId
          );


      const close =
        document.createElement(
          "button"
        );

      close.type =
        "button";

      close.textContent =
        "✕";

      close.style.cssText = `
        background:none;
        border:none;
        color:#aaa;
        cursor:pointer;
        padding:2px 4px;
      `;

      close.onclick =
        e => {

          e.stopPropagation();

          closePublicRoom(
            roomId
          );

        };


      tab.append(
        open,
        close
      );

      roomTabs.appendChild(
        tab
      );

    }
  );


  /*
     Plus button
  */

  const plus =
    document.createElement(
      "button"
    );

  plus.type =
    "button";

  plus.textContent =
    "＋";

  plus.title =
    "فتح غرفة";

  plus.style.cssText = `
    flex:0 0 auto;
    border:1px solid rgba(255,255,255,.1);
    background:#151515;
    color:#fff;
    border-radius:13px;
    min-width:45px;
    cursor:pointer;
  `;

  plus.onclick =
    showRoomSelector;

  roomTabs.appendChild(
    plus
  );


  /*
     Private tabs
  */

  Object.keys(
    privateChats
  ).forEach(
    userId => {

      const chat =
        privateChats[
          userId
        ];

      const tab =
        document.createElement(
          "div"
        );

      tab.style.cssText = `
        display:flex;
        align-items:center;
        gap:7px;
        flex:0 0 auto;
        border-radius:13px;
        padding:7px 8px 7px 12px;
        background:${
          currentTab ===
          "private:" + userId
            ? "#242424"
            : "#111"
        };
        border:1px solid rgba(255,255,255,.08);
      `;


      const unread =
        unreadPrivate[
          userId
        ] || 0;


      const open =
        document.createElement(
          "button"
        );

      open.type =
        "button";

      open.innerHTML =
        `💬 ${escapeHtml(
          chat.name
        )}${
          unread
            ? ` <b style="color:#ff5252">(${unread})</b>`
            : ""
        }`;

      open.style.cssText = `
        background:none;
        border:none;
        color:#fff;
        cursor:pointer;
      `;

      open.onclick =
        () =>
          switchToPrivate(
            userId
          );


      const close =
        document.createElement(
          "button"
        );

      close.type =
        "button";

      close.textContent =
        "✕";

      close.style.cssText = `
        background:none;
        border:none;
        color:#aaa;
        cursor:pointer;
      `;

      close.onclick =
        e => {

          e.stopPropagation();

          closePrivateTab(
            userId
          );

        };


      tab.append(
        open,
        close
      );

      roomTabs.appendChild(
        tab
      );

    }
  );

}


/* =========================================================
   SWITCH ROOM
   ========================================================= */

function switchToRoom(
  roomId
){

  roomId =
    String(roomId);

  if(
    !openRooms.includes(
      roomId
    )
  ){

    return;
  }

  saveCurrentScroll();

  currentRoomId =
    roomId;

  currentTab =
    "room:" +
    roomId;

  socket.emit(
    "join room",
    roomId
  );

  renderRoomTabs();

  showPublicRoomInterface();

  renderRoomMessages(
    roomId
  );

  updateRoomAdminBar();

}


function switchRoomBy(
  direction
){

  const tabs = [
    ...openRooms.map(
      id =>
        "room:" + id
    ),
    ...Object.keys(
      privateChats
    ).map(
      id =>
        "private:" + id
    )
  ];

  if(!tabs.length){
    return;
  }

  let index =
    tabs.indexOf(
      currentTab
    );

  if(index < 0){
    index = 0;
  }

  index += direction;

  if(
    index < 0
  ){

    index =
      tabs.length - 1;

  }

  if(
    index >= tabs.length
  ){

    index = 0;

  }

  const tab =
    tabs[index];

  if(
    tab.startsWith(
      "room:"
    )
  ){

    switchToRoom(
      tab.replace(
        "room:",
        ""
      )
    );

  }else{

    switchToPrivate(
      tab.replace(
        "private:",
        ""
      )
    );

  }

}


/* =========================================================
   CLOSE PUBLIC ROOM
   ========================================================= */

function closePublicRoom(
  roomId
){

  roomId =
    String(roomId);

  const index =
    openRooms.indexOf(
      roomId
    );

  if(index < 0){
    return;
  }

  saveCurrentScroll();

  openRooms.splice(
    index,
    1
  );


  if(
    currentTab ===
    "room:" + roomId
  ){

    if(openRooms.length){

      switchToRoom(
        openRooms[
          Math.max(
            0,
            index - 1
          )
        ]
      );

    }else{

      currentRoomId =
        null;

      currentTab =
        null;

      socket.emit(
        "leave room"
      );

      showRoomSelector();

      clearMessages();

    }

  }


  renderRoomTabs();

}


/* =========================================================
   PUBLIC INTERFACE
   ========================================================= */

function showPublicRoomInterface(){

  if(messages){

    messages.style.display =
      "block";

  }

  const box =
    document.querySelector(
      ".message-box"
    );

  if(box){

    box.style.display =
      "flex";

  }

  if(privateMessages){

    privateMessages.style.display =
      "none";

  }

}


function clearMessages(){

  if(messages){

    messages.innerHTML =
      "";

  }

}


/* =========================================================
   ROOM MESSAGE STORAGE
   ========================================================= */

function saveCurrentScroll(){

  if(
    currentTab &&
    currentTab.startsWith(
      "room:"
    ) &&
    messages
  ){

    const roomId =
      currentTab.replace(
        "room:",
        ""
      );

    roomScrollPositions[
      roomId
    ] =
      messages.scrollTop;

  }

}


/* =========================================================
   RECEIVE MESSAGE
   ========================================================= */

socket.on(
  "chat message",
  data => {

    const roomId =
      String(
        data.roomId ||
        currentRoomId ||
        ""
      );

    if(!roomId){
      return;
    }

    roomMessages[
      roomId
    ] ||= [];

    roomMessages[
      roomId
    ].push(
      data
    );


    /*
       لا نعرض الرسالة
       إذا ليست الغرفة الحالية.
    */

    if(
      currentTab !==
      "room:" + roomId
    ){

      return;
    }

    renderRoomMessages(
      roomId,
      true
    );

  }
);


/* =========================================================
   RENDER ROOM MESSAGES
   ========================================================= */

function renderRoomMessages(
  roomId,
  keepBottom = false
){

  if(!messages){
    return;
  }

  roomId =
    String(roomId);

  messages.innerHTML =
    "";


  const list =
    roomMessages[
      roomId
    ] || [];


  list.forEach(
    data =>
      appendPublicMessage(
        data
      )
  );


  if(keepBottom){

    messages.scrollTop =
      messages.scrollHeight;

  }else{

    messages.scrollTop =
      roomScrollPositions[
        roomId
      ] || 0;

  }

}


function appendPublicMessage(
  data
){

  const div =
    document.createElement(
      "div"
    );

  div.className =
    "message";


  if(
    data.username ===
    currentUser
  ){

    div.classList.add(
      "my-message"
    );

  }


  const user =
    document.createElement(
      "div"
    );

  user.className =
    "message-user";

  user.style.color =
    data.color ||
    "#ffd700";

  user.textContent =
    `${
      data.role
        ? data.role + " "
        : ""
    }${
      data.username ||
      "مستخدم"
    }`;


  user.addEventListener(
    "click",
    () =>
      showUserPopup(
        data
      )
  );


  div.appendChild(
    user
  );


  if(data.reply){

    const reply =
      document.createElement(
        "div"
      );

    reply.className =
      "reply-preview";

    reply.textContent =
      `↩️ ${
        data.reply.user ||
        ""
      }: ${
        data.reply.text ||
        ""
      }`;

    div.appendChild(
      reply
    );

  }


  const text =
    document.createElement(
      "div"
    );

  text.className =
    "message-text";

  text.textContent =
    data.message ||
    "";


  div.appendChild(
    text
  );


  messages.appendChild(
    div
  );

}


/* =========================================================
   SEND PUBLIC MESSAGE
   ========================================================= */

function sendMessage(){

  if(
    !currentRoomId
  ){

    showToast(
      "🏠 اختر غرفة أولاً"
    );

    return;
  }

  if(!messageInput){
    return;
  }

  const text =
    messageInput.value.trim();

  if(!text){
    return;
  }


  socket.emit(
    "chat message",
    {

      roomId:
        currentRoomId,

      message:
        text,

      reply:
        replyData

    }
  );


  messageInput.value =
    "";

  cancelReply();


  requestAnimationFrame(
    () => {

      messageInput.focus();

      keepChatBottom();

    }
  );

}

window.sendMessage =
  sendMessage;


/* =========================================================
   ENTER SEND
   ========================================================= */

if(messageInput){

  messageInput.addEventListener(
    "keydown",
    e => {

      if(
        e.key ===
          "Enter" &&
        !e.shiftKey
      ){

        e.preventDefault();

        sendMessage();

      }

    }
  );

}


/* =========================================================
   KEEP CHAT BOTTOM
   ========================================================= */

function keepChatBottom(){

  requestAnimationFrame(
    () => {

      if(
        currentTab &&
        currentTab.startsWith(
          "room:"
        ) &&
        messages
      ){

        messages.scrollTop =
          messages.scrollHeight;

      }

      if(
        privateMessages
      ){

        privateMessages.scrollTop =
          privateMessages.scrollHeight;

      }

    }
  );

}


/* =========================================================
   USERS
   ========================================================= */

socket.on(
  "room users",
  users => {

    usersCache =
      Array.isArray(
        users
      )
        ? users
        : [];

    renderUsers();

  }
);


socket.on(
  "online users",
  users => {

    /*
       احتياط للتوافق
       مع السيرفر القديم.
    */

    if(
      Array.isArray(users)
    ){

      usersCache =
        users.filter(
          user =>
            !currentRoomId ||
            String(
              user.roomId
            ) ===
            String(
              currentRoomId
            )
        );

      renderUsers();

    }

  }
);


function renderUsers(){

  if(!usersList){
    return;
  }

  usersList.innerHTML =
    "";


  usersCache.forEach(
    user => {

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "user-item";


      div.innerHTML =
        `👤 ${
          user.role
            ? user.role + " "
            : ""
        }${
          escapeHtml(
            user.username
          )
        }`;


      div.addEventListener(
        "click",
        () =>
          showUserPopup(
            user
          )
      );


      usersList.appendChild(
        div
      );

    }
  );

}


/* =========================================================
   USERS MENU
   ========================================================= */

function openUsers(){

  if(!usersMenu){
    return;
  }

  renderUsers();

  usersMenu.style.display =
    "flex";

  requestAnimationFrame(
    () => {

      usersMenu.classList.add(
        "show"
      );

    }
  );

}

window.openUsers =
  openUsers;


function closeUsers(){

  if(!usersMenu){
    return;
  }

  usersMenu.classList.remove(
    "show"
  );

  setTimeout(
    () => {

      if(
        !usersMenu.classList.contains(
          "show"
        )
      ){

        usersMenu.style.display =
          "none";

      }

    },
    230
  );

}

window.closeUsers =
  closeUsers;


/* =========================================================
   USER POPUP
   ========================================================= */

function showUserPopup(
  user
){

  closeUsers();

  const overlay =
    $("userPopupOverlay");

  const title =
    $("popupUsername");

  const buttons =
    $("popupButtons");


  if(!overlay){
    return;
  }


  if(title){

    title.textContent =
      `👤 ${
        user.role
          ? user.role + " "
          : ""
      }${
        user.username ||
        "مستخدم"
      }`;

  }


  if(!buttons){
    return;
  }


  buttons.innerHTML =
    "";


  /*
     Copy
  */

  const copyBtn =
    document.createElement(
      "button"
    );

  copyBtn.textContent =
    "📋 نسخ الاسم";

  copyBtn.onclick =
    () =>
      copyName(
        user.username
      );


  /*
     Reply
  */

  const replyBtn =
    document.createElement(
      "button"
    );

  replyBtn.textContent =
    "↩️ رد";

  replyBtn.onclick =
    () =>
      replyTo(
        user.username,
        user.message ||
        ""
      );


  /*
     Private
  */

  const privateBtn =
    document.createElement(
      "button"
    );

  privateBtn.textContent =
    "💬 مرسال خاص";

  privateBtn.onclick =
    () =>
      openPrivate(
        user.id,
        user.username
      );


  buttons.append(
    copyBtn,
    replyBtn,
    privateBtn
  );


  /*
     Admin moderation
  */

  if(
    isAdmin &&
    user.id !==
      currentUserId
  ){

    const separator =
      document.createElement(
        "div"
      );

    separator.style.cssText = `
      height:1px;
      background:rgba(255,255,255,.1);
      margin:8px 0;
    `;

    buttons.appendChild(
      separator
    );


    addModerationButton(
      buttons,
      "👢 طرد من الغرفة",
      "kick",
      user
    );


    addModerationButton(
      buttons,
      "🚫 حظر من الغرفة",
      "ban",
      user
    );


    addModerationButton(
      buttons,
      "🔇 كتم",
      "mute",
      user
    );


    addModerationButton(
      buttons,
      "⛔ فصل",
      "disconnect",
      user
    );


    addModerationButton(
      buttons,
      "⭐ إعطاء نجمة",
      "star",
      user
    );


    addModerationButton(
      buttons,
      "⭐❌ سحب النجمة",
      "unstar",
      user
    );

  }


  overlay.style.display =
    "flex";

}

window.showUserPopup =
  showUserPopup;


function addModerationButton(
  parent,
  text,
  action,
  user
){

  const button =
    document.createElement(
      "button"
    );

  button.textContent =
    text;

  button.onclick =
    () => {

      if(
        !currentRoomId
      ){
        return;
      }


      if(
        action ===
        "star"
      ){

        socket.emit(
          "give star",
          user.username
        );

      }


      else if(
        action ===
        "unstar"
      ){

        socket.emit(
          "remove star",
          user.username
        );

      }


      else{

        socket.emit(
          action +
            " user",
          user.id
        );

      }


      closeUserPopup();

    };


  parent.appendChild(
    button
  );

}


function closeUserPopup(){

  const overlay =
    $("userPopupOverlay");

  if(overlay){

    overlay.style.display =
      "none";

  }

}

window.closeUserPopup =
  closeUserPopup;


/* =========================================================
   COPY
   ========================================================= */

async function copyName(
  name
){

  try{

    await navigator.clipboard.writeText(
      name || ""
    );

    showToast(
      "✅ تم نسخ الاسم"
    );

  }catch{

    showToast(
      "❌ تعذر نسخ الاسم"
    );

  }

  closeUserPopup();

}

window.copyName =
  copyName;


/* =========================================================
   REPLY
   ========================================================= */

function replyTo(
  user,
  text
){

  closeUsers();

  closeUserPopup();

  replyData = {

    user:
      user,

    text:
      text

  };


  const replyBox =
    $("replyBox");

  const replyText =
    $("replyText");


  if(replyBox){

    replyBox.style.display =
      "flex";

  }


  if(replyText){

    replyText.textContent =
      `↩️ ${user}: ${text}`;

  }


  messageInput?.focus();

}

window.replyTo =
  replyTo;


function cancelReply(){

  replyData =
    null;

  const replyBox =
    $("replyBox");

  if(replyBox){

    replyBox.style.display =
      "none";

  }

}

window.cancelReply =
  cancelReply;


/* =========================================================
   PRIVATE CHAT
   ========================================================= */

function openPrivate(
  id,
  name
){

  if(
    !id ||
    id === currentUserId
  ){

    return;
  }


  const userId =
    String(id);


  privateChats[
    userId
  ] ||= {

    id:
      userId,

    name:
      name ||
      "مستخدم",

    messages:
      []

  };


  privateChats[
    userId
  ].name =
    name ||
    privateChats[
      userId
    ].name;


  unreadPrivate[
    userId
  ] = 0;


  currentTab =
    "private:" +
    userId;


  currentRoomId =
    null;


  /*
     server socket
     remains connected
     to public room only
     until another room.
  */


  renderRoomTabs();

  renderPrivateChat(
    userId
  );

  closeUsers();

  closeUserPopup();

}

window.openPrivate =
  openPrivate;


/* =========================================================
   PRIVATE LIST
   ========================================================= */

function openPrivateList(){

  if(!usersCache.length){

    showToast(
      "لا يوجد مستخدمون في الغرفة"
    );

    return;
  }


  if(menuTitle){

    menuTitle.textContent =
      "💬 اختر شخصًا للمراسلة";

  }


  if(usersList){

    usersList.innerHTML =
      "";

  }


  usersCache
    .filter(
      user =>
        user.id !==
        currentUserId
    )
    .forEach(
      user => {

        const div =
          document.createElement(
            "div"
          );

        div.className =
          "user-item";

        div.innerHTML =
          `💬 ${
            user.role
              ? user.role + " "
              : ""
          }${
            escapeHtml(
              user.username
            )
          }`;

        div.onclick =
          () =>
            openPrivate(
              user.id,
              user.username
            );

        usersList?.appendChild(
          div
        );

      }
    );


  if(usersMenu){

    usersMenu.style.display =
      "flex";

    requestAnimationFrame(
      () =>
        usersMenu.classList.add(
          "show"
        )
    );

  }

}

window.openPrivateList =
  openPrivateList;


/* =========================================================
   PRIVATE CHAT RENDER
   ========================================================= */

function renderPrivateChat(
  userId
){

  /*
     نخفي public
  */

  if(messages){

    messages.style.display =
      "none";

  }

  const publicBox =
    document.querySelector(
      ".message-box"
    );

  if(publicBox){

    publicBox.style.display =
      "none";

  }


  if(privateMessages){

    privateMessages.style.display =
      "block";

  }


  /*
     إذا HTML عنده privateChatBox
     نستعمله كحاوية.
  */

  const privateBox =
    $("privateChatBox");


  if(privateBox){

    privateBox.style.display =
      "flex";

  }


  const chat =
    privateChats[
      userId
    ];

  if(!chat){
    return;
  }


  /*
     العنوان
  */

  const title =
    $("privateTitle");

  if(title){

    title.textContent =
      `💬 ${chat.name}`;

  }


  if(privateMessages){

    privateMessages.innerHTML =
      "";


    /*
       أول رسالة تعريفية
    */

    if(
      chat.messages.length ===
      0
    ){

      const notice =
        document.createElement(
          "div"
        );

      notice.style.cssText = `
        text-align:center;
        color:#999;
        padding:15px;
        font-size:13px;
      `;

      notice.textContent =
        `💬 أنت الآن في محادثة خاصة مع ${chat.name}`;

      privateMessages.appendChild(
        notice
      );

    }


    chat.messages.forEach(
      message =>
        appendPrivateMessage(
          message
        )
    );


    privateMessages.scrollTop =
      privateMessages.scrollHeight;

  }


  /*
     input
  */

  setTimeout(
    () => {

      privateInput?.focus();

    },
    100
  );

}


/* =========================================================
   APPEND PRIVATE MESSAGE
   ========================================================= */

function appendPrivateMessage(
  data
){

  if(!privateMessages){
    return;
  }

  const div =
    document.createElement(
      "div"
    );

  div.className =
    "private-message " +
    (
      data.mine
        ? "me"
        : "other"
    );


  const name =
    document.createElement(
      "div"
    );

  name.className =
    "private-name";

  name.textContent =
    data.from ||
    currentUser ||
    "مستخدم";


  const text =
    document.createElement(
      "div"
    );

  text.textContent =
    data.message ||
    "";


  div.append(
    name,
    text
  );


  privateMessages.appendChild(
    div
  );

}


/* =========================================================
   SEND PRIVATE
   ========================================================= */

function sendPrivate(){

  if(
    !currentTab ||
    !currentTab.startsWith(
      "private:"
    )
  ){

    return;
  }


  const userId =
    currentTab.replace(
      "private:",
      ""
    );


  if(!privateInput){
    return;
  }


  const text =
    privateInput.value.trim();

  if(!text){
    return;
  }


  const chat =
    privateChats[
      userId
    ];


  if(!chat){
    return;
  }


  socket.emit(
    "private message",
    {

      to:
        userId,

      from:
        currentUser,

      message:
        text

    }
  );


  const message = {

    from:
      currentUser,

    message:
      text,

    mine:
      true

  };


  chat.messages.push(
    message
  );


  appendPrivateMessage(
    message
  );


  privateInput.value =
    "";


  requestAnimationFrame(
    () => {

      privateInput.focus();

      if(privateMessages){

        privateMessages.scrollTop =
          privateMessages.scrollHeight;

      }

    }
  );

}

window.sendPrivate =
  sendPrivate;


if(privateInput){

  privateInput.addEventListener(
    "keydown",
    e => {

      if(
        e.key ===
        "Enter"
      ){

        e.preventDefault();

        sendPrivate();

      }

    }
  );

}


/* =========================================================
   RECEIVE PRIVATE
   ========================================================= */

socket.on(
  "private message",
  data => {

    /*
       نحاول معرفة المرسل
       من usersCache.
    */

    let senderId =
      data.fromId ||
      null;


    if(!senderId){

      const found =
        usersCache.find(
          user =>
            user.username ===
            data.from
        );

      if(found){

        senderId =
          found.id;

      }

    }


    /*
       إذا لم نجد ID
       لا نضيع الرسالة.
    */

    if(!senderId){

      showToast(
        `💬 رسالة خاصة من ${
          data.from ||
          "مستخدم"
        }`
      );

      return;

    }


    senderId =
      String(
        senderId
      );


    privateChats[
      senderId
    ] ||= {

      id:
        senderId,

      name:
        data.from ||
        "مستخدم",

      messages:
        []

    };


    privateChats[
      senderId
    ].messages.push({

      from:
        data.from,

      message:
        data.message,

      mine:
        false

    });


    /*
       إذا المحادثة ليست الحالية
       يزيد العداد.
    */

    if(
      currentTab !==
      "private:" +
      senderId
    ){

      unreadPrivate[
        senderId
      ] =
        (
          unreadPrivate[
            senderId
          ] || 0
        ) + 1;


      showToast(
        `💬 رسالة خاصة من ${data.from}`
      );

    }


    renderRoomTabs();


    if(
      currentTab ===
      "private:" +
      senderId
    ){

      renderPrivateChat(
        senderId
      );

    }

  }
);


/* =========================================================
   SWITCH PRIVATE
   ========================================================= */

function switchToPrivate(
  userId
){

  userId =
    String(userId);

  if(
    !privateChats[
      userId
    ]
  ){

    return;
  }


  saveCurrentScroll();

  currentTab =
    "private:" +
    userId;

  currentRoomId =
    null;


  renderRoomTabs();

  renderPrivateChat(
    userId
  );

}

window.switchToPrivate =
  switchToPrivate;


/* =========================================================
   CLOSE PRIVATE TAB
   ========================================================= */

function closePrivateTab(
  userId
){

  userId =
    String(userId);


  delete privateChats[
    userId
  ];

  delete unreadPrivate[
    userId
  ];


  if(
    currentTab ===
    "private:" +
    userId
  ){

    if(
      openRooms.length
    ){

      switchToRoom(
        openRooms[0]
      );

    }else{

      currentTab =
        null;

      showRoomSelector();

    }

  }


  renderRoomTabs();

}

window.closePrivateTab =
  closePrivateTab;


/* =========================================================
   PRIVATE OLD MODAL COMPATIBILITY
   ========================================================= */

function closePrivate(){

  const box =
    $("privateChatBox");

  if(box){

    box.style.display =
      "none";

  }

  /*
     لا نحذف التبويب.
     فقط نرجع للغرفة.
  */

  if(
    currentRoomId
  ){

    currentTab =
      "room:" +
      currentRoomId;

    showPublicRoomInterface();

  }

}

window.closePrivate =
  closePrivate;


/* =========================================================
   ADMIN ROOM BAR
   ========================================================= */

socket.on(
  "room admin active",
  data => {

    if(!data){
      return;
    }

    isAdmin =
      true;

    adminPermissions =
      data.permissions ||
      {};

    renderRoomAdminBar();

  }
);


function updateRoomAdminBar(){

  if(
    !isAdmin ||
    !currentRoomId
  ){

    if(roomAdminBar){

      roomAdminBar.style.display =
        "none";

    }

    return;

  }

  renderRoomAdminBar();

}


function renderRoomAdminBar(){

  if(
    !roomAdminBar ||
    !currentRoomId ||
    !isAdmin
  ){

    return;
  }


  roomAdminBar.innerHTML =
    "";


  const room =
    rooms.find(
      item =>
        String(
          item.id
        ) ===
        String(
          currentRoomId
        )
    );


  if(!room){
    return;
  }


  roomAdminBar.style.display =
    "flex";


  /*
     stars
  */

  if(
    adminPermissions.stars
  ){

    addAdminToggle(
      "⭐ النجوم",
      "starsMode",
      room.settings?.starsMode
    );

  }


  /*
     lock
  */

  if(
    adminPermissions.chatLock
  ){

    addAdminToggle(
      "🔒 القفل",
      "chatLocked",
      room.settings?.chatLocked
    );

  }


  /*
     maintenance
  */

  if(
    adminPermissions.maintenance
  ){

    addAdminToggle(
      "🛠️ الصيانة",
      "maintenance",
      room.settings?.maintenance
    );

  }


  /*
     protection
  */

  if(
    adminPermissions.protection
  ){

    addAdminToggle(
      "🛡️ الحماية",
      "protection",
      room.settings?.protection
    );

  }

}


function addAdminToggle(
  label,
  key,
  enabled
){

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.textContent =
    `${label}: ${
      enabled
        ? "ON"
        : "OFF"
    }`;

  button.style.cssText = `
    flex:0 0 auto;
    border:1px solid ${
      enabled
        ? "rgba(255,215,0,.5)"
        : "rgba(255,255,255,.1)"
    };
    background:${
      enabled
        ? "rgba(255,215,0,.10)"
        : "#151515"
    };
    color:#fff;
    border-radius:10px;
    padding:7px 10px;
    cursor:pointer;
  `;


  button.onclick =
    () => {

      socket.emit(
        "update room setting",
        {

          roomId:
            currentRoomId,

          key:
            key,

          value:
            !enabled

        }
      );

    };


  roomAdminBar.appendChild(
    button
  );

}


/* =========================================================
   ROOM SETTINGS UPDATE
   ========================================================= */

socket.on(
  "room settings",
  settings => {

    if(!currentRoomId){
      return;
    }


    const room =
      rooms.find(
        item =>
          String(
            item.id
          ) ===
          String(
            currentRoomId
          )
      );


    if(room){

      room.settings =
        settings ||
        {};

    }


    renderRoomAdminBar();

  }
);


/* =========================================================
   MODERATION NOTIFICATIONS
   ========================================================= */

socket.on(
  "room moderation",
  data => {

    if(!data){
      return;
    }

    showToast(
      data.message ||
      "⚙️ تم تنفيذ الإجراء"
    );

    /*
       إضافة إشعار داخل الشات
    */

    if(
      currentRoomId &&
      data.message
    ){

      const notice =
        document.createElement(
          "div"
        );

      notice.style.cssText = `
        text-align:center;
        color:#ffd700;
        padding:8px;
        font-size:13px;
        opacity:.9;
      `;

      notice.textContent =
        data.message;

      messages?.appendChild(
        notice
      );

      if(messages){

        messages.scrollTop =
          messages.scrollHeight;

      }

    }

  }
);


/* =========================================================
   ROOM NOTICE
   ========================================================= */

socket.on(
  "room notice",
  message => {

    showToast(
      message
    );

    if(
      messages &&
      currentRoomId
    ){

      const notice =
        document.createElement(
          "div"
        );

      notice.style.cssText = `
        text-align:center;
        color:#ffd700;
        padding:8px;
        font-size:13px;
      `;

      notice.textContent =
        message;

      messages.appendChild(
        notice
      );

      messages.scrollTop =
        messages.scrollHeight;

    }

  }
);


/* =========================================================
   ROOM DELETED
   ========================================================= */

socket.on(
  "room deleted",
  roomId => {

    roomId =
      String(roomId);


    openRooms =
      openRooms.filter(
        id =>
          String(id) !==
          roomId
      );


    delete roomMessages[
      roomId
    ];


    rooms =
      rooms.filter(
        room =>
          String(
            room.id
          ) !==
          roomId
      );


    if(
      currentRoomId ===
      roomId
    ){

      currentRoomId =
        null;

      currentTab =
        null;

      socket.emit(
        "leave room"
      );

      showRoomSelector();

      clearMessages();

    }


    renderRoomTabs();

    showToast(
      "🗑️ تم حذف هذه الغرفة"
    );

  }
);


/* =========================================================
   STAR UPDATE
   ========================================================= */

socket.on(
  "star update",
  data => {

    if(
      String(
        data?.roomId
      ) !==
      String(
        currentRoomId
      )
    ){

      return;
    }

    showToast(
      data.hasStar
        ? `⭐ تم إعطاء نجمة لـ ${data.username}`
        : `⭐❌ تم سحب النجمة من ${data.username}`
    );

  }
);


/* =========================================================
   ADMIN PERMISSIONS
   ========================================================= */

socket.on(
  "admin login success",
  data => {

    isAdmin =
      true;

    adminPermissions =
      data?.permissions ||
      {};

    adminRooms =
      data?.rooms ||
      [];

  }
);


socket.on(
  "admin assigned rooms",
  roomIds => {

    adminRooms =
      Array.isArray(
        roomIds
      )
        ? roomIds
        : [];

  }
);


/* =========================================================
   ROOM ADMIN GOLD NOTICE
   ========================================================= */

socket.on(
  "room admin active",
  data => {

    if(
      !data
    ){

      return;
    }

    isAdmin =
      true;

    adminPermissions =
      data.permissions ||
      {};

    showToast(
      `✨ تم توكيل ${
        currentUser
      }`
    );

    renderRoomAdminBar();

  }
);


/* =========================================================
   ESC
   ========================================================= */

document.addEventListener(
  "keydown",
  e => {

    if(
      e.key !==
      "Escape"
    ){

      return;
    }


    closeUserPopup();

    closeUsers();

  }
);


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    createRoomSystem();

    if(chatPage){

      chatPage.style.position =
        "relative";

    }

  }
);


/* =========================================================
   INITIAL ROOM REQUEST
   ========================================================= */

socket.on(
  "connect",
  () => {

    if(
      currentUser
    ){

      socket.emit(
        "get rooms"
      );

    }

  }
);


/* =========================================================
   ROOM SCROLL SAVE
   ========================================================= */

if(messages){

  messages.addEventListener(
    "scroll",
    () => {

      if(
        currentTab &&
        currentTab.startsWith(
          "room:"
        )
      ){

        const roomId =
          currentTab.replace(
            "room:",
            ""
          );

        roomScrollPositions[
          roomId
        ] =
          messages.scrollTop;

      }

    }
  );

}


/* =========================================================
   PRIVATE SCROLL
   ========================================================= */

if(privateMessages){

  privateMessages.addEventListener(
    "scroll",
    () => {

      /*
         Private scroll محفوظ
         داخل DOM/session الحالي.
      */

    }
  );

}


/* =========================================================
   FINAL IPHONE SAFETY
   ========================================================= */

window.addEventListener(
  "orientationchange",
  () => {

    setTimeout(
      () => {

        updateChatViewport();

        window.scrollTo(
          0,
          0
        );

      },
      300
    );

  }
);
