/* =========================================================
   MERSAL CHAT - ADMIN.JS
   ROOM MANAGEMENT + ADMIN PERMISSIONS
   ========================================================= */

const socket = io();

/* =========================================================
   GLOBAL
   ========================================================= */

let adminLoggedIn = false;
let adminData = null;
let adminPermissions = {};
let adminRooms = [];

let selectedAdmin = null;
let selectedRoomId = null;
let editingRoomId = null;


/* =========================================================
   HELPERS
   ========================================================= */

function $(id){
  return document.getElementById(id);
}


function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}


function showAdminMessage(message){

  if(typeof alert === "function"){
    alert(message);
  }

}


/* =========================================================
   LOGIN
   ========================================================= */

function adminLogin(){

  const username =
    $("adminUsername")?.value.trim();

  const password =
    $("adminPassword")?.value || "";

  if(!username){

    showAdminMessage(
      "❌ اكتب اسم الأدمن"
    );

    return;

  }

  if(!password){

    showAdminMessage(
      "❌ اكتب كلمة المرور"
    );

    return;

  }


  socket.emit(
    "admin.panel login",
    {
      username,
      password
    }
  );

}

window.adminLogin =
  adminLogin;


/* =========================================================
   ADMIN LOGIN SUCCESS
   ========================================================= */

socket.on(
  "admin login success",
  data => {

    adminLoggedIn =
      true;

    adminData =
      data || {};

    adminPermissions =
      data?.permissions || {};

    adminRooms =
      Array.isArray(
        data?.rooms
      )
        ? data.rooms
        : [];


    /*
       إخفاء شاشة الدخول
    */

    const login =
      $("adminLogin");

    const panel =
      $("adminPanel");


    if(login){

      login.style.display =
        "none";

    }


    if(panel){

      panel.style.display =
        "block";

    }


    updateAdminHeader();

    requestRooms();

    requestAdmins();

    requestUsers();

    requestStats();

    requestLogs();

  }
);


/* =========================================================
   LOGIN ERROR
   ========================================================= */

socket.on(
  "admin login error",
  message => {

    adminLoggedIn =
      false;

    showAdminMessage(
      message ||
      "❌ بيانات الدخول غير صحيحة"
    );

  }
);


/* =========================================================
   HEADER
   ========================================================= */

function updateAdminHeader(){

  const name =
    adminData?.username ||
    adminData?.name ||
    "";

  const role =
    adminData?.role ||
    "";


  const element =
    $("adminName");

  if(element){

    element.textContent =
      `${role === "master" ? "👑" : "🛡️"} ${name}`;

  }


  const roleElement =
    $("adminRole");

  if(roleElement){

    roleElement.textContent =
      role === "master"
        ? "Master Admin"
        : "Moderator";

  }

}


/* =========================================================
   ROOMS
   ========================================================= */

function requestRooms(){

  if(!adminLoggedIn){
    return;
  }

  socket.emit(
    "get admin rooms"
  );

}

window.requestRooms =
  requestRooms;


socket.on(
  "admin rooms",
  list => {

    adminRooms =
      Array.isArray(list)
        ? list
        : [];

    renderRooms();

    renderRoomSelectors();

  }
);


/* =========================================================
   ROOM FORM
   ========================================================= */

function saveRoom(){

  if(
    !adminData
  ){

    showAdminMessage(
      "❌ سجل الدخول أولاً"
    );

    return;

  }


  const name =
    $("roomName")
      ?.value
      ?.trim();

  const description =
    $("roomDescription")
      ?.value
      ?.trim();


  if(!name){

    showAdminMessage(
      "❌ اكتب اسم الغرفة"
    );

    return;

  }


  if(editingRoomId){

    socket.emit(
      "update room",
      {

        id:
          editingRoomId,

        name:
          name,

        description:
          description

      }
    );

  }else{

    socket.emit(
      "create room",
      {

        name:
          name,

        description:
          description

      }
    );

  }


  clearRoomForm();

}

window.saveRoom =
  saveRoom;


/* =========================================================
   EDIT ROOM
   ========================================================= */

function editRoom(
  id,
  name,
  description
){

  editingRoomId =
    id;

  const nameInput =
    $("roomName");

  const descriptionInput =
    $("roomDescription");

  const button =
    $("roomSaveButton");


  if(nameInput){

    nameInput.value =
      name || "";

  }


  if(descriptionInput){

    descriptionInput.value =
      description || "";

  }


  if(button){

    button.innerText =
      "💾 حفظ التعديل";

  }


  nameInput?.focus();

}

window.editRoom =
  editRoom;


/* =========================================================
   CLEAR ROOM FORM
   ========================================================= */

function clearRoomForm(){

  editingRoomId =
    null;

  const nameInput =
    $("roomName");

  const descriptionInput =
    $("roomDescription");

  const button =
    $("roomSaveButton");


  if(nameInput){

    nameInput.value =
      "";

  }


  if(descriptionInput){

    descriptionInput.value =
      "";

  }


  if(button){

    button.innerText =
      "➕ إنشاء الغرفة";

  }

}

window.clearRoomForm =
  clearRoomForm;


/* =========================================================
   TOGGLE ROOM
   ========================================================= */

function toggleRoom(
  roomId
){

  socket.emit(
    "toggle room",
    roomId
  );

}

window.toggleRoom =
  toggleRoom;


/* =========================================================
   DELETE ROOM
   ========================================================= */

function deleteRoom(
  roomId
){

  if(
    !confirm(
      "⚠️ هل تريد حذف هذه الغرفة؟"
    )
  ){

    return;

  }


  socket.emit(
    "delete room",
    roomId
  );

}

window.deleteRoom =
  deleteRoom;


/* =========================================================
   RENDER ROOMS
   ========================================================= */

function renderRooms(){

  const box =
    $("roomsList");

  if(!box){
    return;
  }


  box.innerHTML =
    "";


  if(!adminRooms.length){

    box.innerHTML = `
      <div style="
        padding:20px;
        text-align:center;
        color:#999;
      ">
        لا توجد غرف
      </div>
    `;

    return;

  }


  adminRooms.forEach(
    room => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "user-card";


      const enabled =
        room.enabled !== false;


      card.innerHTML = `

        <div>

          <div style="
            font-size:17px;
            font-weight:bold;
          ">
            🏠 ${escapeHtml(
              room.name
            )}
          </div>

          <div style="
            color:#999;
            margin-top:5px;
          ">
            ${escapeHtml(
              room.description ||
              "بدون وصف"
            )}
          </div>

          <div style="
            margin-top:7px;
            color:${
              enabled
                ? "#7dffb2"
                : "#ff8080"
            };
          ">
            ${
              enabled
                ? "🟢 مفعلة"
                : "🔴 معطلة"
            }
          </div>

        </div>

        <div class="user-actions">

          <button
            onclick="editRoom(
              '${escapeAttr(room.id)}',
              '${escapeAttr(room.name)}',
              '${escapeAttr(room.description || "")}'
            )"
          >
            ✏️ تعديل
          </button>

          <button
            onclick="toggleRoom(
              '${escapeAttr(room.id)}'
            )"
          >
            ${
              enabled
                ? "🔴 تعطيل"
                : "🟢 تفعيل"
            }
          </button>

          <button
            onclick="deleteRoom(
              '${escapeAttr(room.id)}'
            )"
          >
            🗑️ حذف
          </button>

        </div>

      `;


      box.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   ESCAPE ATTR
   ========================================================= */

function escapeAttr(value){

  return String(
    value ?? ""
  )
    .replaceAll(
      "\\",
      "\\\\"
    )
    .replaceAll(
      "'",
      "\\'"
    )
    .replaceAll(
      "\n",
      "\\n"
    )
    .replaceAll(
      "\r",
      "\\r"
    );

}


/* =========================================================
   ROOM SELECTORS
   ========================================================= */

function renderRoomSelectors(){

  const selectors =
    document.querySelectorAll(
      ".admin-room-selector"
    );


  selectors.forEach(
    select => {

      const previous =
        select.value;

      select.innerHTML =
        `
          <option value="">
            اختر الغرفة
          </option>
        `;


      adminRooms.forEach(
        room => {

          const option =
            document.createElement(
              "option"
            );

          option.value =
            room.id;

          option.textContent =
            `🏠 ${room.name}`;

          select.appendChild(
            option
          );

        }
      );


      if(previous){

        select.value =
          previous;

      }

    }
  );

}


/* =========================================================
   ROOM ASSIGNMENT
   ========================================================= */

function assignAdminToRooms(){

  if(
    !selectedAdmin
  ){

    showAdminMessage(
      "❌ اختر أدمن أولاً"
    );

    return;

  }


  const selected =
    Array.from(
      document.querySelectorAll(
        ".assign-room-checkbox:checked"
      )
    ).map(
      checkbox =>
        checkbox.value
    );


  socket.emit(
    "update admin rooms",
    {

      admin:
        selectedAdmin,

      rooms:
        selected

    }
  );

}

window.assignAdminToRooms =
  assignAdminToRooms;


/* =========================================================
   REQUEST ADMINS
   ========================================================= */

function requestAdmins(){

  socket.emit(
    "get admins"
  );

}

window.requestAdmins =
  requestAdmins;


socket.on(
  "admins list",
  list => {

    renderAdmins(
      Array.isArray(list)
        ? list
        : []
    );

  }
);


/* =========================================================
   RENDER ADMINS
   ========================================================= */

function renderAdmins(
  admins
){

  const box =
    $("adminsList");

  if(!box){
    return;
  }


  box.innerHTML =
    "";


  admins.forEach(
    admin => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "user-card";


      const rooms =
        Array.isArray(
          admin.rooms
        )
          ? admin.rooms
          : [];


      const isMaster =
        admin.master === true ||
        admin.role === "master";


      card.innerHTML = `

        <div>

          <div style="
            font-size:17px;
            font-weight:bold;
          ">
            ${
              isMaster
                ? "👑"
                : "🛡️"
            }
            ${escapeHtml(
              admin.name ||
              admin.username ||
              ""
            )}
          </div>

          <div style="
            color:#aaa;
            margin-top:5px;
          ">
            ${
              isMaster
                ? "Master Admin"
                : "Moderator"
            }
          </div>

          <div style="
            color:#999;
            margin-top:5px;
          ">
            🏠 ${rooms.length}
            غرفة
          </div>

        </div>

        <div class="user-actions">

          <button
            onclick="selectAdminForRooms(
              '${escapeAttr(
                admin.name ||
                admin.username ||
                ""
              )}'
            )"
          >
            🏠 الغرف
          </button>

          <button
            onclick="editAdminPermissions(
              '${escapeAttr(
                admin.name ||
                admin.username ||
                ""
              )}'
            )"
          >
            ⚙️ الصلاحيات
          </button>

          <button
            onclick="removeAdmin(
              '${escapeAttr(
                admin.name ||
                admin.username ||
                ""
              )}'
            )"
          >
            🗑️ حذف
          </button>

        </div>

      `;


      box.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   SELECT ADMIN FOR ROOMS
   ========================================================= */

function selectAdminForRooms(
  username
){

  selectedAdmin =
    username;


  const container =
    $("adminRoomAssignment");

  if(!container){

    showAdminMessage(
      `الأدمن المحدد: ${username}`
    );

    return;

  }


  container.style.display =
    "block";


  const title =
    $("selectedAdminName");

  if(title){

    title.textContent =
      `🏠 غرف ${username}`;

  }


  socket.emit(
    "get admin rooms",
    username
  );

}

window.selectAdminForRooms =
  selectAdminForRooms;


/* =========================================================
   ADMIN ROOM ASSIGNMENT RESULT
   ========================================================= */

socket.on(
  "admin room assignment",
  data => {

    if(!data){
      return;
    }


    selectedAdmin =
      data.admin ||
      selectedAdmin;


    const roomsForAdmin =
      Array.isArray(
        data.rooms
      )
        ? data.rooms
        : [];


    document
      .querySelectorAll(
        ".assign-room-checkbox"
      )
      .forEach(
        checkbox => {

          checkbox.checked =
            roomsForAdmin.includes(
              checkbox.value
            );

        }
      );

  }
);


/* =========================================================
   CREATE ADMIN ROOM CHECKBOXES
   ========================================================= */

function renderAdminRoomCheckboxes(
  assignedRooms = []
){

  const box =
    $("adminRoomCheckboxes");

  if(!box){
    return;
  }


  box.innerHTML =
    "";


  adminRooms.forEach(
    room => {

      const label =
        document.createElement(
          "label"
        );

      label.style.cssText = `
        display:flex;
        align-items:center;
        gap:8px;
        padding:8px;
        cursor:pointer;
      `;


      const checkbox =
        document.createElement(
          "input"
        );

      checkbox.type =
        "checkbox";

      checkbox.className =
        "assign-room-checkbox";

      checkbox.value =
        room.id;

      checkbox.checked =
        assignedRooms.includes(
          room.id
        );


      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        `🏠 ${room.name}`;


      label.append(
        checkbox,
        text
      );

      box.appendChild(
        label
      );

    }
  );

}


/* =========================================================
   ADMIN PERMISSIONS
   ========================================================= */

function editAdminPermissions(
  username
){

  selectedAdmin =
    username;


  socket.emit(
    "get admin permissions",
    username
  );

}

window.editAdminPermissions =
  editAdminPermissions;


socket.on(
  "admin permissions data",
  data => {

    if(!data){
      return;
    }


    selectedAdmin =
      data.admin ||
      selectedAdmin;


    const permissions =
      data.permissions ||
      {};


    /*
       أسماء الصلاحيات المدعومة
    */

    const names = [

      "viewUserInfo",

      "kick",

      "ban",

      "unban",

      "mute",

      "unmute",

      "disconnect",

      "undisconnect",

      "stars",

      "chatLock",

      "maintenance",

      "protection",

      "deleteMessage",

      "manageRooms",

      "addAdmin"

    ];


    names.forEach(
      name => {

        const checkbox =
          document.querySelector(
            `[data-permission="${name}"]`
          );

        if(checkbox){

          checkbox.checked =
            permissions[name] ===
            true;

        }

      }
    );


    const box =
      $("adminPermissionsBox");

    if(box){

      box.style.display =
        "block";

    }

  }
);


/* =========================================================
   SAVE ADMIN PERMISSIONS
   ========================================================= */

function saveAdminPermissions(){

  if(!selectedAdmin){

    showAdminMessage(
      "❌ اختر أدمن"
    );

    return;

  }


  const permissions = {};


  document
    .querySelectorAll(
      "[data-permission]"
    )
    .forEach(
      checkbox => {

        permissions[
          checkbox.dataset.permission
        ] =
          checkbox.checked;

      }
    );


  socket.emit(
    "update admin permissions",
    {

      admin:
        selectedAdmin,

      permissions:
        permissions

    }
  );

}

window.saveAdminPermissions =
  saveAdminPermissions;


/* =========================================================
   REMOVE ADMIN
   ========================================================= */

function removeAdmin(
  username
){

  if(
    !confirm(
      `⚠️ حذف الأدمن ${username}؟`
    )
  ){

    return;

  }


  socket.emit(
    "remove admin",
    username
  );

}

window.removeAdmin =
  removeAdmin;


/* =========================================================
   USERS
   ========================================================= */

function requestUsers(){

  socket.emit(
    "get online users"
  );

}


socket.on(
  "online users",
  users => {

    renderOnlineUsers(
      Array.isArray(users)
        ? users
        : []
    );

  }
);


socket.on(
  "admin online users",
  users => {

    renderOnlineUsers(
      Array.isArray(users)
        ? users
        : []
    );

  }
);


/* =========================================================
   ONLINE USERS RENDER
   ========================================================= */

function renderOnlineUsers(
  users
){

  const box =
    $("onlineUsers");

  if(!box){
    return;
  }


  box.innerHTML =
    "";


  users.forEach(
    user => {

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "user-card";


      div.innerHTML = `

        <div>

          <strong>
            ${
              user.role ||
              ""
            }
            ${escapeHtml(
              user.username ||
              ""
            )}
          </strong>

          ${
            user.roomName
              ? `
                <div style="
                  color:#999;
                  margin-top:4px;
                ">
                  🏠 ${escapeHtml(
                    user.roomName
                  )}
                </div>
              `
              : ""
          }

        </div>

        <div class="user-actions">

          <button
            onclick="viewUser(
              '${escapeAttr(
                user.id
              )}'
            )"
          >
            👁️ معلومات
          </button>

          <button
            onclick="kickUser(
              '${escapeAttr(
                user.id
              )}'
            )"
          >
            👢 طرد
          </button>

          <button
            onclick="muteUser(
              '${escapeAttr(
                user.id
              )}'
            )"
          >
            🔇 كتم
          </button>

        </div>

      `;


      box.appendChild(
        div
      );

    }
  );

}


/* =========================================================
   VIEW USER
   ========================================================= */

function viewUser(
  userId
){

  socket.emit(
    "view user",
    userId
  );

}

window.viewUser =
  viewUser;


socket.on(
  "user info",
  data => {

    const box =
      $("userInfo");

    if(!box){

      showAdminMessage(
        JSON.stringify(
          data,
          null,
          2
        )
      );

      return;

    }


    box.innerHTML = `

      <h3>👤 معلومات المستخدم</h3>

      <p>
        الاسم:
        <strong>
          ${escapeHtml(
            data.username ||
            ""
          )}
        </strong>
      </p>

      <p>
        IP:
        ${escapeHtml(
          data.ip ||
          "غير متاح"
        )}
      </p>

      <p>
        الجهاز:
        ${escapeHtml(
          data.device ||
          "غير متاح"
        )}
      </p>

      <p>
        الغرفة:
        ${escapeHtml(
          data.roomName ||
          "لا توجد"
        )}
      </p>

    `;

  }
);


/* =========================================================
   MODERATION HELPERS
   ========================================================= */

function getCurrentRoomId(){

  return selectedRoomId ||
    $("moderationRoom")?.value ||
    null;

}


function moderationPayload(
  userId
){

  return {

    id:
      userId,

    roomId:
      getCurrentRoomId()

  };

}


/* =========================================================
   KICK
   ========================================================= */

function kickUser(
  userId
){

  socket.emit(
    "kick user",
    moderationPayload(
      userId
    )
  );

}

window.kickUser =
  kickUser;


/* =========================================================
   BAN
   ========================================================= */

function banUser(
  userId
){

  socket.emit(
    "ban user",
    moderationPayload(
      userId
    )
  );

}

window.banUser =
  banUser;


/* =========================================================
   MUTE
   ========================================================= */

function muteUser(
  userId
){

  socket.emit(
    "mute user",
    moderationPayload(
      userId
    )
  );

}

window.muteUser =
  muteUser;


/* =========================================================
   DISCONNECT
   ========================================================= */

function disconnectUser(
  userId
){

  socket.emit(
    "disconnect user",
    moderationPayload(
      userId
    )
  );

}

window.disconnectUser =
  disconnectUser;


/* =========================================================
   UNBAN
   ========================================================= */

function unbanUser(
  username
){

  socket.emit(
    "unban user",
    {

      username:
        username,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.unbanUser =
  unbanUser;


/* =========================================================
   UNMUTE
   ========================================================= */

function unmuteUser(
  username
){

  socket.emit(
    "unmute user",
    {

      username:
        username,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.unmuteUser =
  unmuteUser;


/* =========================================================
   UNDISCONNECT
   ========================================================= */

function undisconnectUser(
  username
){

  socket.emit(
    "undisconnect user",
    {

      username:
        username,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.undisconnectUser =
  undisconnectUser;


/* =========================================================
   STARS
   ========================================================= */

function giveStar(
  username
){

  socket.emit(
    "give star",
    {

      username:
        username,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.giveStar =
  giveStar;


function removeStar(
  username
){

  socket.emit(
    "remove star",
    {

      username:
        username,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.removeStar =
  removeStar;


/* =========================================================
   ROOM SETTINGS
   ========================================================= */

function toggleStarsMode(){

  socket.emit(
    "toggle stars mode",
    {

      roomId:
        getCurrentRoomId()

    }
  );

}

window.toggleStarsMode =
  toggleStarsMode;


function toggleChatLock(){

  socket.emit(
    "toggle chat lock",
    {

      roomId:
        getCurrentRoomId()

    }
  );

}

window.toggleChatLock =
  toggleChatLock;


function toggleMaintenance(){

  socket.emit(
    "maintenance mode",
    {

      roomId:
        getCurrentRoomId()

    }
  );

}

window.toggleMaintenance =
  toggleMaintenance;


function toggleProtection(){

  socket.emit(
    "toggle protection",
    {

      roomId:
        getCurrentRoomId()

    }
  );

}

window.toggleProtection =
  toggleProtection;


/* =========================================================
   DELETE MESSAGE
   ========================================================= */

function deleteMessage(
  messageId
){

  socket.emit(
    "delete message",
    {

      messageId:
        messageId,

      roomId:
        getCurrentRoomId()

    }
  );

}

window.deleteMessage =
  deleteMessage;


/* =========================================================
   MODERATION DATA
   ========================================================= */

function requestRoomModeration(
  roomId
){

  selectedRoomId =
    roomId;


  socket.emit(
    "get room moderation",
    roomId
  );

}

window.requestRoomModeration =
  requestRoomModeration;


socket.on(
  "room moderation data",
  data => {

    if(!data){
      return;
    }


    renderModerationList(
      "bannedUsers",
      data.banned
    );

    renderModerationList(
      "mutedUsers",
      data.muted
    );

    renderModerationList(
      "disconnectedUsers",
      data.disconnected
    );

    renderModerationList(
      "starUsers",
      data.stars
    );

  }
);


/* =========================================================
   MODERATION LIST
   ========================================================= */

function renderModerationList(
  elementId,
  list
){

  const box =
    $(elementId);

  if(!box){
    return;
  }


  box.innerHTML =
    "";


  if(
    !Array.isArray(list) ||
    !list.length
  ){

    box.innerHTML = `
      <div style="
        color:#888;
        padding:10px;
      ">
        لا يوجد
      </div>
    `;

    return;

  }


  list.forEach(
    item => {

      const username =
        typeof item ===
        "string"
          ? item
          : (
              item.username ||
              item.name ||
              ""
            );


      const div =
        document.createElement(
          "div"
        );

      div.className =
        "user-card";


      div.innerHTML = `

        <span>
          ${escapeHtml(
            username
          )}
        </span>

      `;


      box.appendChild(
        div
      );

    }
  );

}


/* =========================================================
   STATS
   ========================================================= */

function requestStats(){

  socket.emit(
    "get stats"
  );

}


socket.on(
  "stats",
  data => {

    if(!data){
      return;
    }


    setText(
      "totalUsers",
      data.totalUsers
    );

    setText(
      "onlineCount",
      data.online
    );

    setText(
      "roomCount",
      data.rooms
    );

    setText(
      "adminCount",
      data.admins
    );

  }
);


function setText(
  id,
  value
){

  const element =
    $(id);

  if(element){

    element.textContent =
      value ??
      "0";

  }

}


/* =========================================================
   LOGS
   ========================================================= */

function requestLogs(){

  socket.emit(
    "get logs"
  );

}


socket.on(
  "logs",
  logs => {

    const box =
      $("logs");

    if(!box){
      return;
    }


    box.innerHTML =
      "";


    if(
      !Array.isArray(logs)
    ){

      return;

    }


    logs
      .slice()
      .reverse()
      .forEach(
        log => {

          const div =
            document.createElement(
              "div"
            );

          div.className =
            "log-item";

          div.textContent =
            typeof log ===
            "string"
              ? log
              : (
                  log.message ||
                  JSON.stringify(
                    log
                  )
                );

          box.appendChild(
            div
          );

        }
      );

  }
);


/* =========================================================
   BANNED / MUTED LEGACY LISTS
   ========================================================= */

async function loadLegacyLists(){

  /*
     هذه القوائم تبقى متوافقة
     مع ملفات السيرفر القديمة.
  */

  try{

    const banned =
      await fetch(
        "/banned.json",
        {
          cache:"no-store"
        }
      );

    if(banned.ok){

      const data =
        await banned.json();

      renderModerationList(
        "bannedUsers",
        data
      );

    }

  }catch{}

  try{

    const muted =
      await fetch(
        "/muted.json",
        {
          cache:"no-store"
        }
      );

    if(muted.ok){

      const data =
        await muted.json();

      renderModerationList(
        "mutedUsers",
        data
      );

    }

  }catch{}

}


/* =========================================================
   ADMIN CHAT CONTROLS
   ========================================================= */

function sendAdminAction(
  eventName,
  payload
){

  if(
    !adminLoggedIn
  ){

    showAdminMessage(
      "❌ سجل الدخول أولاً"
    );

    return;

  }


  socket.emit(
    eventName,
    payload
  );

}


/* =========================================================
   GENERIC ROOM ACTIONS
   ========================================================= */

function roomAction(
  eventName,
  roomId
){

  sendAdminAction(
    eventName,
    {
      roomId:
        roomId
    }
  );

}

window.roomAction =
  roomAction;


/* =========================================================
   SOCKET FEEDBACK
   ========================================================= */

socket.on(
  "admin action success",
  message => {

    if(message){

      showAdminMessage(
        "✅ " + message
      );

    }

    requestRooms();

    requestAdmins();

  }
);


socket.on(
  "admin action error",
  message => {

    showAdminMessage(
      "❌ " +
      (
        message ||
        "تعذر تنفيذ العملية"
      )
    );

  }
);


/* =========================================================
   ROOM CREATED
   ========================================================= */

socket.on(
  "room created",
  room => {

    if(room){

      showAdminMessage(
        `✅ تم إنشاء غرفة ${room.name}`
      );

    }

    requestRooms();

  }
);


/* =========================================================
   ROOM UPDATED
   ========================================================= */

socket.on(
  "room updated",
  room => {

    if(room){

      showAdminMessage(
        `✅ تم تحديث غرفة ${room.name}`
      );

    }

    requestRooms();

  }
);


/* =========================================================
   ROOM TOGGLED
   ========================================================= */

socket.on(
  "room toggled",
  room => {

    if(room){

      showAdminMessage(
        room.enabled !== false
          ? "🟢 تم تفعيل الغرفة"
          : "🔴 تم تعطيل الغرفة"
      );

    }

    requestRooms();

  }
);


/* =========================================================
   ROOM DELETED
   ========================================================= */

socket.on(
  "room deleted",
  roomId => {

    showAdminMessage(
      "🗑️ تم حذف الغرفة"
    );

    requestRooms();

  }
);


/* =========================================================
   ROOM STATE
   ========================================================= */

socket.on(
  "room state",
  state => {

    if(!state){
      return;
    }


    selectedRoomId =
      state.roomId ||
      selectedRoomId;


    /*
       تحديث عناصر الحالة
    */

    setToggleText(
      "starsModeStatus",
      state.settings?.starsMode
    );

    setToggleText(
      "chatLockStatus",
      state.settings?.chatLocked
    );

    setToggleText(
      "maintenanceStatus",
      state.settings?.maintenance
    );

    setToggleText(
      "protectionStatus",
      state.settings?.protection
    );

  }
);


function setToggleText(
  id,
  enabled
){

  const element =
    $(id);

  if(!element){
    return;
  }

  element.textContent =
    enabled
      ? "ON"
      : "OFF";

}


/* =========================================================
   ADMIN ROOM SELECT CHANGE
   ========================================================= */

document.addEventListener(
  "change",
  e => {

    if(
      e.target &&
      e.target.classList &&
      e.target.classList.contains(
        "admin-room-selector"
      )
    ){

      selectedRoomId =
        e.target.value ||
        null;


      if(selectedRoomId){

        requestRoomModeration(
          selectedRoomId
        );

      }

    }

  }
);


/* =========================================================
   ADMIN PERMISSION CHECKBOXES
   ========================================================= */

function createPermissionCheckboxes(){

  const box =
    $("adminPermissionsBox");

  if(!box){
    return;
  }


  if(
    box.dataset.ready ===
    "1"
  ){

    return;

  }


  box.dataset.ready =
    "1";


  const permissions = [

    [
      "viewUserInfo",
      "👁️ مشاهدة معلومات المستخدم"
    ],

    [
      "kick",
      "👢 الطرد"
    ],

    [
      "ban",
      "🚫 الحظر"
    ],

    [
      "unban",
      "🔓 فك الحظر"
    ],

    [
      "mute",
      "🔇 الكتم"
    ],

    [
      "unmute",
      "🔊 فك الكتم"
    ],

    [
      "disconnect",
      "⛔ الفصل"
    ],

    [
      "undisconnect",
      "🔌 فك الفصل"
    ],

    [
      "stars",
      "⭐ النجوم"
    ],

    [
      "chatLock",
      "🔒 قفل الدردشة"
    ],

    [
      "maintenance",
      "🛠️ الصيانة"
    ],

    [
      "protection",
      "🛡️ الحماية"
    ],

    [
      "deleteMessage",
      "🗑️ حذف الرسائل"
    ],

    [
      "manageRooms",
      "🏠 إدارة الغرف"
    ],

    [
      "addAdmin",
      "👑 إدارة الأدمن"
    ]

  ];


  const wrapper =
    document.createElement(
      "div"
    );


  permissions.forEach(
    item => {

      const label =
        document.createElement(
          "label"
        );

      label.style.cssText = `
        display:flex;
        align-items:center;
        gap:8px;
        padding:7px 0;
      `;


      const checkbox =
        document.createElement(
          "input"
        );

      checkbox.type =
        "checkbox";

      checkbox.dataset.permission =
        item[0];


      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        item[1];


      label.append(
        checkbox,
        text
      );


      wrapper.appendChild(
        label
      );

    }
  );


  box.appendChild(
    wrapper
  );


  const save =
    document.createElement(
      "button"
    );

  save.textContent =
    "💾 حفظ الصلاحيات";

  save.onclick =
    saveAdminPermissions;


  box.appendChild(
    save
  );

}


/* =========================================================
   ADMIN ROOM ASSIGNMENT UI
   ========================================================= */

function createAssignmentUI(){

  const box =
    $("adminRoomAssignment");

  if(!box){
    return;
  }


  if(
    box.dataset.ready ===
    "1"
  ){

    return;

  }


  box.dataset.ready =
    "1";


  const title =
    document.createElement(
      "h3"
    );

  title.id =
    "selectedAdminName";

  title.textContent =
    "🏠 غرف الأدمن";


  const roomsBox =
    document.createElement(
      "div"
    );

  roomsBox.id =
    "adminRoomCheckboxes";


  const save =
    document.createElement(
      "button"
    );

  save.textContent =
    "💾 حفظ الغرف";

  save.onclick =
    assignAdminToRooms;


  box.append(
    title,
    roomsBox,
    save
  );

}


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    createPermissionCheckboxes();

    createAssignmentUI();

    renderRoomSelectors();

    loadLegacyLists();

  }
);


/* =========================================================
   SOCKET CONNECT
   ========================================================= */

socket.on(
  "connect",
  () => {

    /*
       لا نرسل login تلقائياً.
       تسجيل الدخول من زر اللوحة.
    */

  }
);


/* =========================================================
   ROOM ASSIGNMENT REFRESH
   ========================================================= */

socket.on(
  "admin rooms updated",
  data => {

    if(data){

      adminRooms =
        Array.isArray(
          data.rooms
        )
          ? data.rooms
          : adminRooms;

    }


    requestRooms();

    requestAdmins();


    if(
      selectedAdmin
    ){

      socket.emit(
        "get admin rooms",
        selectedAdmin
      );

    }

  }
);


/* =========================================================
   MASTER / ROLE
   ========================================================= */

socket.on(
  "admin role",
  data => {

    if(!adminData){
      adminData = {};
    }


    adminData.role =
      data?.role ||
      adminData.role;


    adminData.master =
      data?.master === true ||
      adminData.master === true;


    updateAdminHeader();

  }
);


/* =========================================================
   ROOM PERMISSIONS
   ========================================================= */

socket.on(
  "room permissions",
  data => {

    if(!data){
      return;
    }


    adminPermissions =
      data.permissions ||
      adminPermissions;


    renderRooms();

  }
);


/* =========================================================
   REFRESH EVERYTHING
   ========================================================= */

function refreshAdmin(){

  if(!adminLoggedIn){
    return;
  }


  requestRooms();

  requestAdmins();

  requestUsers();

  requestStats();

  requestLogs();

  loadLegacyLists();

}

window.refreshAdmin =
  refreshAdmin;


/* =========================================================
   LOGOUT
   ========================================================= */

function adminLogout(){

  socket.emit(
    "admin.panel logout"
  );


  adminLoggedIn =
    false;

  adminData =
    null;

  adminPermissions =
    {};

  adminRooms =
    [];


  const panel =
    $("adminPanel");

  const login =
    $("adminLogin");


  if(panel){

    panel.style.display =
      "none";

  }


  if(login){

    login.style.display =
      "block";

  }

}

window.adminLogout =
  adminLogout;
