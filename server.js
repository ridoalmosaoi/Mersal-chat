const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

/* =========================================================
   FILES
========================================================= */

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES = {
  admins: path.join(DATA_DIR, "admins.json"),
  rooms: path.join(DATA_DIR, "rooms.json"),
  banned: path.join(DATA_DIR, "banned.json"),
  muted: path.join(DATA_DIR, "muted.json"),
  deviceBanned: path.join(DATA_DIR, "deviceBanned.json"),
  stars: path.join(DATA_DIR, "stars.json"),
  logs: path.join(DATA_DIR, "logs.json")
};

/* =========================================================
   DEFAULT DATA
========================================================= */

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );

      return fallback;
    }

    const data = fs.readFileSync(file, "utf8");

    if (!data.trim()) {
      return fallback;
    }

    return JSON.parse(data);
  } catch (error) {
    console.error("JSON LOAD ERROR:", file, error);
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("JSON SAVE ERROR:", file, error);
  }
}

/* =========================================================
   DATA
========================================================= */

let admins = loadJSON(FILES.admins, [
  {
    name: "a",
    password: "a",
    permissions: {
      kick: true,
      ban: true,
      disconnect: true,
      unban: true,
      mute: true,
      unmute: true,
      clear: true,
      maintenance: true,
      chatLock: true,
      privateLock: true,
      deleteMessage: true,
      addAdmin: true,
      removeAdmin: true,
      viewIP: true,
      viewUserInfo: true,
      stars: true,
      rooms: true,
      roomSettings: true
    }
  }
]);

let rooms = loadJSON(FILES.rooms, []);

let bannedUsers = loadJSON(FILES.banned, []);
let mutedUsers = loadJSON(FILES.muted, []);
let deviceBannedUsers = loadJSON(FILES.deviceBanned, []);
let stars = loadJSON(FILES.stars, []);
let logs = loadJSON(FILES.logs, []);

/* =========================================================
   ONLINE USERS
========================================================= */

let users = [];

/*
  users:
  {
    socketId,
    name,
    username,
    ip,
    userAgent,
    device,
    roomId,
    loggedIn,
    connectedAt
  }
*/

/* =========================================================
   GLOBAL SETTINGS
========================================================= */

let maintenanceMode = false;
let chatLocked = false;
let privateLocked = false;

/* =========================================================
   ROOM ID
========================================================= */

function createId(prefix = "id") {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

/* =========================================================
   NORMALIZE ROOM
========================================================= */

function normalizeRoom(room) {
  if (!room || typeof room !== "object") {
    return null;
  }

  if (!room.id) {
    room.id = createId("room");
  }

  if (!room.name) {
    room.name = "غرفة";
  }

  if (!room.description) {
    room.description = "";
  }

  if (typeof room.enabled !== "boolean") {
    room.enabled = true;
  }

  if (!Array.isArray(room.messages)) {
    room.messages = [];
  }

  if (!room.admins || typeof room.admins !== "object") {
    room.admins = {};
  }

  if (!room.permissions || typeof room.permissions !== "object") {
    room.permissions = {};
  }

  if (!room.settings || typeof room.settings !== "object") {
    room.settings = {};
  }

  if (typeof room.settings.chatLock !== "boolean") {
    room.settings.chatLock = false;
  }

  if (typeof room.settings.maintenance !== "boolean") {
    room.settings.maintenance = false;
  }

  if (typeof room.settings.stars !== "boolean") {
    room.settings.stars = false;
  }

  if (typeof room.settings.protection !== "boolean") {
    room.settings.protection = false;
  }

  return room;
}

rooms = rooms
  .map(normalizeRoom)
  .filter(Boolean);

saveJSON(FILES.rooms, rooms);

/* =========================================================
   USER HELPERS
========================================================= */

function getUserBySocket(socketId) {
  return users.find(user => user.socketId === socketId);
}

function getUserByName(name) {
  if (!name) return null;

  const wanted = String(name).trim().toLowerCase();

  return users.find(user => {
    return String(user.name || "")
      .trim()
      .toLowerCase() === wanted;
  }) || null;
}

function getSocketByUserName(name) {
  const user = getUserByName(name);

  if (!user) {
    return null;
  }

  return io.sockets.sockets.get(user.socketId) || null;
}

/* =========================================================
   IP
========================================================= */

function getIP(socket) {
  if (!socket) return "";

  const forwarded = socket.handshake?.headers?.["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return (
    socket.handshake?.address ||
    socket.conn?.remoteAddress ||
    ""
  );
}

/* =========================================================
   DEVICE / USER AGENT
========================================================= */

function getUserAgent(socket) {
  return socket?.handshake?.headers?.["user-agent"] || "";
}

function getDeviceFromUserAgent(userAgent) {
  const ua = String(userAgent || "").toLowerCase();

  if (ua.includes("iphone")) {
    return "iPhone";
  }

  if (ua.includes("ipad")) {
    return "iPad";
  }

  if (ua.includes("android")) {
    return "Android";
  }

  if (ua.includes("windows")) {
    return "Windows";
  }

  if (ua.includes("macintosh")) {
    return "Mac";
  }

  if (ua.includes("linux")) {
    return "Linux";
  }

  return "Unknown";
}

/* =========================================================
   ADMIN HELPERS
========================================================= */

function findAdmin(name) {
  if (!name) return null;

  const wanted = String(name)
    .trim()
    .toLowerCase();

  return admins.find(admin => {
    return String(admin.name || "")
      .trim()
      .toLowerCase() === wanted;
  }) || null;
}

function isAdmin(name) {
  return !!findAdmin(name);
}

function getAdminPermissions(name) {
  const admin = findAdmin(name);

  if (!admin) {
    return {};
  }

  return admin.permissions || {};
}

function hasPermission(adminName, permission) {
  const permissions = getAdminPermissions(adminName);

  return permissions[permission] === true;
}

/* =========================================================
   MASTER ADMIN
========================================================= */

function isMasterAdmin(name) {
  const admin = findAdmin(name);

  if (!admin) {
    return false;
  }

  /*
    أول أدمن في admins يعتبر Master Admin
    ويمكن لاحقًا إضافة role: "master"
  */

  if (admin.role === "master") {
    return true;
  }

  if (admins.length > 0 && admins[0].name === admin.name) {
    return true;
  }

  return false;
}

/* =========================================================
   ROOM HELPERS
========================================================= */

function getRoom(roomId) {
  if (!roomId) return null;

  return rooms.find(room => {
    return String(room.id) === String(roomId);
  }) || null;
}

function getRoomByName(name) {
  if (!name) return null;

  const wanted = String(name)
    .trim()
    .toLowerCase();

  return rooms.find(room => {
    return String(room.name || "")
      .trim()
      .toLowerCase() === wanted;
  }) || null;
}

function saveRooms() {
  saveJSON(FILES.rooms, rooms);
}

/* =========================================================
   ROOM ADMIN
========================================================= */

function isRoomAdmin(adminName, roomId) {
  if (!adminName || !roomId) {
    return false;
  }

  if (isMasterAdmin(adminName)) {
    return true;
  }

  const room = getRoom(roomId);

  if (!room) {
    return false;
  }

  return !!room.admins?.[adminName];
}

/* =========================================================
   ROOM PERMISSION
========================================================= */

function hasRoomPermission(adminName, roomId, permission) {
  if (!isAdmin(adminName)) {
    return false;
  }

  if (isMasterAdmin(adminName)) {
    return true;
  }

  if (!isRoomAdmin(adminName, roomId)) {
    return false;
  }

  const room = getRoom(roomId);

  if (!room) {
    return false;
  }

  /*
    إذا لم توجد صلاحيات خاصة للغرفة،
    نستخدم صلاحيات الأدمن الأساسية.
  */

  if (
    room.permissions &&
    room.permissions[adminName] &&
    typeof room.permissions[adminName] === "object"
  ) {
    return room.permissions[adminName][permission] === true;
  }

  return hasPermission(adminName, permission);
}

/* =========================================================
   USER SERIALIZER
========================================================= */

function publicUser(user) {
  if (!user) return null;

  return {
    name: user.name,
    username: user.username || user.name,
    roomId: user.roomId || null
  };
}

function adminUser(user) {
  if (!user) return null;

  return {
    name: user.name,
    username: user.username || user.name,
    roomId: user.roomId || null,
    ip: user.ip || "",
    device: user.device || "",
    userAgent: user.userAgent || "",
    socketId: user.socketId || "",
    connectedAt: user.connectedAt || null
  };
}

/* =========================================================
   BROADCAST ONLINE USERS
========================================================= */

function broadcastOnlineUsers() {
  io.emit(
    "online users",
    users
      .filter(user => user.loggedIn)
      .map(publicUser)
  );
}

function broadcastAdminOnlineUsers() {
  io.emit(
    "admin online users",
    users
      .filter(user => user.loggedIn)
      .map(adminUser)
  );
}

/* =========================================================
   SERVER STATS
========================================================= */

function broadcastServerStats() {
  io.emit("server stats", {
    onlineUsers: users.filter(user => user.loggedIn).length,
    bannedUsers: bannedUsers.length,
    admins: admins.length,
    rooms: rooms.length
  });
}

/* =========================================================
   LOG
========================================================= */

function addLog(type, data = {}) {
  logs.push({
    id: createId("log"),
    type,
    data,
    time: new Date().toISOString()
  });

  if (logs.length > 5000) {
    logs = logs.slice(-5000);
  }

  saveJSON(FILES.logs, logs);
}
/* =========================================================
   BAN HELPERS
========================================================= */

function isUserBanned(name, ip) {
  const wantedName = String(name || "")
    .trim()
    .toLowerCase();

  const wantedIP = String(ip || "").trim();

  return bannedUsers.some(item => {
    if (!item) return false;

    if (typeof item === "string") {
      return (
        item.trim().toLowerCase() === wantedName ||
        item.trim() === wantedIP
      );
    }

    const itemName = String(
      item.name ||
      item.username ||
      ""
    )
      .trim()
      .toLowerCase();

    const itemIP = String(
      item.ip ||
      ""
    ).trim();

    return (
      (itemName && itemName === wantedName) ||
      (itemIP && itemIP === wantedIP)
    );
  });
}

function isDeviceBanned(deviceId, userAgent) {
  const wantedDevice = String(deviceId || "").trim();
  const wantedUA = String(userAgent || "").trim();

  return deviceBannedUsers.some(item => {
    if (!item) return false;

    if (typeof item === "string") {
      return (
        item === wantedDevice ||
        item === wantedUA
      );
    }

    return (
      (
        item.deviceId &&
        String(item.deviceId) === wantedDevice
      ) ||
      (
        item.userAgent &&
        String(item.userAgent) === wantedUA
      )
    );
  });
}

function isUserMuted(name, roomId) {
  const wantedName = String(name || "")
    .trim()
    .toLowerCase();

  return mutedUsers.some(item => {
    if (!item) return false;

    if (typeof item === "string") {
      return item.trim().toLowerCase() === wantedName;
    }

    const itemName = String(
      item.name ||
      item.username ||
      ""
    )
      .trim()
      .toLowerCase();

    if (itemName !== wantedName) {
      return false;
    }

    /*
      إذا كان الكتم مرتبطًا بغرفة،
      يجب أن تكون الغرفة نفسها.
    */

    if (item.roomId) {
      return String(item.roomId) === String(roomId);
    }

    return true;
  });
}

/* =========================================================
   ROOM BAN
========================================================= */

function isBannedFromRoom(name, roomId, ip) {
  const room = getRoom(roomId);

  if (!room) {
    return false;
  }

  if (!Array.isArray(room.bannedUsers)) {
    room.bannedUsers = [];
  }

  const wantedName = String(name || "")
    .trim()
    .toLowerCase();

  const wantedIP = String(ip || "").trim();

  return room.bannedUsers.some(item => {
    if (!item) return false;

    if (typeof item === "string") {
      return (
        item.trim().toLowerCase() === wantedName ||
        item.trim() === wantedIP
      );
    }

    const itemName = String(
      item.name ||
      item.username ||
      ""
    )
      .trim()
      .toLowerCase();

    const itemIP = String(
      item.ip ||
      ""
    ).trim();

    return (
      (itemName && itemName === wantedName) ||
      (itemIP && itemIP === wantedIP)
    );
  });
}

function isMutedFromRoom(name, roomId) {
  const room = getRoom(roomId);

  if (!room) {
    return false;
  }

  if (!Array.isArray(room.mutedUsers)) {
    room.mutedUsers = [];
  }

  const wantedName = String(name || "")
    .trim()
    .toLowerCase();

  return room.mutedUsers.some(item => {
    if (!item) return false;

    if (typeof item === "string") {
      return item.trim().toLowerCase() === wantedName;
    }

    const itemName = String(
      item.name ||
      item.username ||
      ""
    )
      .trim()
      .toLowerCase();

    return itemName === wantedName;
  });
}

/* =========================================================
   ROOM MESSAGE HELPERS
========================================================= */

function addRoomMessage(roomId, message) {
  const room = getRoom(roomId);

  if (!room) {
    return false;
  }

  if (!Array.isArray(room.messages)) {
    room.messages = [];
  }

  room.messages.push(message);

  /*
    لا نترك سجل الغرفة يكبر بلا حدود.
  */

  if (room.messages.length > 500) {
    room.messages = room.messages.slice(-500);
  }

  saveRooms();

  return true;
}

function getRoomMessages(roomId) {
  const room = getRoom(roomId);

  if (!room) {
    return [];
  }

  if (!Array.isArray(room.messages)) {
    room.messages = [];
    saveRooms();
  }

  return room.messages;
}

/* =========================================================
   ROOM PUBLIC DATA
========================================================= */

function publicRoom(room) {
  if (!room) return null;

  return {
    id: room.id,
    name: room.name,
    description: room.description || "",
    enabled: room.enabled !== false,
    usersCount: users.filter(
      user =>
        user.loggedIn &&
        String(user.roomId || "") === String(room.id)
    ).length,

    settings: {
      chatLock: !!room.settings?.chatLock,
      maintenance: !!room.settings?.maintenance,
      stars: !!room.settings?.stars,
      protection: !!room.settings?.protection
    }
  };
}

function getPublicRooms() {
  return rooms
    .filter(room => room && room.enabled !== false)
    .map(publicRoom);
}

/* =========================================================
   ROOM BROADCAST
========================================================= */

function broadcastRooms() {
  io.emit(
    "rooms updated",
    getPublicRooms()
  );

  io.emit(
    "admin rooms",
    rooms.map(publicRoom)
  );

  broadcastServerStats();
}

/* =========================================================
   ROOM USERS
========================================================= */

function getRoomUsers(roomId) {
  return users
    .filter(user => {
      return (
        user.loggedIn &&
        String(user.roomId || "") === String(roomId)
      );
    })
    .map(publicUser);
}

function broadcastRoomUsers(roomId) {
  const room = getRoom(roomId);

  if (!room) {
    return;
  }

  io.to(`room:${room.id}`).emit(
    "room users",
    getRoomUsers(room.id)
  );
}

/* =========================================================
   ROOM NOTIFICATION
========================================================= */

function roomNotification(roomId, message) {
  if (!roomId || !message) {
    return;
  }

  io.to(`room:${roomId}`).emit(
    "room notification",
    {
      roomId,
      message,
      time: new Date().toISOString()
    }
  );
}

/* =========================================================
   FIND USER IN ROOM
========================================================= */

function getUserInRoom(name, roomId) {
  const wanted = String(name || "")
    .trim()
    .toLowerCase();

  return users.find(user => {
    return (
      user.loggedIn &&
      String(user.name || "")
        .trim()
        .toLowerCase() === wanted &&
      String(user.roomId || "") === String(roomId)
    );
  }) || null;
}

/* =========================================================
   REMOVE USER FROM ROOM
========================================================= */

function leaveRoomSocket(socket, reason = "") {
  const user = getUserBySocket(socket.id);

  if (!user) {
    return;
  }

  const oldRoomId = user.roomId;

  if (oldRoomId) {
    socket.leave(`room:${oldRoomId}`);
  }

  user.roomId = null;

  if (oldRoomId) {
    broadcastRoomUsers(oldRoomId);
    broadcastRooms();
  }

  if (reason) {
    socket.emit(
      "room left",
      {
        roomId: oldRoomId,
        reason
      }
    );
  }
}

/* =========================================================
   CHANGE ROOM
========================================================= */

function changeUserRoom(socket, roomId) {
  const user = getUserBySocket(socket.id);

  if (!user) {
    return {
      ok: false,
      error: "يجب تسجيل الدخول أولًا"
    };
  }

  const room = getRoom(roomId);

  if (!room) {
    return {
      ok: false,
      error: "الغرفة غير موجودة"
    };
  }

  if (room.enabled === false) {
    return {
      ok: false,
      error: "هذه الغرفة غير متاحة حاليًا"
    };
  }

  if (
    isUserBanned(user.name, user.ip) ||
    isBannedFromRoom(user.name, room.id, user.ip)
  ) {
    return {
      ok: false,
      error: "🚫 أنت محظور من هذه الغرفة"
    };
  }

  const oldRoomId = user.roomId;

  if (
    oldRoomId &&
    String(oldRoomId) === String(room.id)
  ) {
    return {
      ok: true,
      room
    };
  }

  if (oldRoomId) {
    socket.leave(`room:${oldRoomId}`);
    broadcastRoomUsers(oldRoomId);
  }

  user.roomId = room.id;

  socket.join(`room:${room.id}`);

  broadcastRoomUsers(room.id);
  broadcastRooms();

  return {
    ok: true,
    room
  };
}

/* =========================================================
   USERNAME VALIDATION
========================================================= */

function isValidUsername(name) {
  if (!name) {
    return false;
  }

  const value = String(name).trim();

  if (value.length < 2 || value.length > 30) {
    return false;
  }

  /*
    منع الأسماء التي تحاول تقليد الرتب.
  */

  if (
    value.startsWith("&") ||
    value.startsWith("@")
  ) {
    return false;
  }

  const lower = value.toLowerCase();

  const reserved = [
    "admin",
    "administrator",
    "master",
    "moderator",
    "mod",
    "owner",
    "system",
    "server"
  ];

  if (reserved.includes(lower)) {
    return false;
  }

  /*
    منع اسم أدمن موجود.
  */

  if (isAdmin(value)) {
    return false;
  }

  return true;
}

/* =========================================================
   UNIQUE USERNAME
========================================================= */

function isUsernameTaken(name) {
  const wanted = String(name || "")
    .trim()
    .toLowerCase();

  return users.some(user => {
    return (
      user.loggedIn &&
      String(user.name || "")
        .trim()
        .toLowerCase() === wanted
    );
  });
}

/* =========================================================
   ADMIN ROLE LABEL
========================================================= */

function getUserRole(name) {
  if (isMasterAdmin(name)) {
    return "&";
  }

  if (isAdmin(name)) {
    return "@";
  }

  return "";
}

/* =========================================================
   ADMIN LOGIN DATA
========================================================= */

function getAdminLoginData(name) {
  const admin = findAdmin(name);

  if (!admin) {
    return null;
  }

  return {
    name: admin.name,
    role: isMasterAdmin(admin.name)
      ? "master"
      : "admin",
    prefix: isMasterAdmin(admin.name)
      ? "&"
      : "@",
    permissions: admin.permissions || {}
  };
}
/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on("connection", socket => {

  const ip = getIP(socket);
  const userAgent = getUserAgent(socket);
  const device = getDeviceFromUserAgent(userAgent);

  const sessionUser = {
    socketId: socket.id,
    name: "",
    username: "",
    ip,
    userAgent,
    device,
    roomId: null,
    loggedIn: false,
    connectedAt: new Date().toISOString()
  };

  users.push(sessionUser);

  /* =======================================================
     SEND INITIAL DATA
  ======================================================= */

  socket.emit(
    "rooms updated",
    getPublicRooms()
  );

  socket.emit(
    "admin rooms",
    rooms.map(publicRoom)
  );

  socket.emit(
    "server stats",
    {
      onlineUsers: users.filter(
        user => user.loggedIn
      ).length,

      bannedUsers: bannedUsers.length,

      admins: admins.length,

      rooms: rooms.length
    }
  );

  /* =======================================================
     LOGIN
  ======================================================= */

  socket.on("login", data => {

    const name = String(
      data?.name ||
      data?.username ||
      ""
    ).trim();

    if (!name) {
      socket.emit(
        "login failed",
        "❌ اكتب اسم المستخدم"
      );

      return;
    }

    if (!isValidUsername(name)) {
      socket.emit(
        "login failed",
        "❌ هذا الاسم غير مسموح به"
      );

      return;
    }

    if (isUsernameTaken(name)) {
      socket.emit(
        "login failed",
        "❌ هذا الاسم مستخدم حاليًا"
      );

      return;
    }

    if (
      isUserBanned(
        name,
        ip
      )
    ) {
      socket.emit(
        "login failed",
        "🚫 أنت محظور من دخول الشات"
      );

      return;
    }

    if (
      isDeviceBanned(
        device,
        userAgent
      )
    ) {
      socket.emit(
        "login failed",
        "🚫 هذا الجهاز محظور"
      );

      return;
    }

    sessionUser.name = name;
    sessionUser.username = name;
    sessionUser.loggedIn = true;

    /*
      إذا كان هناك اسم أدمن مطابق،
      لا نمنحه رتبة أدمن تلقائيًا.
      تسجيل الأدمن يتم من لوحة الإدارة.
    */

    addLog(
      "login",
      {
        name,
        ip,
        device
      }
    );

    socket.emit(
      "login success",
      {
        name,
        username: name,
        role: getUserRole(name),
        rooms: getPublicRooms()
      }
    );

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();
  });

  /* =======================================================
     LOGOUT
  ======================================================= */

  socket.on("logout", () => {

    const user = getUserBySocket(socket.id);

    if (!user) {
      return;
    }

    if (user.roomId) {
      socket.leave(
        `room:${user.roomId}`
      );
    }

    addLog(
      "logout",
      {
        name: user.name,
        ip: user.ip
      }
    );

    user.loggedIn = false;
    user.roomId = null;

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();
  });

  /* =======================================================
     GET ROOMS
  ======================================================= */

  socket.on("get rooms", () => {

    socket.emit(
      "rooms updated",
      getPublicRooms()
    );

    socket.emit(
      "admin rooms",
      rooms.map(publicRoom)
    );
  });

  /* =======================================================
     JOIN ROOM
  ======================================================= */

  socket.on("join room", data => {

    const roomId =
      typeof data === "string"
        ? data
        : data?.roomId;

    const result =
      changeUserRoom(
        socket,
        roomId
      );

    if (!result.ok) {

      socket.emit(
        "room error",
        result.error
      );

      return;
    }

    const room = result.room;

    socket.emit(
      "room joined",
      {
        room: publicRoom(room),
        messages: getRoomMessages(room.id),
        users: getRoomUsers(room.id)
      }
    );

    roomNotification(
      room.id,
      `👋 ${sessionUser.name} دخل الغرفة`
    );

    addLog(
      "join_room",
      {
        name: sessionUser.name,
        roomId: room.id,
        roomName: room.name
      }
    );

    broadcastRoomUsers(room.id);
    broadcastRooms();
  });

  /* =======================================================
     LEAVE ROOM
  ======================================================= */

  socket.on("leave room", () => {

    const user = getUserBySocket(socket.id);

    if (!user || !user.roomId) {
      return;
    }

    const roomId = user.roomId;
    const room = getRoom(roomId);

    const name = user.name;

    socket.leave(
      `room:${roomId}`
    );

    user.roomId = null;

    if (room) {
      roomNotification(
        room.id,
        `👋 ${name} غادر الغرفة`
      );
    }

    broadcastRoomUsers(roomId);
    broadcastRooms();
  });

  /* =======================================================
     ROOM HISTORY
  ======================================================= */

  socket.on("get room messages", data => {

    const roomId =
      typeof data === "string"
        ? data
        : data?.roomId;

    const room = getRoom(roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    socket.emit(
      "room messages",
      {
        roomId: room.id,
        messages: getRoomMessages(room.id)
      }
    );
  });

  /* =======================================================
     ROOM USERS
  ======================================================= */

  socket.on("get room users", data => {

    const roomId =
      typeof data === "string"
        ? data
        : data?.roomId;

    const room = getRoom(roomId);

    if (!room) {
      return;
    }

    socket.emit(
      "room users",
      getRoomUsers(room.id)
    );
  });

  /* =======================================================
     ROOM CHAT MESSAGE
  ======================================================= */

  socket.on("chat message", data => {

    const user =
      getUserBySocket(socket.id);

    if (
      !user ||
      !user.loggedIn
    ) {
      return;
    }

    const message =
      String(
        data?.message ||
        data?.text ||
        ""
      ).trim();

    if (!message) {
      return;
    }

    const requestedRoomId =
      data?.roomId ||
      user.roomId;

    const room =
      getRoom(requestedRoomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ اختر غرفة أولًا"
      );

      return;
    }

    /*
      التأكد أن المستخدم داخل نفس الغرفة.
    */

    if (
      String(user.roomId || "") !==
      String(room.id)
    ) {

      socket.emit(
        "room error",
        "❌ يجب دخول الغرفة أولًا"
      );

      return;
    }

    /*
      قفل المحادثة.
    */

    if (
      room.settings?.chatLock === true &&
      !isAdmin(user.name)
    ) {

      socket.emit(
        "chat error",
        "🔒 الدردشة مقفلة حاليًا"
      );

      return;
    }

    /*
      الصيانة الخاصة بالغرفة.
    */

    if (
      room.settings?.maintenance === true &&
      !isAdmin(user.name)
    ) {

      socket.emit(
        "chat error",
        "🛠️ الغرفة في وضع الصيانة"
      );

      return;
    }

    /*
      الكتم.
    */

    if (
      isMutedFromRoom(
        user.name,
        room.id
      ) ||
      isUserMuted(
        user.name,
        room.id
      )
    ) {

      socket.emit(
        "chat error",
        "🔇 أنت مكتوم في هذه الغرفة"
      );

      return;
    }

    const messageObject = {
      id: createId("msg"),
      roomId: room.id,
      name: user.name,
      username: user.name,
      role: getUserRole(user.name),
      message,
      text: message,
      reply: data?.reply || null,
      time: new Date().toISOString()
    };

    addRoomMessage(
      room.id,
      messageObject
    );

    /*
      نرسل الرسالة إلى جميع الموجودين
      داخل نفس الغرفة فقط.
    */

    io.to(
      `room:${room.id}`
    ).emit(
      "chat message",
      messageObject
    );

    addLog(
      "chat_message",
      {
        name: user.name,
        roomId: room.id,
        messageId: messageObject.id
      }
    );
  });

  /* =======================================================
     CLEAR ROOM CHAT
  ======================================================= */

  socket.on("clear room chat", data => {

    const user =
      getUserBySocket(socket.id);

    if (!user || !user.loggedIn) {
      return;
    }

    const roomId =
      typeof data === "string"
        ? data
        : data?.roomId || user.roomId;

    const room =
      getRoom(roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    if (
      !hasRoomPermission(
        user.name,
        room.id,
        "clear"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية مسح رسائل هذه الغرفة"
      );

      return;
    }

    room.messages = [];

    saveRooms();

    io.to(
      `room:${room.id}`
    ).emit(
      "room chat cleared",
      {
        roomId: room.id
      }
    );

    addLog(
      "clear_room_chat",
      {
        admin: user.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     DELETE ROOM MESSAGE
  ======================================================= */

  socket.on("delete room message", data => {

    const user =
      getUserBySocket(socket.id);

    if (!user || !user.loggedIn) {
      return;
    }

    const roomId =
      data?.roomId ||
      user.roomId;

    const messageId =
      data?.messageId;

    if (!messageId) {
      return;
    }

    const room =
      getRoom(roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        user.name,
        room.id,
        "deleteMessage"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية حذف الرسائل"
      );

      return;
    }

    const oldLength =
      room.messages.length;

    room.messages =
      room.messages.filter(
        message =>
          String(message.id) !==
          String(messageId)
      );

    if (
      room.messages.length !==
      oldLength
    ) {

      saveRooms();

      io.to(
        `room:${room.id}`
      ).emit(
        "room message deleted",
        {
          roomId: room.id,
          messageId
        }
      );

      addLog(
        "delete_room_message",
        {
          admin: user.name,
          roomId: room.id,
          messageId
        }
      );
    }
  });
      /* =======================================================
     PRIVATE MESSAGE
  ======================================================= */

  socket.on("private message", data => {

    const sender =
      getUserBySocket(socket.id);

    if (!sender || !sender.loggedIn) {
      return;
    }

    if (privateLocked && !isAdmin(sender.name)) {

      socket.emit(
        "private error",
        "🔒 المحادثات الخاصة مقفلة حاليًا"
      );

      return;
    }

    const targetName =
      String(
        data?.to ||
        data?.name ||
        data?.target ||
        ""
      ).trim();

    const message =
      String(
        data?.message ||
        data?.text ||
        ""
      ).trim();

    if (!targetName || !message) {
      return;
    }

    const target =
      getUserByName(targetName);

    if (!target || !target.loggedIn) {

      socket.emit(
        "private error",
        "❌ المستخدم غير متصل"
      );

      return;
    }

    const privateMessage = {
      id: createId("pm"),
      from: sender.name,
      sender: sender.name,
      to: target.name,
      receiver: target.name,
      message,
      text: message,
      time: new Date().toISOString()
    };

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "private message",
        privateMessage
      );
    }

    /*
      نرسل الرسالة أيضًا للمرسل حتى تظهر عنده.
    */

    socket.emit(
      "private message",
      privateMessage
    );

    addLog(
      "private_message",
      {
        from: sender.name,
        to: target.name
      }
    );
  });

  /* =======================================================
     GET ONLINE USERS
  ======================================================= */

  socket.on("get online users", () => {

    socket.emit(
      "online users",
      users
        .filter(user => user.loggedIn)
        .map(publicUser)
    );
  });

  /* =======================================================
     ADMIN PANEL LOGIN
  ======================================================= */

  socket.on("admin panel login", data => {

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

    const admin =
      findAdmin(name);

    if (
      !admin ||
      String(admin.password) !== password
    ) {

      socket.emit(
        "admin login failed"
      );

      return;
    }

    const loginData =
      getAdminLoginData(
        admin.name
      );

    socket.emit(
      "admin login success",
      loginData
    );

    socket.emit(
      "admin online users",
      users
        .filter(user => user.loggedIn)
        .map(adminUser)
    );

    socket.emit(
      "admin rooms",
      rooms.map(publicRoom)
    );

    socket.emit(
      "server stats",
      {
        onlineUsers:
          users.filter(
            user => user.loggedIn
          ).length,

        bannedUsers:
          bannedUsers.length,

        admins:
          admins.length,

        rooms:
          rooms.length
      }
    );

    socket.emit(
      "logs",
      logs
    );
  });

  /* =======================================================
     GET ADMIN USERS
  ======================================================= */

  socket.on("get admin users", () => {

    socket.emit(
      "admin online users",
      users
        .filter(user => user.loggedIn)
        .map(adminUser)
    );

    socket.emit(
      "server stats",
      {
        onlineUsers:
          users.filter(
            user => user.loggedIn
          ).length,

        bannedUsers:
          bannedUsers.length,

        admins:
          admins.length,

        rooms:
          rooms.length
      }
    );
  });

  /* =======================================================
     GET ADMINS
  ======================================================= */

  socket.on("get admins", () => {

    const list =
      admins.map(admin => ({
        name: admin.name,
        role: isMasterAdmin(admin.name)
          ? "master"
          : "admin",
        permissions:
          admin.permissions || {}
      }));

    socket.emit(
      "admins list",
      list
    );
  });

  /* =======================================================
     GET LOGS
  ======================================================= */

  socket.on("get logs", () => {

    socket.emit(
      "logs",
      logs
    );
  });

  /* =======================================================
     VIEW USER
  ======================================================= */

  socket.on("view user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !isAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ هذا الأمر للأدمن فقط"
      );

      return;
    }

    if (
      !hasPermission(
        requester.name,
        "viewUserInfo"
      ) &&
      !hasPermission(
        requester.name,
        "viewIP"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية عرض معلومات المستخدم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    socket.emit(
      "user info",
      {
        name: target.name,

        ip:
          hasPermission(
            requester.name,
            "viewIP"
          ) ||
          isMasterAdmin(requester.name)
            ? target.ip
            : "مخفي",

        device:
          target.device || "",

        userAgent:
          target.userAgent || "",

        roomId:
          target.roomId || null,

        role:
          getUserRole(target.name)
      }
    );
  });

  /* =======================================================
     CREATE ROOM
  ======================================================= */

  socket.on("create room", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !isAdmin(requester.name)
    ) {

      socket.emit(
        "room error",
        "❌ الأدمن فقط يستطيع إنشاء الغرف"
      );

      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(
        requester.name,
        "rooms"
      ) &&
      !hasPermission(
        requester.name,
        "addAdmin"
      )
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية إنشاء الغرف"
      );

      return;
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

      socket.emit(
        "room error",
        "❌ اكتب اسم الغرفة"
      );

      return;
    }

    if (name.length > 50) {

      socket.emit(
        "room error",
        "❌ اسم الغرفة طويل جدًا"
      );

      return;
    }

    if (getRoomByName(name)) {

      socket.emit(
        "room error",
        "❌ هذه الغرفة موجودة مسبقًا"
      );

      return;
    }

    const room = {
      id: createId("room"),

      name,

      description,

      enabled: true,

      messages: [],

      bannedUsers: [],

      mutedUsers: [],

      admins: {},

      permissions: {},

      settings: {
        chatLock: false,
        maintenance: false,
        stars: false,
        protection: false
      },

      createdBy:
        requester.name,

      createdAt:
        new Date().toISOString()
    };

    rooms.push(room);

    saveRooms();

    socket.emit(
      "room created",
      publicRoom(room)
    );

    broadcastRooms();

    addLog(
      "create_room",
      {
        admin: requester.name,
        roomId: room.id,
        roomName: room.name
      }
    );
  });

  /* =======================================================
     DELETE ROOM
  ======================================================= */

  socket.on("delete room", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const roomId =
      data?.roomId;

    const room =
      getRoom(roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "rooms"
      ) &&
      !hasPermission(
        requester.name,
        "rooms"
      )
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية حذف هذه الغرفة"
      );

      return;
    }

    /*
      إخراج جميع المستخدمين من الغرفة.
    */

    users.forEach(user => {

      if (
        String(user.roomId || "") ===
        String(room.id)
      ) {

        const targetSocket =
          io.sockets.sockets.get(
            user.socketId
          );

        if (targetSocket) {

          targetSocket.leave(
            `room:${room.id}`
          );

          targetSocket.emit(
            "room deleted",
            {
              roomId: room.id,
              message:
                "🗑️ تم حذف هذه الغرفة"
            }
          );
        }

        user.roomId = null;
      }
    });

    rooms =
      rooms.filter(
        item =>
          String(item.id) !==
          String(room.id)
      );

    saveRooms();

    socket.emit(
      "room deleted",
      {
        roomId: room.id
      }
    );

    broadcastRooms();
    broadcastOnlineUsers();

    addLog(
      "delete_room",
      {
        admin: requester.name,
        roomId: room.id,
        roomName: room.name
      }
    );
  });

  /* =======================================================
     EDIT ROOM
  ======================================================= */

  socket.on("edit room", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(
        requester.name,
        "rooms"
      ) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "rooms"
      )
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية تعديل هذه الغرفة"
      );

      return;
    }

    const newName =
      String(
        data?.name ??
        room.name
      ).trim();

    const newDescription =
      String(
        data?.description ??
        room.description ??
        ""
      ).trim();

    if (!newName) {

      socket.emit(
        "room error",
        "❌ اسم الغرفة لا يمكن أن يكون فارغًا"
      );

      return;
    }

    const duplicate =
      rooms.find(item => {

        return (
          String(item.id) !==
          String(room.id) &&
          String(item.name)
            .trim()
            .toLowerCase() ===
          newName.toLowerCase()
        );
      });

    if (duplicate) {

      socket.emit(
        "room error",
        "❌ اسم الغرفة مستخدم مسبقًا"
      );

      return;
    }

    room.name =
      newName;

    room.description =
      newDescription;

    saveRooms();

    socket.emit(
      "room updated",
      publicRoom(room)
    );

    broadcastRooms();

    addLog(
      "edit_room",
      {
        admin: requester.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     UPDATE ROOM
     Alias للتوافق
  ======================================================= */

  socket.on("update room", data => {

    socket.emit(
      "admin error",
      "⚠️ استخدم تعديل الغرفة من لوحة الإدارة"
    );
  });
      /* =======================================================
     ENABLE / DISABLE ROOM
  ======================================================= */

  socket.on("toggle room", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(requester.name, "rooms")
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية تشغيل أو إيقاف الغرفة"
      );

      return;
    }

    room.enabled =
      typeof data?.enabled === "boolean"
        ? data.enabled
        : !room.enabled;

    saveRooms();

    io.emit(
      "room status changed",
      {
        roomId: room.id,
        enabled: room.enabled
      }
    );

    broadcastRooms();

    addLog(
      "toggle_room",
      {
        admin: requester.name,
        roomId: room.id,
        enabled: room.enabled
      }
    );
  });

  /* =======================================================
     ASSIGN ADMIN TO ROOM
  ======================================================= */

  socket.on("assign room admin", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(requester.name, "addAdmin")
    ) {

      socket.emit(
        "room error",
        "❌ فقط الأدمن الرئيسي يستطيع تعيين أدمن للغرفة"
      );

      return;
    }

    const adminName =
      String(
        data?.adminName ||
        data?.name ||
        ""
      ).trim();

    const admin =
      findAdmin(adminName);

    if (!admin) {

      socket.emit(
        "room error",
        "❌ الأدمن غير موجود"
      );

      return;
    }

    if (!room.admins) {
      room.admins = {};
    }

    room.admins[admin.name] = true;

    saveRooms();

    socket.emit(
      "room admin assigned",
      {
        roomId: room.id,
        adminName: admin.name
      }
    );

    broadcastRooms();

    addLog(
      "assign_room_admin",
      {
        master: requester.name,
        admin: admin.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     REMOVE ADMIN FROM ROOM
  ======================================================= */

  socket.on("remove room admin", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(requester.name, "removeAdmin")
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية إزالة أدمن من الغرفة"
      );

      return;
    }

    const adminName =
      String(
        data?.adminName ||
        data?.name ||
        ""
      ).trim();

    if (room.admins) {
      delete room.admins[adminName];
    }

    if (room.permissions) {
      delete room.permissions[adminName];
    }

    saveRooms();

    socket.emit(
      "room admin removed",
      {
        roomId: room.id,
        adminName
      }
    );

    broadcastRooms();

    addLog(
      "remove_room_admin",
      {
        master: requester.name,
        admin: adminName,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     ROOM SETTING
  ======================================================= */

  socket.on("room setting", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }

    const setting =
      String(
        data?.setting ||
        data?.type ||
        ""
      ).trim();

    const allowedSettings = [
      "chatLock",
      "maintenance",
      "stars",
      "protection"
    ];

    if (
      !allowedSettings.includes(setting)
    ) {

      socket.emit(
        "room error",
        "❌ إعداد الغرفة غير معروف"
      );

      return;
    }

    /*
      Master يستطيع تعديل كل شيء.
      الأدمن العادي يحتاج صلاحية إعداد الغرفة.
    */

    if (
      !isMasterAdmin(requester.name) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "roomSettings"
      )
    ) {

      socket.emit(
        "room error",
        "❌ لا تملك صلاحية تعديل إعدادات هذه الغرفة"
      );

      return;
    }

    const value =
      typeof data?.value === "boolean"
        ? data.value
        : !Boolean(room.settings?.[setting]);

    if (!room.settings) {
      room.settings = {};
    }

    room.settings[setting] = value;

    saveRooms();

    io.to(
      `room:${room.id}`
    ).emit(
      "room setting changed",
      {
        roomId: room.id,
        setting,
        value
      }
    );

    broadcastRooms();

    addLog(
      "room_setting",
      {
        admin: requester.name,
        roomId: room.id,
        setting,
        value
      }
    );
  });

  /* =======================================================
     TOGGLE CHAT LOCK
  ======================================================= */

  socket.on("toggle room chat lock", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "chatLock"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية قفل الدردشة"
      );

      return;
    }

    if (!room.settings) {
      room.settings = {};
    }

    room.settings.chatLock =
      !Boolean(room.settings.chatLock);

    saveRooms();

    io.to(
      `room:${room.id}`
    ).emit(
      "room setting changed",
      {
        roomId: room.id,
        setting: "chatLock",
        value: room.settings.chatLock
      }
    );

    broadcastRooms();
  });

  /* =======================================================
     TOGGLE ROOM MAINTENANCE
  ======================================================= */

  socket.on("toggle room maintenance", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "maintenance"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية وضع الغرفة في الصيانة"
      );

      return;
    }

    if (!room.settings) {
      room.settings = {};
    }

    room.settings.maintenance =
      !Boolean(room.settings.maintenance);

    saveRooms();

    io.to(
      `room:${room.id}`
    ).emit(
      "room setting changed",
      {
        roomId: room.id,
        setting: "maintenance",
        value: room.settings.maintenance
      }
    );

    broadcastRooms();
  });

  /* =======================================================
     ROOM STARS
  ======================================================= */

  socket.on("toggle room stars", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const roomId =
      typeof data === "string"
        ? data
        : data?.roomId;

    const room =
      getRoom(
        roomId ||
        requester.roomId
      );

    if (!room) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "stars"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية النجوم لهذه الغرفة"
      );

      return;
    }

    if (!room.settings) {
      room.settings = {};
    }

    room.settings.stars =
      !Boolean(room.settings.stars);

    saveRooms();

    io.to(
      `room:${room.id}`
    ).emit(
      "room setting changed",
      {
        roomId: room.id,
        setting: "stars",
        value: room.settings.stars
      }
    );

    broadcastRooms();

    addLog(
      "toggle_room_stars",
      {
        admin: requester.name,
        roomId: room.id,
        enabled: room.settings.stars
      }
    );
  });

  /* =======================================================
     GIVE STAR
  ======================================================= */

  socket.on("give room star", data => {

    const giver =
      getUserBySocket(socket.id);

    if (!giver || !giver.loggedIn) {
      return;
    }

    const roomId =
      data?.roomId ||
      giver.roomId;

    const targetName =
      String(
        data?.name ||
        data?.target ||
        data?.username ||
        ""
      ).trim();

    const room =
      getRoom(roomId);

    if (!room) {
      return;
    }

    if (
      room.settings?.stars !== true
    ) {

      socket.emit(
        "star error",
        "⭐ النجوم غير مفعلة في هذه الغرفة"
      );

      return;
    }

    const target =
      getUserInRoom(
        targetName,
        room.id
      );

    if (!target) {

      socket.emit(
        "star error",
        "❌ المستخدم غير موجود في الغرفة"
      );

      return;
    }

    if (
      !hasRoomPermission(
        giver.name,
        room.id,
        "stars"
      ) &&
      !isAdmin(giver.name)
    ) {

      /*
        المستخدم العادي يستطيع إعطاء نجمة.
        لا نرفضه هنا.
      */
    }

    const starObject = {
      id: createId("star"),
      roomId: room.id,
      from: giver.name,
      to: target.name,
      time: new Date().toISOString()
    };

    stars.push(starObject);

    if (stars.length > 5000) {
      stars = stars.slice(-5000);
    }

    saveJSON(FILES.stars, stars);

    io.to(
      `room:${room.id}`
    ).emit(
      "star given",
      starObject
    );
  });

  /* =======================================================
     REMOVE STAR
  ======================================================= */

  socket.on("remove room star", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const roomId =
      data?.roomId ||
      requester.roomId;

    const room =
      getRoom(roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "stars"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية حذف النجوم"
      );

      return;
    }

    const starId =
      data?.starId;

    const targetName =
      String(
        data?.name ||
        data?.target ||
        ""
      ).trim();

    const oldLength =
      stars.length;

    stars =
      stars.filter(star => {

        if (
          String(star.roomId) !==
          String(room.id)
        ) {
          return true;
        }

        if (
          starId &&
          String(star.id) ===
          String(starId)
        ) {
          return false;
        }

        if (
          targetName &&
          String(star.to || "")
            .toLowerCase() ===
          targetName.toLowerCase()
        ) {
          return false;
        }

        return true;
      });

    if (stars.length !== oldLength) {
      saveJSON(
        FILES.stars,
        stars
      );
    }

    io.to(
      `room:${room.id}`
    ).emit(
      "stars updated",
      {
        roomId: room.id,
        stars: stars.filter(
          star =>
            String(star.roomId) ===
            String(room.id)
        )
      }
    );
  });

  /* =======================================================
     BAN USER FROM ROOM
  ======================================================= */

  socket.on("ban room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "ban"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الحظر في هذه الغرفة"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserInRoom(
        targetName,
        room.id
      );

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في الغرفة"
      );

      return;
    }

    if (!Array.isArray(room.bannedUsers)) {
      room.bannedUsers = [];
    }

    const alreadyBanned =
      isBannedFromRoom(
        target.name,
        room.id,
        target.ip
      );

    if (!alreadyBanned) {

      room.bannedUsers.push({
        name: target.name,
        ip: target.ip,
        time: new Date().toISOString(),
        by: requester.name
      });
    }

    saveRooms();

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.leave(
        `room:${room.id}`
      );

      targetSocket.emit(
        "room banned",
        {
          roomId: room.id,
          message:
            "🚫 تم حظرك من هذه الغرفة"
        }
      );
    }

    target.roomId = null;

    roomNotification(
      room.id,
      `🚫 تم حظر ${target.name} من الغرفة`
    );

    broadcastRoomUsers(room.id);
    broadcastRooms();

    addLog(
      "room_ban",
      {
        admin: requester.name,
        target: target.name,
        roomId: room.id
      }
    );
  });
      /* =======================================================
     UNBAN USER FROM ROOM
  ======================================================= */

  socket.on("unban room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "unban"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية فك الحظر في هذه الغرفة"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    if (!Array.isArray(room.bannedUsers)) {
      room.bannedUsers = [];
    }

    const oldLength =
      room.bannedUsers.length;

    room.bannedUsers =
      room.bannedUsers.filter(item => {

        const itemName =
          typeof item === "string"
            ? item
            : (
                item?.name ||
                item?.username ||
                ""
              );

        return (
          String(itemName)
            .trim()
            .toLowerCase() !==
          targetName.toLowerCase()
        );
      });

    if (
      room.bannedUsers.length ===
      oldLength
    ) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في قائمة الحظر"
      );

      return;
    }

    saveRooms();

    roomNotification(
      room.id,
      `🔓 تم فك حظر ${targetName}`
    );

    socket.emit(
      "room unbanned",
      {
        roomId: room.id,
        name: targetName
      }
    );

    addLog(
      "room_unban",
      {
        admin: requester.name,
        target: targetName,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     MUTE USER FROM ROOM
  ======================================================= */

  socket.on("mute room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "mute"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الكتم في هذه الغرفة"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserInRoom(
        targetName,
        room.id
      );

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في الغرفة"
      );

      return;
    }

    if (!Array.isArray(room.mutedUsers)) {
      room.mutedUsers = [];
    }

    const alreadyMuted =
      isMutedFromRoom(
        target.name,
        room.id
      );

    if (!alreadyMuted) {

      room.mutedUsers.push({
        name: target.name,
        time: new Date().toISOString(),
        by: requester.name
      });
    }

    saveRooms();

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "room muted",
        {
          roomId: room.id,
          message:
            "🔇 تم كتمك في هذه الغرفة"
        }
      );
    }

    roomNotification(
      room.id,
      `🔇 تم كتم ${target.name}`
    );

    broadcastRoomUsers(room.id);

    addLog(
      "room_mute",
      {
        admin: requester.name,
        target: target.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     UNMUTE USER FROM ROOM
  ======================================================= */

  socket.on("unmute room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "unmute"
      ) &&
      !hasRoomPermission(
        requester.name,
        room.id,
        "mute"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية فك الكتم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    if (!Array.isArray(room.mutedUsers)) {
      room.mutedUsers = [];
    }

    const oldLength =
      room.mutedUsers.length;

    room.mutedUsers =
      room.mutedUsers.filter(item => {

        const itemName =
          typeof item === "string"
            ? item
            : (
                item?.name ||
                item?.username ||
                ""
              );

        return (
          String(itemName)
            .trim()
            .toLowerCase() !==
          targetName.toLowerCase()
        );
      });

    if (
      room.mutedUsers.length !==
      oldLength
    ) {

      saveRooms();

      roomNotification(
        room.id,
        `🔊 تم فك كتم ${targetName}`
      );

      addLog(
        "room_unmute",
        {
          admin: requester.name,
          target: targetName,
          roomId: room.id
        }
      );
    }

    socket.emit(
      "room unmuted",
      {
        roomId: room.id,
        name: targetName
      }
    );
  });

  /* =======================================================
     KICK USER FROM ROOM
  ======================================================= */

  socket.on("kick room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "kick"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية طرد المستخدم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserInRoom(
        targetName,
        room.id
      );

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في الغرفة"
      );

      return;
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.leave(
        `room:${room.id}`
      );

      targetSocket.emit(
        "room kicked",
        {
          roomId: room.id,
          message:
            "👢 تم طردك من الغرفة"
        }
      );
    }

    target.roomId = null;

    roomNotification(
      room.id,
      `👢 تم طرد ${target.name} من الغرفة`
    );

    broadcastRoomUsers(room.id);
    broadcastRooms();

    addLog(
      "room_kick",
      {
        admin: requester.name,
        target: target.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     DISCONNECT USER FROM ROOM
  ======================================================= */

  socket.on("disconnect room user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !hasRoomPermission(
        requester.name,
        room.id,
        "disconnect"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية فصل المستخدم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserInRoom(
        targetName,
        room.id
      );

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في الغرفة"
      );

      return;
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.leave(
        `room:${room.id}`
      );

      targetSocket.emit(
        "room disconnected",
        {
          roomId: room.id,
          message:
            "⛔ تم فصلك من الغرفة"
        }
      );
    }

    target.roomId = null;

    roomNotification(
      room.id,
      `⛔ تم فصل ${target.name} من الغرفة`
    );

    broadcastRoomUsers(room.id);
    broadcastRooms();

    addLog(
      "room_disconnect",
      {
        admin: requester.name,
        target: target.name,
        roomId: room.id
      }
    );
  });

  /* =======================================================
     GET ROOM MODERATION LISTS
  ======================================================= */

  socket.on("get room moderation", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const room =
      getRoom(data?.roomId);

    if (!room) {
      return;
    }

    if (
      !isRoomAdmin(
        requester.name,
        room.id
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية إدارة هذه الغرفة"
      );

      return;
    }

    socket.emit(
      "room moderation",
      {
        roomId: room.id,

        bannedUsers:
          Array.isArray(room.bannedUsers)
            ? room.bannedUsers
            : [],

        mutedUsers:
          Array.isArray(room.mutedUsers)
            ? room.mutedUsers
            : [],

        admins:
          room.admins || {},

        permissions:
          room.permissions || {}
      }
    );
  });

  /* =======================================================
     ADD ADMIN
  ======================================================= */

  socket.on("add admin", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(
        requester.name,
        "addAdmin"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية إضافة أدمن"
      );

      return;
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

    if (!name || !password) {

      socket.emit(
        "admin error",
        "❌ اكتب اسم الأدمن وكلمة المرور"
      );

      return;
    }

    if (findAdmin(name)) {

      socket.emit(
        "admin error",
        "❌ هذا الأدمن موجود مسبقًا"
      );

      return;
    }

    if (!isValidUsername(name)) {

      socket.emit(
        "admin error",
        "❌ اسم الأدمن غير صالح"
      );

      return;
    }

    const permissions =
      data?.permissions &&
      typeof data.permissions === "object"
        ? data.permissions
        : {};

    const newAdmin = {
      name,
      password,
      role: "admin",
      permissions
    };

    admins.push(newAdmin);

    saveJSON(
      FILES.admins,
      admins
    );

    socket.emit(
      "admin added",
      {
        name,
        permissions
      }
    );

    addLog(
      "add_admin",
      {
        admin: requester.name,
        newAdmin: name
      }
    );

    broadcastServerStats();
  });

  /* =======================================================
     REMOVE ADMIN
  ======================================================= */

  socket.on("remove admin", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(
        requester.name,
        "removeAdmin"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية حذف أدمن"
      );

      return;
    }

    const name =
      String(
        data?.name ||
        ""
      ).trim();

    const admin =
      findAdmin(name);

    if (!admin) {

      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );

      return;
    }

    if (
      isMasterAdmin(name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا يمكن حذف الأدمن الرئيسي"
      );

      return;
    }

    admins =
      admins.filter(
        item =>
          String(item.name)
            .toLowerCase() !==
          name.toLowerCase()
      );

    /*
      إزالة صلاحياته من جميع الغرف.
    */

    rooms.forEach(room => {

      if (room.admins) {
        delete room.admins[name];
      }

      if (room.permissions) {
        delete room.permissions[name];
      }
    });

    saveJSON(
      FILES.admins,
      admins
    );

    saveRooms();

    socket.emit(
      "admin removed",
      {
        name
      }
    );

    broadcastRooms();
    broadcastServerStats();

    addLog(
      "remove_admin",
      {
        admin: requester.name,
        removedAdmin: name
      }
    );
  });
      /* =======================================================
     GLOBAL BAN USER
  ======================================================= */

  socket.on("ban user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "ban"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الحظر"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    const alreadyBanned =
      isUserBanned(
        target.name,
        target.ip
      );

    if (!alreadyBanned) {

      bannedUsers.push({
        name: target.name,
        ip: target.ip,
        time: new Date().toISOString(),
        by: requester.name
      });

      saveJSON(
        FILES.banned,
        bannedUsers
      );
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "banned",
        {
          message:
            "🚫 تم حظرك من الشات"
        }
      );

      targetSocket.disconnect(true);
    }

    users =
      users.filter(
        user =>
          user.socketId !==
          target.socketId
      );

    io.emit(
      "user banned",
      {
        name: target.name
      }
    );

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();

    addLog(
      "ban_user",
      {
        admin: requester.name,
        target: target.name,
        ip: target.ip
      }
    );
  });

  /* =======================================================
     GLOBAL UNBAN USER
  ======================================================= */

  socket.on("unban user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "unban"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية فك الحظر"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const targetIP =
      String(
        data?.ip ||
        ""
      ).trim();

    const oldLength =
      bannedUsers.length;

    bannedUsers =
      bannedUsers.filter(item => {

        if (typeof item === "string") {

          return (
            item.trim().toLowerCase() !==
            targetName.toLowerCase() &&
            item.trim() !== targetIP
          );
        }

        const itemName =
          String(
            item?.name ||
            item?.username ||
            ""
          )
            .trim()
            .toLowerCase();

        const itemIP =
          String(
            item?.ip ||
            ""
          ).trim();

        if (
          targetName &&
          itemName ===
          targetName.toLowerCase()
        ) {
          return false;
        }

        if (
          targetIP &&
          itemIP === targetIP
        ) {
          return false;
        }

        return true;
      });

    if (
      bannedUsers.length ===
      oldLength
    ) {

      socket.emit(
        "admin error",
        "❌ لم يتم العثور على الحظر"
      );

      return;
    }

    saveJSON(
      FILES.banned,
      bannedUsers
    );

    socket.emit(
      "user unbanned",
      {
        name: targetName
      }
    );

    io.emit(
      "user unbanned",
      {
        name: targetName
      }
    );

    broadcastServerStats();

    addLog(
      "unban_user",
      {
        admin: requester.name,
        target: targetName
      }
    );
  });

  /* =======================================================
     GLOBAL MUTE USER
  ======================================================= */

  socket.on("mute user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "mute"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الكتم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    if (
      !isUserMuted(
        target.name,
        target.roomId
      )
    ) {

      mutedUsers.push({
        name: target.name,
        roomId: target.roomId || null,
        time: new Date().toISOString(),
        by: requester.name
      });

      saveJSON(
        FILES.muted,
        mutedUsers
      );
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "muted",
        {
          message:
            "🔇 تم كتمك"
        }
      );
    }

    io.emit(
      "user muted",
      {
        name: target.name,
        roomId: target.roomId || null
      }
    );

    addLog(
      "mute_user",
      {
        admin: requester.name,
        target: target.name
      }
    );
  });

  /* =======================================================
     GLOBAL UNMUTE USER
  ======================================================= */

  socket.on("unmute user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "unmute"
      ) &&
      !hasPermission(
        requester.name,
        "mute"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية فك الكتم"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const oldLength =
      mutedUsers.length;

    mutedUsers =
      mutedUsers.filter(item => {

        const itemName =
          typeof item === "string"
            ? item
            : (
                item?.name ||
                item?.username ||
                ""
              );

        return (
          String(itemName)
            .trim()
            .toLowerCase() !==
          targetName.toLowerCase()
        );
      });

    if (
      mutedUsers.length ===
      oldLength
    ) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في قائمة الكتم"
      );

      return;
    }

    saveJSON(
      FILES.muted,
      mutedUsers
    );

    socket.emit(
      "user unmuted",
      {
        name: targetName
      }
    );

    io.emit(
      "user unmuted",
      {
        name: targetName
      }
    );

    addLog(
      "unmute_user",
      {
        admin: requester.name,
        target: targetName
      }
    );
  });

  /* =======================================================
     GLOBAL KICK USER
  ======================================================= */

  socket.on("kick user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "kick"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الطرد"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "kicked",
        {
          message:
            "👢 تم طردك من الشات"
        }
      );

      targetSocket.disconnect(true);
    }

    users =
      users.filter(
        user =>
          user.socketId !==
          target.socketId
      );

    io.emit(
      "user kicked",
      {
        name: target.name
      }
    );

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();

    addLog(
      "kick_user",
      {
        admin: requester.name,
        target: target.name
      }
    );
  });

  /* =======================================================
     GLOBAL DISCONNECT USER
  ======================================================= */

  socket.on("disconnect user", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "disconnect"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الفصل"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "disconnected by admin",
        {
          message:
            "⛔ تم فصلك من الشات"
        }
      );

      targetSocket.disconnect(true);
    }

    users =
      users.filter(
        user =>
          user.socketId !==
          target.socketId
      );

    io.emit(
      "user disconnected by admin",
      {
        name: target.name
      }
    );

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();

    addLog(
      "disconnect_user",
      {
        admin: requester.name,
        target: target.name
      }
    );
  });

  /* =======================================================
     ADD GLOBAL DEVICE BAN
  ======================================================= */

  socket.on("ban device", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !isMasterAdmin(requester.name) &&
      !hasPermission(
        requester.name,
        "ban"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية حظر الجهاز"
      );

      return;
    }

    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();

    const target =
      getUserByName(targetName);

    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }

    const exists =
      deviceBannedUsers.some(item => {

        if (typeof item === "string") {
          return item === target.device;
        }

        return (
          String(item?.device || "") ===
          String(target.device || "")
        );
      });

    if (!exists) {

      deviceBannedUsers.push({
        device: target.device,
        userAgent: target.userAgent,
        time: new Date().toISOString(),
        by: requester.name
      });

      saveJSON(
        FILES.deviceBanned,
        deviceBannedUsers
      );
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {
      targetSocket.disconnect(true);
    }

    users =
      users.filter(
        user =>
          user.socketId !==
          target.socketId
      );

    broadcastOnlineUsers();
    broadcastAdminOnlineUsers();
    broadcastServerStats();

    addLog(
      "ban_device",
      {
        admin: requester.name,
        target: target.name,
        device: target.device
      }
    );
  });

  /* =======================================================
     CLEAR GLOBAL CHAT
  ======================================================= */

  socket.on("clear chat", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    const roomId =
      data?.roomId ||
      requester.roomId;

    if (roomId) {

      const room =
        getRoom(roomId);

      if (!room) {
        return;
      }

      if (
        !hasRoomPermission(
          requester.name,
          room.id,
          "clear"
        )
      ) {

        socket.emit(
          "admin error",
          "❌ لا تملك صلاحية مسح هذه الغرفة"
        );

        return;
      }

      room.messages = [];

      saveRooms();

      io.to(
        `room:${room.id}`
      ).emit(
        "room chat cleared",
        {
          roomId: room.id
        }
      );

      return;
    }

    if (
      !hasPermission(
        requester.name,
        "clear"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية مسح الدردشة"
      );

      return;
    }

    io.emit(
      "chat cleared"
    );

    addLog(
      "clear_chat",
      {
        admin: requester.name
      }
    );
  });

  /* =======================================================
     GLOBAL MAINTENANCE
  ======================================================= */

  socket.on("toggle maintenance", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "maintenance"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية الصيانة"
      );

      return;
    }

    maintenanceMode =
      typeof data?.enabled === "boolean"
        ? data.enabled
        : !maintenanceMode;

    io.emit(
      "maintenance changed",
      {
        enabled:
          maintenanceMode
      }
    );

    addLog(
      "maintenance",
      {
        admin: requester.name,
        enabled:
          maintenanceMode
      }
    );
  });

  /* =======================================================
     GLOBAL CHAT LOCK
  ======================================================= */

  socket.on("toggle chat lock", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "chatLock"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية قفل الدردشة"
      );

      return;
    }

    chatLocked =
      typeof data?.enabled === "boolean"
        ? data.enabled
        : !chatLocked;

    io.emit(
      "chat lock changed",
      {
        enabled:
          chatLocked
      }
    );
  });

  /* =======================================================
     GLOBAL PRIVATE LOCK
  ======================================================= */

  socket.on("toggle private lock", data => {

    const requester =
      getUserBySocket(socket.id);

    if (!requester) {
      return;
    }

    if (
      !hasPermission(
        requester.name,
        "privateLock"
      ) &&
      !isMasterAdmin(requester.name)
    ) {

      socket.emit(
        "admin error",
        "❌ لا تملك صلاحية قفل الخاص"
      );

      return;
    }

    privateLocked =
      typeof data?.enabled === "boolean"
        ? data.enabled
        : !privateLocked;

    io.emit(
      "private lock changed",
      {
        enabled:
          privateLocked
      }
    );
  });
    /* =======================================================
     USER DISCONNECT
  ======================================================= */

  socket.on("disconnect", reason => {

    const user =
      getUserBySocket(socket.id);

    if (!user) {
      return;
    }

    const username =
      user.name ||
      user.username ||
      "";

    const roomId =
      user.roomId ||
      null;

    /*
       إذا كان داخل غرفة
       نرسل إشعار مغادرته
    */

    if (roomId) {

      const room =
        getRoom(roomId);

      if (room) {

        io.to(
          `room:${room.id}`
        ).emit(
          "room notification",
          {
            roomId: room.id,
            message:
              `👋 غادر ${username} الغرفة`
          }
        );

        broadcastRoomUsers(
          room.id
        );
      }
    }

    /*
       حذف المستخدم من القائمة
    */

    users =
      users.filter(
        item =>
          item.socketId !== socket.id &&
          item.id !== socket.id
      );

    /*
       تحديث المستخدمين
    */

    broadcastOnlineUsers();

    broadcastAdminOnlineUsers();

    broadcastServerStats();

    broadcastRooms();

    /*
       تسجيل الخروج
    */

    addLog(
      "disconnect",
      {
        name: username,
        roomId: roomId,
        reason: reason || ""
      }
    );
  });

});


/* =========================================================
   BASIC HTTP ROUTES
========================================================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


app.get("/health", (req, res) => {

  res.json({

    ok: true,

    service:
      "Mersal Chat",

    onlineUsers:
      users.length,

    rooms:
      rooms.length

  });

});


/* =========================================================
   START SERVER
========================================================= */

/*
   لا نعرّف PORT هنا مرة ثانية.
   نستخدم PORT مباشرة من Render.
*/

server.listen(
  process.env.PORT || 3000,
  "0.0.0.0",
  () => {

    console.log(
      "🚀 Mersal Chat server started"
    );

    console.log(
      "🌐 Port:",
      process.env.PORT || 3000
    );

    console.log(
      "🏠 Rooms:",
      rooms.length
    );

    console.log(
      "👥 Online users:",
      users.length
    );

  }
);
  
