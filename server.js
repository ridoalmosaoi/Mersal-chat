const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const DATA = __dirname;
const MAX_OPEN_ROOMS = 3;
const GLOBAL_CONTROL_PATH = "/global-control-7xK9";
const GLOBAL_CONTROL_PASSWORD =
  process.env.GLOBAL_CONTROL_PASSWORD || "MersalGlobal2026";

function loadJSON(file, fallback) {
  try {
    const p = path.join(DATA, file);

    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify(fallback, null, 2));
      return fallback;
    }

    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (error) {
    console.error(`LOAD ${file} ERROR`, error);
    return fallback;
  }
}

function saveJSON(file, value) {
  try {
    fs.writeFileSync(
      path.join(DATA, file),
      JSON.stringify(value, null, 2)
    );
  } catch (error) {
    console.error(`SAVE ${file} ERROR`, error);
  }
}

let users = [];

let admins = loadJSON("admins.json", []);
if (!Array.isArray(admins)) admins = [];

let bannedUsers = loadJSON("banned.json", []);
if (!Array.isArray(bannedUsers)) bannedUsers = [];

let mutedUsers = loadJSON("muted.json", []);
if (!Array.isArray(mutedUsers)) mutedUsers = [];

let deviceBannedUsers = loadJSON("deviceBanned.json", []);
if (!Array.isArray(deviceBannedUsers)) deviceBannedUsers = [];

let stars = loadJSON("stars.json", []);
if (!Array.isArray(stars)) stars = [];

let logs = loadJSON("logs.json", []);
if (!Array.isArray(logs)) logs = [];

let rooms = loadJSON("rooms.json", []);
if (!Array.isArray(rooms)) rooms = [];

let roomStars = loadJSON("roomStars.json", {});
let roomMessages = loadJSON("roomMessages.json", {});
let roomModerationData = loadJSON("roomModeration.json", {});
let globalState = loadJSON("globalState.json", {});

let oldGlobalDisconnect = loadJSON(
  "globalDisconnect.json",
  { enabled: false }
);

let globalDisconnect =
  globalState?.disconnect === true ||
  oldGlobalDisconnect?.enabled === true;

let chatLocked = false;
let privateLocked = false;
let maintenanceMode = false;
let starsMode = false;

function makeId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9)
  );
}

function ipOf(socket) {
  const forwarded =
    socket.handshake.headers["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return socket.handshake.address || "unknown";
}

function deviceOf(socket, data = {}) {
  return String(
    data.deviceToken ||
      socket.handshake.headers["user-agent"] ||
      "unknown"
  );
}

function sameName(a, b) {
  return (
    String(a || "").trim().toLowerCase() ===
    String(b || "").trim().toLowerCase()
  );
}

function normalizeRoom(room) {
  const r = room || {};
  const settings = r.settings || {};

  return {
    id: String(
      r.id || `room_${makeId()}`
    ),

    name: String(
      r.name || "غرفة جديدة"
    ).trim(),

    description: String(
      r.description || ""
    ).trim(),

    enabled: r.enabled !== false,

    settings: {
      enabled: settings.enabled !== false,

      maintenance:
        settings.maintenance === true,

      chatLock:
        settings.chatLock === true ||
        settings.chatLocked === true,

      chatLocked:
        settings.chatLocked === true ||
        settings.chatLock === true,

      stars:
        settings.stars === true ||
        settings.starsMode === true,

      starsMode:
        settings.starsMode === true ||
        settings.stars === true,

      protection:
        settings.protection !== false
    },

    createdAt:
      r.createdAt || Date.now()
  };
}

rooms = rooms.map(normalizeRoom);

roomStars =
  roomStars &&
  typeof roomStars === "object"
    ? roomStars
    : {};

roomMessages =
  roomMessages &&
  typeof roomMessages === "object"
    ? roomMessages
    : {};

roomModerationData =
  roomModerationData &&
  typeof roomModerationData === "object"
    ? roomModerationData
    : {};

function getRoom(roomId) {
  return (
    rooms.find(
      room =>
        String(room.id) ===
        String(roomId)
    ) || null
  );
}

function ensureRoomData(roomId) {
  const id = String(roomId);

  if (!Array.isArray(roomStars[id])) {
    roomStars[id] = [];
  }

  if (!Array.isArray(roomMessages[id])) {
    roomMessages[id] = [];
  }

  if (
    !roomModerationData[id] ||
    typeof roomModerationData[id] !== "object"
  ) {
    roomModerationData[id] = {};
  }

  for (const key of [
    "banned",
    "muted",
    "kicked",
    "disconnected"
  ]) {
    if (
      !Array.isArray(
        roomModerationData[id][key]
      )
    ) {
      roomModerationData[id][key] = [];
    }
  }

  if (
    !Array.isArray(
      roomModerationData[id].admins
    )
  ) {
    roomModerationData[id].admins = [];
  }

  return roomModerationData[id];
}

for (const room of rooms) {
  ensureRoomData(room.id);
}

saveJSON("rooms.json", rooms);
saveJSON("roomStars.json", roomStars);
saveJSON("roomMessages.json", roomMessages);
saveJSON(
  "roomModeration.json",
  roomModerationData
);

function isMaster(admin) {
  if (!admin) return false;

  if (
    admin.role === "master" ||
    admin.isMaster === true ||
    admin.master === true
  ) {
    return true;
  }

  if (admin.permissions?.master === true) {
    return true;
  }

  return (
    admins.length > 0 &&
    admins[0] === admin
  );
}

function hasPermission(
  admin,
  permission,
  roomId = null
) {
  if (!admin) return false;

  if (isMaster(admin)) {
    return true;
  }

  if (
    admin.permissions?.[permission] === true
  ) {
    return true;
  }

  if (
    roomId &&
    admin.roomPermissions?.[roomId]?.[
      permission
    ] === true
  ) {
    return true;
  }

  return false;
}

function assignedToRoom(
  admin,
  roomId
) {
  if (!admin) return false;

  if (isMaster(admin)) {
    return true;
  }

  return (
    admin.assignedRooms || []
  )
    .map(String)
    .includes(String(roomId));
}

function canRoom(
  admin,
  roomId,
  permission = null
) {
  if (
    !admin ||
    !getRoom(roomId)
  ) {
    return false;
  }

  if (
    !assignedToRoom(
      admin,
      roomId
    )
  ) {
    return false;
  }

  return permission
    ? hasPermission(
        admin,
        permission,
        roomId
      )
    : true;
}

function getAdmin(socket) {
  return socket.adminData || null;
}

function getUser(socket) {
  return (
    users.find(
      user =>
        user.id === socket.id
    ) || null
  );
}

function getUserBySocket(socket) {
  return (
    users.find(
      user =>
        user.socketId === socket.id ||
        user.id === socket.id
    ) || null
  );
}

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,

    socketId: user.id,

    name: user.name,

    username: user.name,

    color: user.color,

    roomId:
      user.roomId || null,

    currentRoom:
      user.roomId || null,

    isAdmin:
      !!user.isAdmin,

    role:
      user.role || "user"
  };
}

function publicUsers() {
  return users.map(
    sanitizeUser
  );
}

function getPublicOnlineUsers() {
  return publicUsers();
}

function roomUsers(roomId) {
  return users
    .filter(
      user =>
        String(
          user.roomId || ""
        ) === String(roomId)
    )
    .map(sanitizeUser);
}

function emitStats(socket) {
  if (!socket) return;

  socket.emit(
    "server stats",
    {
      onlineUsers:
        users.length,

      bannedUsers:
        bannedUsers.length,

      admins:
        admins.length,

      rooms:
        rooms.length
    }
  );
}

function emitOnline() {
  io.emit(
    "online users",
    getPublicOnlineUsers()
  );

  io.emit(
    "admin online users",
    getPublicOnlineUsers()
  );

  for (
    const socket of
    io.sockets.sockets.values()
  ) {
    if (socket.adminData) {
      emitStats(socket);
    }
  }
}

function emitRooms(socket) {
  const visible =
    rooms.filter(
      room =>
        room.enabled !== false &&
        room.settings.enabled !== false
    );

  socket.emit(
    "rooms",
    visible
  );

  socket.emit(
    "room list",
    visible
  );
}

function emitAdminRooms(socket) {
  const admin =
    getAdmin(socket);

  if (!admin) return;

  const visible =
    isMaster(admin)
      ? rooms
      : rooms.filter(
          room =>
            assignedToRoom(
              admin,
              room.id
            )
        );

  socket.emit(
    "admin rooms",
    visible
  );

  socket.emit(
    "rooms updated",
    visible
  );
}

function notifyRoom(
  roomId,
  message,
  type = "system"
) {
  io.to(
    `public:${roomId}`
  ).emit(
    "room notice",
    {
      roomId:
        String(roomId),

      message:
        String(message),

      type,

      timestamp:
        Date.now()
    }
  );
}

function moderationList(
  roomId,
  key
) {
  return ensureRoomData(
    roomId
  )[key];
}

function moderationHas(
  roomId,
  key,
  username
) {
  return moderationList(
    roomId,
    key
  ).some(item => {
    const name =
      typeof item === "string"
        ? item
        : item?.name;

    return sameName(
      name,
      username
    );
  });
}

function addModeration(
  roomId,
  key,
  username,
  by
) {
  const list =
    moderationList(
      roomId,
      key
    );

  if (
    !list.some(
      item =>
        sameName(
          typeof item === "string"
            ? item
            : item?.name,
          username
        )
    )
  ) {
    list.push({
      name:
        String(username),

      by:
        String(
          by || "admin"
        ),

      time:
        Date.now()
    });

    saveJSON(
      "roomModeration.json",
      roomModerationData
    );
  }
}

function removeModeration(
  roomId,
  key,
  username
) {
  const data =
    ensureRoomData(
      roomId
    );

  data[key] =
    data[key].filter(
      item =>
        !sameName(
          typeof item === "string"
            ? item
            : item?.name,
          username
        )
    );

  saveJSON(
    "roomModeration.json",
    roomModerationData
  );
}

function findTarget(name) {
  return (
    users.find(
      user =>
        sameName(
          user.name,
          name
        )
    ) || null
  );
}

function targetSocket(user) {
  return user
    ? io.sockets.sockets.get(
        user.id
      ) || null
    : null;
}

function targetNameFrom(data) {
  return typeof data === "string"
    ? data
    : data?.name ||
      data?.username ||
      "";
}

function safeName(name) {
  const value =
    String(name || "")
      .trim();

  if (
    !value ||
    value.length > 30
  ) {
    return false;
  }

  if (/[&@]/.test(value)) {
    return false;
  }

  if (
    [
      "admin",
      "administrator",
      "master",
      "owner",
      "moderator"
    ].includes(
      value.toLowerCase()
    )
  ) {
    return false;
  }

  return true;
}

function addLog(
  message,
  roomId = null
) {
  const item = {
    id: makeId(),

    time:
      new Date().toISOString(),

    message:
      String(message),

    roomId:
      roomId
        ? String(roomId)
        : null
  };

  logs.unshift(item);

  logs =
    logs.slice(0, 500);

  saveJSON(
    "logs.json",
    logs
  );

  io.emit(
    "new log",
    item
  );

  console.log(message);
}

function leaveRoomForUser(
  user,
  roomId,
  notice = null
) {
  const socket =
    targetSocket(user);

  if (socket) {
    socket.leave(
      `public:${roomId}`
    );
  }

  if (
    String(
      user.roomId || ""
    ) === String(roomId)
  ) {
    user.roomId = null;
  }

  if (notice) {
    notifyRoom(
      roomId,
      notice,
      "system"
    );
  }

  io.to(
    `public:${roomId}`
  ).emit(
    "room users",
    roomUsers(roomId)
  );
}

function saveAll() {
  saveJSON(
    "admins.json",
    admins
  );

  saveJSON(
    "banned.json",
    bannedUsers
  );

  saveJSON(
    "muted.json",
    mutedUsers
  );

  saveJSON(
    "deviceBanned.json",
    deviceBannedUsers
  );

  saveJSON(
    "stars.json",
    stars
  );

  saveJSON(
    "logs.json",
    logs
  );

  saveJSON(
    "rooms.json",
    rooms
  );

  saveJSON(
    "roomStars.json",
    roomStars
  );

  saveJSON(
    "roomMessages.json",
    roomMessages
  );

  saveJSON(
    "roomModeration.json",
    roomModerationData
  );

  saveJSON(
    "globalState.json",
    {
      disconnect:
        globalDisconnect
    }
  );

  saveJSON(
    "globalDisconnect.json",
    {
      enabled:
        globalDisconnect
    }
  );
}

/* =========================================================
   PUBLIC HTTP API
   ========================================================= */

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      users:
        users.length,
      rooms:
        rooms.length,
      time:
        Date.now()
    });
  }
);

app.get(
  "/banned.json",
  (req, res) =>
    res.json(
      bannedUsers
    )
);

app.get(
  "/muted.json",
  (req, res) =>
    res.json(
      mutedUsers
    )
);

app.get(
  "/deviceBanned.json",
  (req, res) =>
    res.json(
      deviceBannedUsers
    )
);

/* =========================================================
   GLOBAL CONTROL
   ========================================================= */

function globalControlHTML() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mersal - التحكم العام</title>
<style>
*{box-sizing:border-box}
body{
margin:0;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
background:#050505;
color:#fff;
font-family:Arial,sans-serif;
padding:20px
}
.box{
width:100%;
max-width:430px;
background:#111;
border:1px solid #333;
border-radius:20px;
padding:28px;
box-shadow:0 20px 60px #000
}
.logo{
text-align:center;
font-size:28px;
font-weight:700
}
.sub{
text-align:center;
color:#aaa;
margin:8px 0 24px
}
input{
width:100%;
padding:15px;
border-radius:12px;
border:1px solid #444;
background:#080808;
color:#fff;
font-size:17px;
text-align:center
}
button{
width:100%;
padding:15px;
border:0;
border-radius:12px;
margin-top:12px;
font-size:16px;
font-weight:700
}
.on{
background:#b00020;
color:#fff
}
.off{
background:#087f23;
color:#fff
}
.status{
text-align:center;
margin:18px 0;
padding:12px;
border-radius:12px;
background:#1a1a1a;
color:#ddd
}
.msg{
text-align:center;
min-height:24px;
color:#ffd700;
margin-top:14px
}
</style>
</head>
<body>
<div class="box">
<div class="logo">🔐 Mersal</div>
<div class="sub">التحكم بالفصل العام</div>

<div id="status" class="status">
جارٍ التحقق...
</div>

<input
id="password"
type="password"
placeholder="كلمة السر"
>

<button
class="on"
onclick="setState(true)"
>
🔴 فصل الدردشة العامة
</button>

<button
class="off"
onclick="setState(false)"
>
🟢 فك الفصل العام
</button>

<div
id="msg"
class="msg"
></div>
</div>

<script>
async function refresh(){
try{
const r=await fetch(
'${GLOBAL_CONTROL_PATH}/status'
);

const d=await r.json();

document.getElementById(
'status'
).textContent=
d.enabled
?'⛔ الدردشة العامة مفصولة'
:'🟢 الدردشة العامة تعمل';

}catch(e){

document.getElementById(
'status'
).textContent=
'❌ تعذر الاتصال';

}
}

async function setState(enabled){

const password=
document.getElementById(
'password'
).value;

const msg=
document.getElementById(
'msg'
);

const r=
await fetch(
'${GLOBAL_CONTROL_PATH}/toggle',
{
method:'POST',
headers:{
'Content-Type':
'application/json'
},
body:JSON.stringify({
password,
enabled
})
}
);

const d=
await r.json();

msg.textContent=
d.message || 'تم';

if(d.ok){
refresh();
}
}

refresh();
</script>
</body>
</html>`;
}

app.get(
  GLOBAL_CONTROL_PATH,
  (req, res) =>
    res
      .type("html")
      .send(
        globalControlHTML()
      )
);

app.get(
  "/global-control",
  (req, res) =>
    res.redirect(
      GLOBAL_CONTROL_PATH
    )
);

app.get(
  `${GLOBAL_CONTROL_PATH}/status`,
  (req, res) => {
    res.json({
      enabled:
        globalDisconnect
    });
  }
);

app.post(
  `${GLOBAL_CONTROL_PATH}/toggle`,
  (req, res) => {
    const password =
      String(
        req.body?.password ||
          ""
      );

    const enabled =
      req.body?.enabled ===
      true;

    if (
      password !==
      String(
        GLOBAL_CONTROL_PASSWORD
      )
    ) {
      return res
        .status(403)
        .json({
          ok: false,
          message:
            "❌ كلمة السر غير صحيحة"
        });
    }

    globalDisconnect =
      enabled;

    saveJSON(
      "globalState.json",
      {
        disconnect:
          globalDisconnect
      }
    );

    saveJSON(
      "globalDisconnect.json",
      {
        enabled:
          globalDisconnect
      }
    );

    for (
      const user of users
    ) {
      if (user.isAdmin)
        continue;

      const socket =
        targetSocket(user);

      socket?.emit(
        "global disconnect",
        {
          enabled:
            globalDisconnect,

          message:
            globalDisconnect
              ? "⛔ أنت مفصول عن الدردشة العامة"
              : "🟢 تم فك الفصل عن الدردشة العامة"
        }
      );
    }

    io.emit(
      "global disconnect state",
      {
        enabled:
          globalDisconnect
      }
    );

    addLog(
      globalDisconnect
        ? "⛔ تم فصل الدردشة العامة"
        : "🟢 تم فك الفصل العام"
    );

    res.json({
      ok: true,

      enabled:
        globalDisconnect,

      message:
        globalDisconnect
          ? "⛔ تم فصل العام"
          : "🟢 تم فك الفصل العام"
    });
  }
);

/* =========================================================
   SOCKET.IO
   ========================================================= */

io.on(
  "connection",
  socket => {

    socket.on(
      "check admin",
      name => {
        socket.emit(
          "admin check result",
          admins.some(
            admin =>
              sameName(
                admin.name,
                name
              )
          )
        );
      }
    );

    socket.on(
      "join",
      data => {

        const username =
          String(
            data?.username ||
              ""
          ).trim();

        if (
          !safeName(username)
        ) {
          return socket.emit(
            "banned",
            "⚠️ اسم المستخدم غير صالح"
          );
        }

        if (
          users.some(
            user =>
              sameName(
                user.name,
                username
              )
          )
        ) {
          return socket.emit(
            "banned",
            "⚠️ الاسم مستخدم"
          );
        }

        const ip =
          ipOf(socket);

        const device =
          deviceOf(
            socket,
            data
          );

        const ipBlocked =
          bannedUsers.some(
            item =>
              String(
                item?.ip ||
                  item
              ).toLowerCase() ===
              String(ip)
                .toLowerCase()
          );

        const deviceBlocked =
          deviceBannedUsers.some(
            item =>
              String(
                item?.device ||
                  item
              ).toLowerCase() ===
              device.toLowerCase()
          );

        if (ipBlocked) {
          return socket.emit(
            "banned",
            "🚫 أنت محظور"
          );
        }

        if (deviceBlocked) {
          return socket.emit(
            "banned",
            "⛔ الجهاز محظور"
          );
        }

        const admin =
          admins.find(
            item =>
              sameName(
                item.name,
                username
              )
          ) || null;

        if (admin) {

          if (
            String(
              data?.adminPassword ||
                ""
            ) !==
            String(
              admin.password ||
                ""
            )
          ) {
            return socket.emit(
              "banned",
              "🚫 كلمة السر خطأ"
            );
          }

          socket.adminData =
            admin;
        }

        const user = {
          id:
            socket.id,

          socketId:
            socket.id,

          name:
            username,

          username,

          color:
            String(
              data?.color ||
                "#ffd700"
            ),

          ip,

          device,

          isAdmin:
            !!admin,

          role:
            admin
              ? (
                  isMaster(
                    admin
                  )
                    ? "master"
                    : "moderator"
                )
              : "user",

          roomId:
            null,

          openRooms:
            []
        };

        users.push(user);

        socket.username =
          username;

        socket.emit(
          "login success",
          sanitizeUser(user)
        );

        if (
          globalDisconnect &&
          !user.isAdmin
        ) {
          socket.emit(
            "global disconnect",
            {
              enabled: true,
              message:
                "⛔ أنت مفصول عن الدردشة العامة"
            }
          );
        }

        emitRooms(socket);

        emitOnline();

        addLog(
          `👤 ${username} دخل`
        );
      }
    );

    socket.on(
      "get rooms",
      () =>
        emitRooms(socket)
    );

    socket.on(
      "get online users",
      () => {

        if (
          !socket.adminData
        ) {
          return;
        }

        socket.emit(
          "admin online users",
          getPublicOnlineUsers()
        );

        emitStats(socket);
      }
    );

    socket.on(
      "get stats",
      () => {
        if (
          socket.adminData
        ) {
          emitStats(socket);
        }
      }
    );

    socket.on(
      "join room",
      data => {

        const user =
          getUser(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          ).trim();

        const room =
          getRoom(roomId);

        if (!user) {
          return socket.emit(
            "room error",
            "❌ يجب تسجيل الدخول أولًا"
          );
        }

        if (!room) {
          return socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );
        }

        ensureRoomData(
          roomId
        );

        if (
          room.enabled ===
            false ||
          room.settings.enabled ===
            false
        ) {
          return socket.emit(
            "room error",
            "⛔ هذه الغرفة متوقفة"
          );
        }

        if (
          room.settings
            .maintenance &&
          !user.isAdmin
        ) {
          return socket.emit(
            "room error",
            "🛠️ الغرفة في وضع الصيانة"
          );
        }

        if (
          moderationHas(
            roomId,
            "banned",
            user.name
          )
        ) {
          return socket.emit(
            "room error",
            "🚫 أنت محظور من هذه الغرفة"
          );
        }

        if (
          moderationHas(
            roomId,
            "disconnected",
            user.name
          )
        ) {
          return socket.emit(
            "room error",
            "⛔ تم فصلك من هذه الغرفة"
          );
        }

        const currentRooms =
          Array.isArray(
            user.openRooms
          )
            ? user.openRooms.map(
                String
              )
            : [];

        if (
          !currentRooms.includes(
            roomId
          ) &&
          currentRooms.length >=
            MAX_OPEN_ROOMS
        ) {
          return socket.emit(
            "room error",
            `⚠️ الحد الأقصى ${MAX_OPEN_ROOMS} غرف مفتوحة`
          );
        }

        if (
          user.roomId &&
          String(
            user.roomId
          ) !== roomId
        ) {
          socket.leave(
            `public:${user.roomId}`
          );
        }

        socket.join(
          `public:${roomId}`
        );

        user.roomId =
          roomId;

        user.openRooms =
          Array.from(
            new Set([
              ...currentRooms,
              roomId
            ])
          ).slice(
            -MAX_OPEN_ROOMS
          );

        const assigned =
          user.isAdmin &&
          assignedToRoom(
            socket.adminData,
            roomId
          );

        socket.emit(
          "room joined",
          {
            room,

            roomId,

            username:
              user.name,

            muted:
              moderationHas(
                roomId,
                "muted",
                user.name
              ),

            settings:
              room.settings,

            isAdmin:
              assigned,

            isMaster:
              user.role ===
              "master"
          }
        );

        socket.emit(
          "room history",
          {
            roomId,

            messages:
              roomMessages[
                roomId
              ] || []
          }
        );

        socket.emit(
          "room stars",
          {
            roomId,

            enabled:
              !!(
                room.settings
                  .stars ||
                room.settings
                  .starsMode
              ),

            stars:
              roomStars[
                roomId
              ] || []
          }
        );

        if (assigned) {
          notifyRoom(
            roomId,
            `✨ تم توكيل ${user.name}`,
            "admin"
          );
        }

        io.to(
          `public:${roomId}`
        ).emit(
          "room users",
          roomUsers(roomId)
        );

        emitOnline();
      }
    );

    socket.on(
      "leave room",
      data => {

        const user =
          getUser(socket);

        if (!user) return;

        const roomId =
          String(
            data?.roomId ||
              user.roomId ||
              ""
          ).trim();

        if (!roomId)
          return;

        socket.leave(
          `public:${roomId}`
        );

        user.openRooms =
          (
            user.openRooms ||
            []
          ).filter(
            id =>
              String(id) !==
              roomId
          );

        if (
          String(
            user.roomId
          ) === roomId
        ) {
          user.roomId =
            user.openRooms[0] ||
            null;
        }

        notifyRoom(
          roomId,
          `🚪 غادر ${user.name} الغرفة`,
          "leave"
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room users",
          roomUsers(roomId)
        );

        socket.emit(
          "room left",
          {
            roomId
          }
        );

        emitOnline();
      }
    );

    socket.on(
      "get room users",
      data => {

        const roomId =
          String(
            data?.roomId ||
              getUser(socket)
                ?.roomId ||
              ""
          );

        socket.emit(
          "room users",
          roomUsers(roomId)
        );
      }
    );

    socket.on(
      "check room access",
      data => {

        const user =
          getUser(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const room =
          getRoom(roomId);

        let allowed =
          !!user &&
          !!room;

        let reason =
          "ok";

        if (!user) {
          allowed = false;
          reason = "login";
        } else if (!room) {
          allowed = false;
          reason = "not_found";
        } else if (
          room.enabled ===
            false ||
          room.settings.enabled ===
            false
        ) {
          allowed = false;
          reason = "disabled";
        } else if (
          room.settings
            .maintenance &&
          !user.isAdmin
        ) {
          allowed = false;
          reason =
            "maintenance";
        } else if (
          moderationHas(
            roomId,
            "banned",
            user.name
          )
        ) {
          allowed = false;
          reason =
            "banned";
        } else if (
          moderationHas(
            roomId,
            "disconnected",
            user.name
          )
        ) {
          allowed = false;
          reason =
            "disconnected";
        }

        socket.emit(
          "room access",
          {
            roomId,
            allowed,
            reason
          }
        );
      }
    );

    function sendRoomMessage(
      data
    ) {
      const user =
        getUser(socket);

      if (!user)
        return;

      const roomId =
        String(
          data?.roomId ||
            user.roomId ||
            ""
        ).trim();

      const text =
        String(
          data?.message ||
            data?.text ||
            ""
        ).trim();

      const room =
        getRoom(roomId);

      if (
        !room ||
        String(
          user.roomId
        ) !== roomId ||
        !text
      ) {
        return;
      }

      if (
        !user.isAdmin &&
        room.settings
          .maintenance
      ) {
        return socket.emit(
          "room error",
          "🛠️ الغرفة في وضع الصيانة"
        );
      }

      if (
        !user.isAdmin &&
        (
          room.settings
            .chatLock ||
          room.settings
            .chatLocked
        )
      ) {
        return socket.emit(
          "room error",
          "🔒 الدردشة مقفلة حاليًا"
        );
      }

      if (
        moderationHas(
          roomId,
          "banned",
          user.name
        )
      ) {
        return socket.emit(
          "room error",
          "🚫 أنت محظور من هذه الغرفة"
        );
      }

      if (
        moderationHas(
          roomId,
          "muted",
          user.name
        )
      ) {
        return socket.emit(
          "room error",
          "🔇 أنت مكتوم في هذه الغرفة"
        );
      }

      if (
        moderationHas(
          roomId,
          "disconnected",
          user.name
        )
      ) {
        return socket.emit(
          "room error",
          "⛔ لا يمكنك الكتابة في هذه الغرفة"
        );
      }

      if (
        !user.isAdmin &&
        (
          room.settings
            .stars ||
          room.settings
            .starsMode
        )
      ) {
        const hasStar =
          roomStars[
            roomId
          ].some(
            item =>
              sameName(
                item?.to,
                user.name
              )
          );

        if (!hasStar) {
          return socket.emit(
            "room error",
            "⭐ الكتابة لأصحاب النجمة فقط"
          );
        }
      }

      const message = {
        id: makeId(),

        roomId,

        username:
          user.name,

        name:
          user.name,

        message:
          text,

        text,

        color:
          user.color,

        reply:
          data?.reply ||
          null,

        timestamp:
          Date.now(),

        time:
          new Date()
            .toISOString(),

        type:
          "room"
      };

      roomMessages[
        roomId
      ].push(message);

      roomMessages[
        roomId
      ] =
        roomMessages[
          roomId
        ].slice(-500);

      saveJSON(
        "roomMessages.json",
        roomMessages
      );

      io.to(
        `public:${roomId}`
      ).emit(
        "room message",
        message
      );

      io.to(
        `public:${roomId}`
      ).emit(
        "chat message",
        message
      );
    }

    socket.on(
      "room message",
      sendRoomMessage
    );

    socket.on(
      "room reply",
      sendRoomMessage
    );

    socket.on(
      "chat message",
      data => {

        if (
          data?.roomId ||
          getUser(socket)
            ?.roomId
        ) {
          return sendRoomMessage(
            data
          );
        }

        const user =
          getUser(socket);

        if (!user)
          return;

        if (
          !user.isAdmin &&
          globalDisconnect
        ) {
          return socket.emit(
            "global disconnect",
            {
              enabled: true,
              message:
                "⛔ أنت مفصول عن الدردشة العامة"
            }
          );
        }

        if (
          !user.isAdmin &&
          (
            maintenanceMode ||
            chatLocked
          )
        ) {
          return;
        }

        if (
          !user.isAdmin &&
          starsMode &&
          !stars.some(
            name =>
              sameName(
                name,
                user.name
              )
          )
        ) {
          return socket.emit(
            "chat error",
            "⭐ الكتابة لأصحاب النجمة فقط"
          );
        }

        if (
          mutedUsers.some(
            item =>
              sameName(
                item?.name,
                user.name
              ) ||
              item?.id ===
                socket.id
          )
        ) {
          return socket.emit(
            "chat error",
            "🔇 أنت مكتوم"
          );
        }

        const text =
          String(
            data?.message ||
              data?.text ||
              ""
          ).trim();

        if (!text)
          return;

        const message = {
          id: makeId(),

          username:
            user.name,

          name:
            user.name,

          message:
            text,

          text,

          color:
            user.color,

          reply:
            data?.reply ||
            null,

          timestamp:
            Date.now(),

          type:
            "global"
        };

        io.emit(
          "chat message",
          message
        );
      }
    );

    socket.on(
      "room typing",
      data => {

        const user =
          getUser(socket);

        const roomId =
          String(
            data?.roomId ||
              user?.roomId ||
              ""
          );

        if (
          !user ||
          !roomId
        ) {
          return;
        }

        socket.to(
          `public:${roomId}`
        ).emit(
          "room typing",
          {
            roomId,

            username:
              user.name,

            typing:
              data?.typing ===
              true
          }
        );
      }
    );

    socket.on(
      "private message",
      data => {

        const user =
          getUser(socket);

        if (!user)
          return;

        if (
          privateLocked &&
          !socket.adminData
        ) {
          return socket.emit(
            "chat error",
            "🔒 الرسائل الخاصة مقفلة حاليًا"
          );
        }

        const target =
          String(
            data?.to ||
              data?.socketId ||
              ""
          );

        const text =
          String(
            data?.message ||
              data?.text ||
              ""
          ).trim();

        if (
          !target ||
          !text
        ) {
          return;
        }

        let targetSocketId =
          target;

        const targetUser =
          findTarget(target);

        if (targetUser) {
          targetSocketId =
            targetUser.id;
        }

        const payload = {
          ...data,

          from:
            socket.id,

          fromName:
            user.name,

          username:
            user.name,

          message:
            text,

          text,

          timestamp:
            Date.now()
        };

        io.to(
          targetSocketId
        ).emit(
          "private message",
          payload
        );

        socket.emit(
          "private message",
          payload
        );
      }
    );

    /* =========================================================
       ADMIN LOGIN / DATA
       ========================================================= */

    socket.on(
      "admin panel login",
      data => {

        const name =
          String(
            data?.name ||
              ""
          );

        const password =
          String(
            data?.password ||
              ""
          );

        const admin =
          admins.find(
            item =>
              String(
                item.name
              ) === name &&
              String(
                item.password
              ) === password
          );

        if (!admin) {
          return socket.emit(
            "admin login failed"
          );
        }

        socket.adminData =
          admin;

        socket.emit(
          "admin login success",
          {
            permissions:
              admin.permissions ||
              {},

            isMaster:
              isMaster(admin),

            name:
              admin.name,

            role:
              isMaster(admin)
                ? "master"
                : "moderator"
          }
        );

        socket.emit(
          "admin online users",
          getPublicOnlineUsers()
        );

        socket.emit(
          "logs",
          logs
        );

        socket.emit(
          "admin logs",
          logs
        );

        emitAdminRooms(
          socket
        );

        socket.emit(
          "admin room permissions",
          {
            assignedRooms:
              admin.assignedRooms ||
              [],

            roomPermissions:
              admin.roomPermissions ||
              {},

            isMaster:
              isMaster(admin)
          }
        );

        socket.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );

        emitStats(socket);
      }
    );

    socket.on(
      "get admin users",
      () => {

        if (
          !socket.adminData
        ) {
          return;
        }

        socket.emit(
          "admin online users",
          getPublicOnlineUsers()
        );

        emitStats(socket);
      }
    );

    socket.on(
      "get rooms",
      () => {

        if (
          socket.adminData
        ) {
          emitAdminRooms(
            socket
          );
        } else {
          emitRooms(socket);
        }
      }
    );

    socket.on(
      "get logs",
      () => {

        if (
          !socket.adminData
        ) {
          return;
        }

        socket.emit(
          "logs",
          logs
        );

        socket.emit(
          "admin logs",
          logs
        );

        socket.emit(
          "get logs result",
          logs
        );
      }
    );

    function adminPublic(
      admin
    ) {
      return {
        name:
          admin.name,

        role:
          admin.role ||
          (
            isMaster(admin)
              ? "master"
              : "moderator"
          ),

        permissions:
          admin.permissions ||
          {},

        assignedRooms:
          admin.assignedRooms ||
          [],

        roomPermissions:
          admin.roomPermissions ||
          {}
      };
    }

    function requireGlobal(
      permission
    ) {
      return hasPermission(
        getAdmin(socket),
        permission
      );
    }

    socket.on(
      "view user",
      data => {

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "viewUserInfo"
          ) &&
          !hasPermission(
            admin,
            "viewIP"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        const target =
          findTarget(name);

        if (!target) {
          return socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );
        }

        socket.emit(
          "user info",
          {
            name:
              target.name,

            username:
              target.name,

            ip:
              target.ip,

            device:
              target.device,

            userAgent:
              target.device,

            roomId:
              target.roomId,

            role:
              target.role
          }
        );
      }
    );

    socket.on(
      "kick user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          targetNameFrom(
            data
          );

        const roomId =
          String(
            data?.roomId ||
              ""
          ).trim();

        const target =
          findTarget(name);

        if (!target) {
          return socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );
        }

        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "kick"
            )
          ) {
            return socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );
          }

          if (
            String(
              target.roomId
            ) === roomId
          ) {

            leaveRoomForUser(
              target,
              roomId,
              `👢 تم طرد ${target.name} من الغرفة`
            );

            targetSocket(
              target
            )?.emit(
              "room kicked",
              {
                roomId,

                message:
                  "👢 تم طردك من الغرفة"
              }
            );
          }

          addLog(
            `👢 تم طرد ${target.name} من الغرفة`,
            roomId
          );

          return;
        }

        if (
          !requireGlobal(
            "kick"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        targetSocket(
          target
        )?.emit(
          "kicked",
          "👢 تم طردك"
        );

        targetSocket(
          target
        )?.disconnect(
          true
        );

        addLog(
          `👢 ${target.name} تم طرده`
        );
      }
    );

    function roomBan(
      data,
      action = "ban"
    ) {

      const admin =
        getAdmin(socket);

      const roomId =
        String(
          data?.roomId ||
            ""
        ).trim();

      const name =
        targetNameFrom(
          data
        );

      if (
        !roomId ||
        !name
      ) {
        return socket.emit(
          "admin error",
          "❌ بيانات الغرفة غير صحيحة"
        );
      }

      const permission =
        action ===
        "unban"
          ? "unban"
          : "ban";

      if (
        !canRoom(
          admin,
          roomId,
          permission
        )
      ) {
        return socket.emit(
          "admin error",
          "❌ غير مصرح لهذه الغرفة"
        );
      }

      if (
        action === "ban"
      ) {

        addModeration(
          roomId,
          "banned",
          name,
          admin.name
        );

        const target =
          findTarget(name);

        if (
          target &&
          String(
            target.roomId
          ) === roomId
        ) {

          leaveRoomForUser(
            target,
            roomId,
            `🚫 تم حظر ${target.name} من الغرفة`
          );

          targetSocket(
            target
          )?.emit(
            "room banned",
            {
              roomId,

              message:
                "🚫 تم حظرك من الغرفة"
            }
          );
        }

        notifyRoom(
          roomId,
          `🚫 تم حظر ${name} من الغرفة`,
          "ban"
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room banned users",
          {
            roomId,

            banned:
              moderationList(
                roomId,
                "banned"
              )
          }
        );

        addLog(
          `🚫 تم حظر ${name} من الغرفة`,
          roomId
        );

      } else {

        removeModeration(
          roomId,
          "banned",
          name
        );

        notifyRoom(
          roomId,
          `🔓 تم فك حظر ${name}`,
          "unban"
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room banned users",
          {
            roomId,

            banned:
              moderationList(
                roomId,
                "banned"
              )
          }
        );

        addLog(
          `🔓 تم فك حظر ${name}`,
          roomId
        );
      }
    }

    socket.on(
      "ban room user",
      data =>
        roomBan(
          data,
          "ban"
        )
    );

    socket.on(
      "unban room user",
      data =>
        roomBan(
          data,
          "unban"
        )
    );

    socket.on(
      "ban user",
      data => {

        if (data?.roomId) {
          return roomBan(
            data,
            "ban"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "ban"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        const target =
          findTarget(name);

        if (!target) {
          return socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );
        }

        if (
          !bannedUsers.some(
            item =>
              String(
                item?.ip || ""
              ) ===
              String(
                target.ip
              )
          )
        ) {
          bannedUsers.push({
            name:
              target.name,

            ip:
              target.ip,

            time:
              Date.now(),

            by:
              admin.name
          });

          saveJSON(
            "banned.json",
            bannedUsers
          );
        }

        targetSocket(
          target
        )?.emit(
          "banned",
          "🚫 تم حظرك"
        );

        targetSocket(
          target
        )?.disconnect(
          true
        );

        addLog(
          `🚫 ${target.name} تم حظره`
        );

        emitOnline();
      }
    );

    socket.on(
      "unban user",
      data => {

        if (data?.roomId) {
          return roomBan(
            data,
            "unban"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "unban"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        bannedUsers =
          bannedUsers.filter(
            item =>
              !sameName(
                item?.name,
                name
              )
          );

        saveJSON(
          "banned.json",
          bannedUsers
        );

        addLog(
          `🔓 تم فك حظر ${name}`
        );

        emitOnline();
      }
    );

    function roomMute(
      data,
      action = "mute"
    ) {

      const admin =
        getAdmin(socket);

      const roomId =
        String(
          data?.roomId ||
            ""
        ).trim();

      const name =
        targetNameFrom(
          data
        );

      if (
        !roomId ||
        !name
      ) {
        return socket.emit(
          "admin error",
          "❌ بيانات الغرفة غير صحيحة"
        );
      }

      if (
        !canRoom(
          admin,
          roomId,
          action ===
          "unmute"
            ? "mute"
            : "mute"
        ) &&
        !canRoom(
          admin,
          roomId,
          action
        )
      ) {
        return socket.emit(
          "admin error",
          "❌ غير مصرح لهذه الغرفة"
        );
      }

      if (
        action ===
        "mute"
      ) {

        addModeration(
          roomId,
          "muted",
          name,
          admin.name
        );

        const target =
          findTarget(name);

        if (
          target &&
          String(
            target.roomId
          ) === roomId
        ) {
          targetSocket(
            target
          )?.emit(
            "room muted",
            {
              roomId,

              message:
                "🔇 تم كتمك"
            }
          );
        }

        notifyRoom(
          roomId,
          `🔇 تم كتم ${name}`,
          "mute"
        );

      } else {

        removeModeration(
          roomId,
          "muted",
          name
        );

        const target =
          findTarget(name);

        if (
          target &&
          String(
            target.roomId
          ) === roomId
        ) {
          targetSocket(
            target
          )?.emit(
            "room unmuted",
            {
              roomId,

              message:
                "🔊 تم فك كتمك"
            }
          );
        }

        notifyRoom(
          roomId,
          `🔊 تم فك كتم ${name}`,
          "unmute"
        );
      }

      io.to(
        `public:${roomId}`
      ).emit(
        "room users",
        roomUsers(roomId)
      );
    }

    socket.on(
      "mute room user",
      data =>
        roomMute(
          data,
          "mute"
        )
    );

    socket.on(
      "unmute room user",
      data =>
        roomMute(
          data,
          "unmute"
        )
    );

    socket.on(
      "mute user",
      data => {

        if (data?.roomId) {
          return roomMute(
            data,
            "mute"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "mute"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        const target =
          findTarget(name);

        if (!target) {
          return socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );
        }

        if (
          !mutedUsers.some(
            item =>
              item?.id ===
                target.id ||
              sameName(
                item?.name,
                name
              )
          )
        ) {
          mutedUsers.push({
            id:
              target.id,

            name:
              target.name,

            time:
              Date.now(),

            by:
              admin.name
          });
        }

        saveJSON(
          "muted.json",
          mutedUsers
        );

        targetSocket(
          target
        )?.emit(
          "banned",
          "🔇 تم كتمك"
        );

        addLog(
          `🔇 ${target.name} تم كتمه`
        );
      }
    );

    socket.on(
      "unmute user",
      data => {

        if (data?.roomId) {
          return roomMute(
            data,
            "unmute"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "mute"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        mutedUsers =
          mutedUsers.filter(
            item =>
              !sameName(
                item?.name,
                name
              )
          );

        saveJSON(
          "muted.json",
          mutedUsers
        );

        addLog(
          `🔊 تم فك كتم ${name}`
        );
      }
    );

    function roomDisconnect(
      data,
      action = "disconnect"
    ) {

      const admin =
        getAdmin(socket);

      const roomId =
        String(
          data?.roomId ||
            ""
        ).trim();

      const name =
        targetNameFrom(
          data
        );

      if (
        !roomId ||
        !name
      ) {
        return socket.emit(
          "admin error",
          "❌ بيانات الغرفة غير صحيحة"
        );
      }

      const allowed =
        canRoom(
          admin,
          roomId,
          "disconnect"
        ) ||
        (
          action ===
          "undisconnect" &&
          canRoom(
            admin,
            roomId,
            "disconnect"
          )
        );

      if (!allowed) {
        return socket.emit(
          "admin error",
          "❌ غير مصرح لهذه الغرفة"
        );
      }

      if (
        action ===
        "disconnect"
      ) {

        addModeration(
          roomId,
          "disconnected",
          name,
          admin.name
        );

        const target =
          findTarget(name);

        if (
          target &&
          String(
            target.roomId
          ) === roomId
        ) {

          leaveRoomForUser(
            target,
            roomId,
            `⛔ تم فصل ${target.name} من الغرفة`
          );

          targetSocket(
            target
          )?.emit(
            "room disconnected",
            {
              roomId,

              message:
                "⛔ تم فصلك من الغرفة"
            }
          );
        }

        notifyRoom(
          roomId,
          `⛔ تم فصل ${name} من الغرفة`,
          "disconnect"
        );

      } else {

        removeModeration(
          roomId,
          "disconnected",
          name
        );

        notifyRoom(
          roomId,
          `🔊 تم السماح لـ ${name} بالدخول مجددًا`,
          "undisconnect"
        );
      }
    }

    socket.on(
      "disconnect room user",
      data =>
        roomDisconnect(
          data,
          "disconnect"
        )
    );

    socket.on(
      "undisconnect room user",
      data =>
        roomDisconnect(
          data,
          "undisconnect"
        )
    );

    socket.on(
      "disconnect user",
      data => {

        if (data?.roomId) {
          return roomDisconnect(
            data,
            "disconnect"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "disconnect"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        const target =
          findTarget(name);

        if (!target) {
          return socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );
        }

        targetSocket(
          target
        )?.emit(
          "disconnected",
          "⛔ تم فصلك"
        );

        targetSocket(
          target
        )?.disconnect(
          true
        );

        addLog(
          `⛔ ${target.name} تم فصله`
        );
      }
    );

    socket.on(
      "delete message",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          ).trim();

        const messageId =
          String(
            data?.messageId ||
              data?.id ||
              ""
          );

        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "deleteMessage"
            )
          ) {
            return socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );
          }

          roomMessages[
            roomId
          ] =
            (
              roomMessages[
                roomId
              ] || []
            ).filter(
              message =>
                String(
                  message.id
                ) !==
                messageId
            );

          saveJSON(
            "roomMessages.json",
            roomMessages
          );

          io.to(
            `public:${roomId}`
          ).emit(
            "message deleted",
            {
              roomId,

              messageId
            }
          );

          return;
        }

        if (
          !hasPermission(
            admin,
            "deleteMessage"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        io.emit(
          "message deleted",
          {
            messageId
          }
        );
      }
    );

    socket.on(
      "clear room messages",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          ).trim();

        if (
          !canRoom(
            admin,
            roomId,
            "clear"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح لهذه الغرفة"
          );
        }

        roomMessages[
          roomId
        ] = [];

        saveJSON(
          "roomMessages.json",
          roomMessages
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room messages cleared",
          {
            roomId
          }
        );
      }
    );

    /* =========================================================
       ROOM MANAGEMENT
       ========================================================= */

    socket.on(
      "create room",
      data => {

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "rooms"
          ) &&
          !isMaster(admin)
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح بإنشاء الغرف"
          );
        }

        const name =
          String(
            data?.name ||
              ""
          ).trim();

        const description =
          String(
            data?.description ||
              ""
          ).trim();

        if (!name) {
          return socket.emit(
            "room error",
            "❌ اكتب اسم الغرفة"
          );
        }

        if (
          rooms.some(
            room =>
              sameName(
                room.name,
                name
              )
          )
        ) {
          return socket.emit(
            "room error",
            "❌ اسم الغرفة موجود بالفعل"
          );
        }

        const room =
          normalizeRoom({
            id:
              `room_${makeId()}`,

            name,

            description,

            enabled:
              true,

            settings:
              {}
          });

        rooms.push(room);

        ensureRoomData(
          room.id
        );

        saveJSON(
          "rooms.json",
          rooms
        );

        saveJSON(
          "roomStars.json",
          roomStars
        );

        saveJSON(
          "roomMessages.json",
          roomMessages
        );

        saveJSON(
          "roomModeration.json",
          roomModerationData
        );

        io.emit(
          "rooms",
          rooms.filter(
            r =>
              r.enabled !==
                false &&
              r.settings
                .enabled !==
                false
          )
        );

        io.emit(
          "rooms updated",
          rooms
        );

        emitAdminRooms(
          socket
        );

        socket.emit(
          "room created",
          room
        );

        addLog(
          `🏠 تم إنشاء الغرفة ${room.name}`,
          room.id
        );
      }
    );

    socket.on(
      "edit room",
      data => {

        const admin =
          getAdmin(socket);

        const room =
          getRoom(
            data?.roomId
          );

        if (
          !room ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح"
          );
        }

        if (
          data?.name !==
          undefined
        ) {

          const name =
            String(
              data.name
            ).trim();

          if (!name) {
            return socket.emit(
              "room error",
              "❌ اسم الغرفة لا يمكن أن يكون فارغًا"
            );
          }

          if (
            rooms.some(
              item =>
                item.id !==
                  room.id &&
                sameName(
                  item.name,
                  name
                )
            )
          ) {
            return socket.emit(
              "room error",
              "❌ اسم الغرفة موجود بالفعل"
            );
          }

          room.name =
            name;
        }

        if (
          data?.description !==
          undefined
        ) {
          room.description =
            String(
              data.description
            ).trim();
        }

        saveJSON(
          "rooms.json",
          rooms
        );

        io.emit(
          "rooms",
          rooms.filter(
            r =>
              r.enabled !==
                false &&
              r.settings
                .enabled !==
                false
          )
        );

        emitAdminRooms(
          socket
        );

        socket.emit(
          "room updated",
          room
        );
      }
    );

    socket.on(
      "update room",
      data => {

        const admin =
          getAdmin(socket);

        const room =
          getRoom(
            data?.roomId
          );

        if (
          !room ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح"
          );
        }

        if (
          data?.name !==
          undefined
        ) {
          room.name =
            String(
              data.name
            ).trim();
        }

        if (
          data?.description !==
          undefined
        ) {
          room.description =
            String(
              data.description
            ).trim();
        }

        if (
          data?.enabled !==
          undefined
        ) {
          room.enabled =
            !!data.enabled;

          room.settings.enabled =
            !!data.enabled;
        }

        saveJSON(
          "rooms.json",
          rooms
        );

        io.emit(
          "rooms",
          rooms.filter(
            r =>
              r.enabled !==
                false &&
              r.settings
                .enabled !==
                false
          )
        );

        emitAdminRooms(
          socket
        );

        socket.emit(
          "room updated",
          room
        );
      }
    );

    socket.on(
      "delete room",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          ).trim();

        const room =
          getRoom(roomId);

        if (
          !room ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح"
          );
        }

        for (
          const user of
          users.filter(
            item =>
              String(
                item.roomId
              ) === roomId
          )
        ) {

          leaveRoomForUser(
            user,
            roomId,
            null
          );

          targetSocket(
            user
          )?.emit(
            "room deleted",
            {
              roomId
            }
          );
        }

        rooms =
          rooms.filter(
            item =>
              String(
                item.id
              ) !== roomId
          );

        delete roomStars[
          roomId
        ];

        delete roomMessages[
          roomId
        ];

        delete roomModerationData[
          roomId
        ];

        saveJSON(
          "rooms.json",
          rooms
        );

        saveJSON(
          "roomStars.json",
          roomStars
        );

        saveJSON(
          "roomMessages.json",
          roomMessages
        );

        saveJSON(
          "roomModeration.json",
          roomModerationData
        );

        io.emit(
          "rooms",
          rooms.filter(
            r =>
              r.enabled !==
                false &&
              r.settings
                .enabled !==
                false
          )
        );

        io.emit(
          "rooms updated",
          rooms
        );

        socket.emit(
          "room deleted",
          {
            roomId
          }
        );

        addLog(
          `🗑️ تم حذف الغرفة ${room.name}`,
          roomId
        );

        emitOnline();
      }
    );

    socket.on(
      "toggle room",
      data => {

        const admin =
          getAdmin(socket);

        const room =
          getRoom(
            data?.roomId
          );

        if (
          !room ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح"
          );
        }

        const enabled =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !room.enabled;

        room.enabled =
          enabled;

        room.settings.enabled =
          enabled;

        saveJSON(
          "rooms.json",
          rooms
        );

        io.emit(
          "rooms",
          rooms.filter(
            r =>
              r.enabled !==
                false &&
              r.settings
                .enabled !==
                false
          )
        );

        emitAdminRooms(
          socket
        );

        io.to(
          `public:${room.id}`
        ).emit(
          "room setting changed",
          {
            roomId:
              room.id,

            setting:
              "enabled",

            value:
              enabled
          }
        );
      }
    );

    socket.on(
      "room setting",
      data => {

        const admin =
          getAdmin(socket);

        const room =
          getRoom(
            data?.roomId
          );

        const key =
          String(
            data?.setting ||
              data?.key ||
              ""
          );

        const permission =
          [
            "stars",
            "starsMode"
          ].includes(key)
            ? "stars"
            : [
                "chatLock",
                "chatLocked"
              ].includes(key)
              ? "chatLock"
              : key ===
                "maintenance"
              ? "maintenance"
              : key ===
                "protection"
              ? "roomSettings"
              : "roomSettings";

        if (
          !room ||
          !canRoom(
            admin,
            room.id,
            permission
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح لهذا الإعداد"
          );
        }

        const value =
          !!data?.value;

        if (
          key ===
            "chatLock" ||
          key ===
            "chatLocked"
        ) {
          room.settings.chatLock =
            value;

          room.settings.chatLocked =
            value;

        } else if (
          key ===
            "stars" ||
          key ===
            "starsMode"
        ) {
          room.settings.stars =
            value;

          room.settings.starsMode =
            value;

        } else {
          room.settings[
            key
          ] = value;
        }

        saveJSON(
          "rooms.json",
          rooms
        );

        io.to(
          `public:${room.id}`
        ).emit(
          "room settings",
          {
            roomId:
              room.id,

            settings:
              room.settings
          }
        );

        io.emit(
          "rooms updated",
          rooms
        );
      }
    );

    socket.on(
      "toggle room stars",
      data => {

        const admin =
          getAdmin(socket);

        const room =
          getRoom(
            data?.roomId
          );

        if (
          !room ||
          !canRoom(
            admin,
            room.id,
            "stars"
          )
        ) {
          return socket.emit(
            "room error",
            "❌ غير مصرح"
          );
        }

        const enabled =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !(
                room.settings
                  .stars ||
                room.settings
                  .starsMode
              );

        room.settings.stars =
          enabled;

        room.settings.starsMode =
          enabled;

        saveJSON(
          "rooms.json",
          rooms
        );

        io.to(
          `public:${room.id}`
        ).emit(
          "room stars mode",
          {
            roomId:
              room.id,

            enabled
          }
        );

        io.to(
          `public:${room.id}`
        ).emit(
          "room settings",
          {
            roomId:
              room.id,

            settings:
              room.settings
          }
        );
      }
    );

    socket.on(
      "get room state",
      data => {

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const room =
          getRoom(roomId);

        if (!room)
          return;

        ensureRoomData(
          roomId
        );

        socket.emit(
          "room state",
          {
            roomId,

            room,

            settings:
              room.settings,

            users:
              roomUsers(
                roomId
              ),

            messages:
              roomMessages[
                roomId
              ],

            stars:
              roomStars[
                roomId
              ]
          }
        );
      }
    );

    socket.on(
      "get room moderation",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            typeof data ===
              "string"
              ? data
              : data?.roomId ||
                ""
          );

        if (
          !canRoom(
            admin,
            roomId
          ) &&
          !isMaster(admin)
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        socket.emit(
          "room moderation data",
          {
            roomId,

            moderation:
              ensureRoomData(
                roomId
              )
          }
        );
      }
    );

    socket.on(
      "get room banned users",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            typeof data ===
              "string"
              ? data
              : data?.roomId ||
                ""
          );

        if (
          !canRoom(
            admin,
            roomId
          ) &&
          !isMaster(admin)
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        socket.emit(
          "room banned users",
          {
            roomId,

            banned:
              moderationList(
                roomId,
                "banned"
              )
          }
        );
      }
    );

    /* =========================================================
       ROOM STARS
       ========================================================= */

    socket.on(
      "give room star",
      data => {

        const user =
          getUser(socket);

        const roomId =
          String(
            data?.roomId ||
              user?.roomId ||
              ""
          );

        const targetName =
          String(
            data?.username ||
              data?.name ||
              ""
          ).trim();

        const room =
          getRoom(roomId);

        if (
          !user ||
          !room
        ) {
          return;
        }

        ensureRoomData(
          roomId
        );

        if (
          !(
            room.settings
              .stars ||
            room.settings
              .starsMode
          )
        ) {
          return socket.emit(
            "room error",
            "⭐ النجوم غير مفعلة"
          );
        }

        if (
          String(
            user.roomId
          ) !== roomId
        ) {
          return socket.emit(
            "room error",
            "❌ يجب أن تكون داخل الغرفة"
          );
        }

        const target =
          users.find(
            item =>
              sameName(
                item.name,
                targetName
              ) &&
              String(
                item.roomId
              ) === roomId
          );

        if (!target) {
          return socket.emit(
            "room error",
            "❌ المستخدم غير موجود"
          );
        }

        const admin =
          getAdmin(socket);

        if (
          !user.isAdmin &&
          !hasPermission(
            admin,
            "stars",
            roomId
          )
        ) {
          // Normal users may give a star.
        }

        if (
          roomStars[
            roomId
          ].some(
            item =>
              sameName(
                item.to,
                target.name
              ) &&
              sameName(
                item.from,
                user.name
              )
          )
        ) {
          return socket.emit(
            "room error",
            "⭐ النجمة موجودة بالفعل"
          );
        }

        const star = {
          id:
            makeId(),

          roomId,

          from:
            user.name,

          to:
            target.name,

          timestamp:
            Date.now()
        };

        roomStars[
          roomId
        ].push(star);

        saveJSON(
          "roomStars.json",
          roomStars
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room star given",
          star
        );

        io.to(
          `public:${roomId}`
        ).emit(
          "room stars",
          {
            roomId,

            enabled:
              true,

            stars:
              roomStars[
                roomId
              ]
          }
        );
      }
    );

    socket.on(
      "remove room star",
      data => {

        const user =
          getUser(socket);

        const roomId =
          String(
            data?.roomId ||
              user?.roomId ||
              ""
          );

        const targetName =
          String(
            data?.username ||
              data?.name ||
              ""
          );

        if (
          !user ||
          !roomId
        ) {
          return;
        }

        ensureRoomData(
          roomId
        );

        const before =
          roomStars[
            roomId
          ].length;

        roomStars[
          roomId
        ] =
          roomStars[
            roomId
          ].filter(
            item =>
              !(
                sameName(
                  item.from,
                  user.name
                ) &&
                sameName(
                  item.to,
                  targetName
                )
              )
          );

        if (
          roomStars[
            roomId
          ].length !==
          before
        ) {

          saveJSON(
            "roomStars.json",
            roomStars
          );

          io.to(
            `public:${roomId}`
          ).emit(
            "room stars",
            {
              roomId,

              enabled:
                !!getRoom(
                  roomId
                )?.settings.stars,

              stars:
                roomStars[
                  roomId
                ]
            }
          );
        }
      }
    );

    socket.on(
      "get room stars",
      data => {

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        if (
          !getRoom(roomId)
        ) {
          return;
        }

        ensureRoomData(
          roomId
        );

        socket.emit(
          "room stars",
          {
            roomId,

            enabled:
              !!getRoom(
                roomId
              )?.settings.stars,

            stars:
              roomStars[
                roomId
              ]
          }
        );
      }
    );

    socket.on(
      "get room star count",
      data => {

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const name =
          String(
            data?.username ||
              data?.name ||
              ""
          );

        if (
          !getRoom(roomId)
        ) {
          return;
        }

        ensureRoomData(
          roomId
        );

        socket.emit(
          "room star count",
          {
            roomId,

            username:
              name,

            count:
              roomStars[
                roomId
              ].filter(
                item =>
                  sameName(
                    item.to,
                    name
                  )
              ).length
          }
        );
      }
    );

    socket.on(
      "room admin notice",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        if (
          !canRoom(
            admin,
            roomId
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        notifyRoom(
          roomId,
          `✨ تم توكيل ${admin.name}`,
          "admin"
        );
      }
    );

    socket.on(
      "send room notice",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const message =
          String(
            data?.message ||
              ""
          ).trim();

        if (
          !canRoom(
            admin,
            roomId
          ) ||
          !message
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        notifyRoom(
          roomId,
          message,
          "admin"
        );
      }
    );

    /* =========================================================
       ROOM ADMIN ASSIGNMENTS
       ========================================================= */

    socket.on(
      "get room admins",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        if (
          !canRoom(
            admin,
            roomId
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const list =
          admins.filter(
            item =>
              (
                item.assignedRooms ||
                []
              )
                .map(String)
                .includes(
                  roomId
                )
          );

        socket.emit(
          "room admins",
          list.map(
            adminPublic
          )
        );
      }
    );

    socket.on(
      "assign room admin",
      data => {

        const master =
          getAdmin(socket);

        if (
          !isMaster(master)
        ) {
          return socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );
        }

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const name =
          String(
            data?.name ||
              data?.adminName ||
              ""
          ).trim();

        const target =
          admins.find(
            item =>
              sameName(
                item.name,
                name
              )
          );

        if (
          !target ||
          !getRoom(roomId)
        ) {
          return socket.emit(
            "admin error",
            "❌ البيانات غير صحيحة"
          );
        }

        target.assignedRooms =
          Array.from(
            new Set([
              ...(
                target.assignedRooms ||
                []
              ).map(String),

              roomId
            ])
          );

        saveJSON(
          "admins.json",
          admins
        );

        io.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );

        emitAdminRooms(
          socket
        );

        socket.emit(
          "room admins",
          admins
            .filter(
              item =>
                (
                  item.assignedRooms ||
                  []
                )
                  .map(String)
                  .includes(
                    roomId
                  )
            )
            .map(
              adminPublic
            )
        );

        addLog(
          `👑 تم تعيين ${name} في الغرفة ${getRoom(roomId).name}`,
          roomId
        );
      }
    );

    socket.on(
      "remove room admin",
      data => {

        const master =
          getAdmin(socket);

        if (
          !isMaster(master)
        ) {
          return socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );
        }

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const name =
          String(
            data?.name ||
              data?.adminName ||
              ""
          ).trim();

        const target =
          admins.find(
            item =>
              sameName(
                item.name,
                name
              )
          );

        if (!target)
          return;

        target.assignedRooms =
          (
            target.assignedRooms ||
            []
          ).filter(
            id =>
              String(id) !==
              roomId
          );

        if (
          target.roomPermissions
        ) {
          delete target
            .roomPermissions[
              roomId
            ];
        }

        saveJSON(
          "admins.json",
          admins
        );

        io.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );

        emitAdminRooms(
          socket
        );
      }
    );

    socket.on(
      "update room admin permissions",
      data => {

        const master =
          getAdmin(socket);

        if (
          !isMaster(master)
        ) {
          return socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );
        }

        const roomId =
          String(
            data?.roomId ||
              ""
          );

        const name =
          String(
            data?.name ||
              data?.adminName ||
              ""
          ).trim();

        const target =
          admins.find(
            item =>
              sameName(
                item.name,
                name
              )
          );

        if (
          !target ||
          !getRoom(roomId)
        ) {
          return socket.emit(
            "admin error",
            "❌ البيانات غير صحيحة"
          );
        }

        target.roomPermissions =
          target.roomPermissions ||
          {};

        target.roomPermissions[
          roomId
        ] = {
          ...(
            target.roomPermissions[
              roomId
            ] || {}
          ),

          ...(data?.permissions ||
            {})
        };

        saveJSON(
          "admins.json",
          admins
        );

        io.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );
      }
    );

    /* =========================================================
       ADMIN MANAGEMENT
       ========================================================= */

    socket.on(
      "add admin",
      data => {

        if (
          !requireGlobal(
            "addAdmin"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          String(
            data?.name ||
              ""
          ).trim();

        const password =
          String(
            data?.password ||
              ""
          );

        if (
          !name ||
          !password
        ) {
          return socket.emit(
            "admin error",
            "❌ اكتب اسم الأدمن وكلمة المرور"
          );
        }

        if (
          admins.some(
            item =>
              sameName(
                item.name,
                name
              )
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ الأدمن موجود بالفعل"
          );
        }

        const admin = {
          name,

          password,

          role:
            "moderator",

          permissions:
            data?.permissions ||
            {},

          assignedRooms:
            Array.isArray(
              data?.assignedRooms
            )
              ? data.assignedRooms.map(
                  String
                )
              : [],

          roomPermissions:
            data?.roomPermissions ||
            {}
        };

        admins.push(
          admin
        );

        saveJSON(
          "admins.json",
          admins
        );

        io.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );

        socket.emit(
          "admin added",
          adminPublic(admin)
        );

        addLog(
          `👮 تمت إضافة ${name}`
        );
      }
    );

    socket.on(
      "remove admin",
      data => {

        if (
          !requireGlobal(
            "removeAdmin"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        if (!name)
          return;

        if (
          admins.length <= 1
        ) {
          return socket.emit(
            "admin error",
            "❌ لا يمكن حذف آخر أدمن"
          );
        }

        admins =
          admins.filter(
            item =>
              !sameName(
                item.name,
                name
              )
          );

        saveJSON(
          "admins.json",
          admins
        );

        io.emit(
          "admins list",
          admins.map(
            adminPublic
          )
        );

        addLog(
          `🗑️ تم حذف الأدمن ${name}`
        );
      }
    );

    /* =========================================================
       GLOBAL SETTINGS
       ========================================================= */

    socket.on(
      "toggle maintenance",
      data => {

        if (
          !requireGlobal(
            "maintenance"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        maintenanceMode =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !maintenanceMode;

        io.emit(
          "maintenance mode",
          maintenanceMode
        );
      }
    );

    socket.on(
      "toggle chat lock",
      data => {

        if (
          !requireGlobal(
            "chatLock"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        chatLocked =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !chatLocked;

        io.emit(
          "chat lock",
          chatLocked
        );
      }
    );

    socket.on(
      "toggle private lock",
      data => {

        if (
          !requireGlobal(
            "privateLock"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        privateLocked =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !privateLocked;

        io.emit(
          "private lock",
          privateLocked
        );
      }
    );

    socket.on(
      "toggle stars mode",
      data => {

        if (data?.roomId) {

          const room =
            getRoom(
              data.roomId
            );

          if (
            !room ||
            !canRoom(
              getAdmin(socket),
              room.id,
              "stars"
            )
          ) {
            return socket.emit(
              "admin error",
              "❌ غير مصرح"
            );
          }

          const enabled =
            data?.enabled !==
            undefined
              ? !!data.enabled
              : !(
                  room.settings
                    .stars ||
                  room.settings
                    .starsMode
                );

          room.settings.stars =
            enabled;

          room.settings.starsMode =
            enabled;

          saveJSON(
            "rooms.json",
            rooms
          );

          io.to(
            `public:${room.id}`
          ).emit(
            "room stars mode",
            {
              roomId:
                room.id,

              enabled
            }
          );

          io.to(
            `public:${room.id}`
          ).emit(
            "room settings",
            {
              roomId:
                room.id,

              settings:
                room.settings
            }
          );

          return;
        }

        if (
          !requireGlobal(
            "stars"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        starsMode =
          data?.enabled !==
          undefined
            ? !!data.enabled
            : !starsMode;

        io.emit(
          "stars mode",
          starsMode
        );
      }
    );

    socket.on(
      "give star",
      data => {

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "stars"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        if (!name)
          return;

        if (
          !stars.some(
            item =>
              sameName(
                item,
                name
              )
          )
        ) {
          stars.push(name);
        }

        saveJSON(
          "stars.json",
          stars
        );

        io.emit(
          "stars updated",
          stars
        );
      }
    );

    socket.on(
      "remove star",
      data => {

        const admin =
          getAdmin(socket);

        if (
          !hasPermission(
            admin,
            "stars"
          )
        ) {
          return socket.emit(
            "admin error",
            "❌ غير مصرح"
          );
        }

        const name =
          targetNameFrom(
            data
          );

        stars =
          stars.filter(
            item =>
              !sameName(
                item,
                name
              )
          );

        saveJSON(
          "stars.json",
          stars
        );

        io.emit(
          "stars updated",
          stars
        );
      }
    );

    socket.on(
      "disconnect",
      () => {

        const user =
          getUserBySocket(
            socket
          );

        if (!user)
          return;

        const roomId =
          user.roomId;

        if (roomId) {

          notifyRoom(
            roomId,
            `🚪 غادر ${user.name} الغرفة`,
            "leave"
          );

          io.to(
            `public:${roomId}`
          ).emit(
            "room users",
            roomUsers(
              roomId
            ).filter(
              item =>
                item.id !==
                user.id
            )
          );
        }

        users =
          users.filter(
            item =>
              item.id !==
              socket.id
          );

        emitOnline();

        addLog(
          `👋 ${user.name} خرج`
        );
      }
    );
  }
);

process.on(
  "SIGINT",
  () => {
    saveAll();
    process.exit(0);
  }
);

process.on(
  "SIGTERM",
  () => {
    saveAll();
    process.exit(0);
  }
);

const PORT =
  process.env.PORT ||
  10000;

server.listen(
  PORT,
  () => {
    console.log(
      `🚀 Mersal Chat running on port ${PORT}`
    );

    console.log(
      `🏠 Rooms: ${rooms.length}`
    );

    console.log(
      `🔐 Global control: ${GLOBAL_CONTROL_PATH}`
    );
  }
);
