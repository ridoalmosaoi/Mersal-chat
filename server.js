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

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================================================
   PORT
========================================================= */

const PORT =
  process.env.PORT || 3000;


/* =========================================================
   DATA FILES
========================================================= */

const DATA_DIR =
  path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}


/* =========================================================
   FILE HELPERS
========================================================= */

function dataPath(fileName) {
  return path.join(
    DATA_DIR,
    fileName
  );
}


function loadJSON(
  fileName,
  defaultValue
) {

  const file =
    dataPath(fileName);

  try {

    if (!fs.existsSync(file)) {

      fs.writeFileSync(
        file,
        JSON.stringify(
          defaultValue,
          null,
          2
        )
      );

      return defaultValue;
    }

    const content =
      fs.readFileSync(
        file,
        "utf8"
      ).trim();

    if (!content) {
      return defaultValue;
    }

    return JSON.parse(content);

  } catch (error) {

    console.error(
      `❌ خطأ في قراءة ${fileName}:`,
      error
    );

    return defaultValue;
  }
}


function saveJSON(
  fileName,
  value
) {

  try {

    fs.writeFileSync(
      dataPath(fileName),
      JSON.stringify(
        value,
        null,
        2
      )
    );

    return true;

  } catch (error) {

    console.error(
      `❌ خطأ في حفظ ${fileName}:`,
      error
    );

    return false;
  }
}


/* =========================================================
   DATABASE
========================================================= */

let admins =
  loadJSON(
    "admins.json",
    [
      {
        name: "a",
        password: "a",
        role: "master",
        permissions: {
          kick: true,
          ban: true,
          unban: true,
          mute: true,
          unmute: true,
          disconnect: true,
          undisconnect: true,
          viewUserInfo: true,
          deleteMessage: true,
          clear: true,
          chatLock: true,
          privateLock: true,
          maintenance: true,
          stars: true,
          addAdmin: true,
          removeAdmin: true,
          rooms: true,
          roomSettings: true
        },
        rooms: []
      }
    ]
  );


let bannedUsers =
  loadJSON(
    "banned.json",
    []
  );


let mutedUsers =
  loadJSON(
    "muted.json",
    []
  );


let deviceBannedUsers =
  loadJSON(
    "deviceBanned.json",
    []
  );


let stars =
  loadJSON(
    "stars.json",
    []
  );


let logs =
  loadJSON(
    "logs.json",
    []
  );


let rooms =
  loadJSON(
    "rooms.json",
    []
  );


/* =========================================================
   RUNTIME DATA
========================================================= */

let users = [];


/*
   بيانات الإشراف الخاصة بكل غرفة

   roomModeration = {
      roomId: {
        admins: [],
        bannedUsers: [],
        mutedUsers: [],
        disconnectedUsers: []
      }
   }
*/

let roomModeration =
  loadJSON(
    "roomModeration.json",
    {}
  );


/*
   رسائل الغرف محفوظة هنا
*/

let roomMessages =
  loadJSON(
    "roomMessages.json",
    {}
  );


/* =========================================================
   NORMALIZE ROOMS
========================================================= */

rooms = rooms.map(
  room => {

    return {

      id:
        String(
          room.id ||
          ""
        ),

      name:
        String(
          room.name ||
          "غرفة"
        ),

      description:
        String(
          room.description ||
          ""
        ),

      enabled:
        room.enabled !== false,

      createdAt:
        room.createdAt ||
        Date.now(),

      settings: {

        chatLocked:
          room.settings?.chatLocked === true,

        privateLocked:
          room.settings?.privateLocked === true,

        maintenance:
          room.settings?.maintenance === true,

        starsEnabled:
          room.settings?.starsEnabled !== false
      }

    };
  }
);


/* =========================================================
   NORMALIZE ADMINS
========================================================= */

admins = admins.map(
  (admin, index) => {

    return {

      name:
        String(
          admin.name ||
          ""
        ),

      password:
        String(
          admin.password ||
          ""
        ),

      role:
        admin.role ||
        (
          index === 0
            ? "master"
            : "moderator"
        ),

      permissions:
        admin.permissions ||
        {},

      rooms:
        Array.isArray(
          admin.rooms
        )
          ? admin.rooms
          : []

    };
  }
);


/* =========================================================
   SAVE NORMALIZED DATA
========================================================= */

saveJSON(
  "admins.json",
  admins
);

saveJSON(
  "rooms.json",
  rooms
);

saveJSON(
  "roomModeration.json",
  roomModeration
);

saveJSON(
  "roomMessages.json",
  roomMessages
);


/* =========================================================
   BASIC HELPERS
========================================================= */

function getIP(socket) {

  return (
    socket.handshake?.headers?.[
      "x-forwarded-for"
    ] ||
    socket.handshake?.address ||
    "unknown"
  )
    .toString()
    .split(",")[0]
    .trim();
}


function getDevice(socket) {

  return (
    socket.handshake?.headers?.[
      "user-agent"
    ] ||
    "unknown"
  );
}


function createId(prefix) {

  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}


function cleanText(
  value,
  maxLength = 500
) {

  return String(
    value || ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


function findAdmin(name) {

  const wanted =
    String(
      name || ""
    )
      .trim()
      .toLowerCase();

  return admins.find(
    admin =>
      String(
        admin.name
      )
        .trim()
        .toLowerCase()
        === wanted
  );
}


function isMasterAdmin(admin) {

  if (!admin) {
    return false;
  }

  if (
    admin.role ===
    "master"
  ) {
    return true;
  }

  /*
     الأدمن الأول يعتبر Master
     للحفاظ على الحساب القديم a
  */

  if (
    admins.length > 0 &&
    admins[0].name ===
      admin.name
  ) {
    return true;
  }

  return false;
}


function hasPermission(
  admin,
  permission
) {

  if (!admin) {
    return false;
  }

  if (
    isMasterAdmin(admin)
  ) {
    return true;
  }

  return (
    admin.permissions?.[
      permission
    ] === true
  );
}


/* =========================================================
   ROOM HELPERS
========================================================= */

function getRoom(roomId) {

  const id =
    String(
      roomId || ""
    );

  return rooms.find(
    room =>
      String(room.id) === id
  );
}


function ensureRoomModeration(
  roomId
) {

  const id =
    String(
      roomId || ""
    );

  if (
    !roomModeration[id]
  ) {

    roomModeration[id] = {

      admins: [],

      bannedUsers: [],

      mutedUsers: [],

      disconnectedUsers: []
    };

    saveJSON(
      "roomModeration.json",
      roomModeration
    );
  }

  return roomModeration[id];
}


function saveRoomData() {

  saveJSON(
    "rooms.json",
    rooms
  );

  saveJSON(
    "roomModeration.json",
    roomModeration
  );

  saveJSON(
    "roomMessages.json",
    roomMessages
  );
}


function publicRoom(room) {

  return {

    id: room.id,

    name: room.name,

    description:
      room.description || "",

    enabled:
      room.enabled !== false,

    settings:
      room.settings || {},

    users:
      users.filter(
        user =>
          user.roomId ===
          room.id
      ).length
  };
}


/* =========================================================
   ROOM ADMIN CHECK
========================================================= */

function isRoomAdmin(
  admin,
  roomId
) {

  if (!admin) {
    return false;
  }

  if (
    isMasterAdmin(admin)
  ) {
    return true;
  }

  const room =
    getRoom(roomId);

  if (!room) {
    return false;
  }

  const roomAdminList =
    ensureRoomModeration(
      room.id
    ).admins || [];

  if (
    roomAdminList.includes(
      admin.name
    )
  ) {
    return true;
  }

  if (
    Array.isArray(
      admin.rooms
    ) &&
    admin.rooms.includes(
      room.id
    )
  ) {
    return true;
  }

  return false;
}


function hasRoomPermission(
  admin,
  roomId,
  permission
) {

  if (!admin) {
    return false;
  }

  if (
    isMasterAdmin(admin)
  ) {
    return true;
  }

  if (
    !isRoomAdmin(
      admin,
      roomId
    )
  ) {
    return false;
  }

  return hasPermission(
    admin,
    permission
  );
}


/* =========================================================
   USER HELPERS
========================================================= */

function getUserBySocket(
  socketId
) {

  return users.find(
    user =>
      user.id ===
        socketId ||
      user.socketId ===
        socketId
  );
}


function getUserById(
  userId
) {

  return users.find(
    user =>
      user.id ===
      userId
  );
}


function getUserByName(
  username
) {

  const wanted =
    String(
      username || ""
    )
      .trim()
      .toLowerCase();

  return users.find(
    user =>
      String(
        user.username
      )
        .trim()
        .toLowerCase()
        === wanted
  );
}


/* =========================================================
   USER SANITIZER
========================================================= */

function publicUser(
  user
) {

  if (!user) {
    return null;
  }

  return {

    id: user.id,

    username:
      user.username,

    name:
      user.username,

    color:
      user.color ||

      "#ffd700",

    roomId:
      user.roomId ||

      null,

    role:
      user.role ||

      "user",

    roomAdmin:
      user.roomAdmin === true
  };
}


/* =========================================================
   USERNAME SECURITY
========================================================= */

function validUsername(
  username
) {

  const name =
    String(
      username || ""
    ).trim();

  if (!name) {
    return false;
  }

  if (
    name.length < 1 ||
    name.length > 25
  ) {
    return false;
  }

  /*
     منع تقليد رتب الإدارة
  */

  if (
    /^[&@]/.test(name)
  ) {
    return false;
  }

  const lower =
    name.toLowerCase();

  const reserved = [
    "admin",
    "administrator",
    "moderator",
    "master",
    "owner",
    "staff",
    "system"
  ];

  if (
    reserved.includes(
      lower
    )
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   LOGGING
========================================================= */

function addLog(
  message,
  roomId = null
) {

  const entry = {

    id:
      createId("log"),

    message:
      String(
        message || ""
      ),

    roomId:
      roomId || null,

    time:
      new Date().toISOString()
  };

  logs.push(entry);

  /*
     الاحتفاظ بآخر 1000 سجل فقط
  */

  if (
    logs.length > 1000
  ) {

    logs =
      logs.slice(
        -1000
      );
  }

  saveJSON(
    "logs.json",
    logs
  );

  io.emit(
    "new log",
    entry
  );
}


/* =========================================================
   BROADCAST HELPERS
========================================================= */

function broadcastOnlineUsers() {

  io.emit(
    "online users",
    users.map(
      publicUser
    )
  );
}


function broadcastAdminOnlineUsers() {

  io.emit(
    "admin online users",
    users.map(
      user => ({

        id:
          user.id,

        username:
          user.username,

        name:
          user.username,

        color:
          user.color,

        roomId:
          user.roomId || null,

        role:
          user.role || "user",

        roomAdmin:
          user.roomAdmin === true
      })
    )
  );
}


function broadcastServerStats() {

  io.emit(
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


function broadcastRooms() {

  io.emit(
    "rooms updated",
    rooms.map(
      publicRoom
    )
  );
}


function broadcastRoomUsers(
  roomId
) {

  const room =
    getRoom(roomId);

  if (!room) {
    return;
  }

  io.to(
    `room:${room.id}`
  ).emit(
    "room users",
    users
      .filter(
        user =>
          user.roomId ===
          room.id
      )
      .map(
        publicUser
      )
  );
}


/* =========================================================
   BANNED / MUTED CHECKS
========================================================= */

function isGloballyBanned(
  username,
  ip
) {

  return bannedUsers.some(
    ban => {

      if (
        ban.username &&
        String(
          ban.username
        ).toLowerCase() ===
          String(
            username
          ).toLowerCase()
      ) {
        return true;
      }

      if (
        ban.ip &&
        String(ban.ip) ===
          String(ip)
      ) {
        return true;
      }

      return false;
    }
  );
}


function isDeviceBanned(
  device
) {

  return deviceBannedUsers.some(
    item =>
      item.device ===
      device
  );
}


function isRoomBanned(
  roomId,
  username,
  ip
) {

  const moderation =
    ensureRoomModeration(
      roomId
    );

  return moderation.bannedUsers.some(
    ban => {

      if (
        ban.username &&
        String(
          ban.username
        ).toLowerCase() ===
          String(
            username
          ).toLowerCase()
      ) {
        return true;
      }

      if (
        ban.ip &&
        String(ban.ip) ===
          String(ip)
      ) {
        return true;
      }

      return false;
    }
  );
}


function isRoomMuted(
  roomId,
  username
) {

  const moderation =
    ensureRoomModeration(
      roomId
    );

  return moderation.mutedUsers.some(
    item =>
      String(
        item.username
      ).toLowerCase() ===
      String(
        username
      ).toLowerCase()
  );
}
/* =========================================================
   ROOM MESSAGE HELPERS
========================================================= */

function getRoomMessageList(roomId) {

  const id =
    String(roomId || "");

  if (!roomMessages[id]) {
    roomMessages[id] = [];
  }

  return roomMessages[id];
}


function saveRoomMessages(
  roomId
) {

  const id =
    String(roomId || "");

  if (!roomMessages[id]) {
    roomMessages[id] = [];
  }

  saveJSON(
    "roomMessages.json",
    roomMessages
  );
}


function addRoomMessage(
  roomId,
  message
) {

  const room =
    getRoom(roomId);

  if (!room) {
    return null;
  }

  const list =
    getRoomMessageList(
      room.id
    );

  const item = {

    id:
      createId("msg"),

    roomId:
      room.id,

    username:
      message.username ||
      "Unknown",

    name:
      message.name ||
      message.username ||
      "Unknown",

    color:
      message.color ||
      "#ffd700",

    message:
      cleanText(
        message.message,
        2000
      ),

    time:
      Date.now(),

    reply:
      message.reply || null
  };

  list.push(item);

  /*
     لا نخزن عددًا ضخمًا من الرسائل
  */

  if (
    list.length > 500
  ) {

    roomMessages[room.id] =
      list.slice(-500);
  }

  saveRoomMessages(
    room.id
  );

  return item;
}


/* =========================================================
   ROOM NOTIFICATIONS
========================================================= */

function roomNotification(
  roomId,
  message,
  type = "info"
) {

  const room =
    getRoom(roomId);

  if (!room) {
    return;
  }

  io.to(
    `room:${room.id}`
  ).emit(
    "room notification",
    {

      roomId:
        room.id,

      message:
        String(
          message || ""
        ),

      type
    }
  );
}


/* =========================================================
   ROOM MODERATION NOTIFICATION
========================================================= */

function notifyRoomModeration(
  roomId,
  action,
  username
) {

  const messages = {

    ban:
      `🚫 تم حظر ${username} من الغرفة`,

    kick:
      `👢 تم طرد ${username} من الغرفة`,

    disconnect:
      `⛔ تم فصل ${username} من الغرفة`,

    mute:
      `🔇 تم كتم ${username}`,

    unban:
      `🔓 تم فك حظر ${username}`,

    unmute:
      `🔊 تم فك كتم ${username}`

  };

  roomNotification(
    roomId,
    messages[action] ||
      `${username}: ${action}`,
    action
  );
}


/* =========================================================
   ADMIN ROLE DISPLAY
========================================================= */

function getUserRole(
  user,
  roomId = null
) {

  if (!user) {
    return "user";
  }

  if (
    user.admin === true
  ) {

    if (
      user.adminRole ===
      "master"
    ) {
      return "&";
    }

    return "@";
  }

  if (
    roomId &&
    user.roomAdmin === true
  ) {
    return "@";
  }

  return "";
}


/* =========================================================
   ROOM JOIN / LEAVE HELPERS
========================================================= */

function leaveRoomSocket(
  socket,
  notify = true
) {

  const user =
    getUserBySocket(
      socket.id
    );

  if (!user) {
    return;
  }

  const oldRoomId =
    user.roomId ||
    null;

  if (!oldRoomId) {
    return;
  }

  const room =
    getRoom(oldRoomId);

  if (room) {

    socket.leave(
      `room:${room.id}`
    );

    if (notify) {

      roomNotification(
        room.id,
        `👋 غادر ${user.username} الغرفة`
      );
    }

    broadcastRoomUsers(
      room.id
    );
  }

  user.roomId = null;

  user.roomAdmin = false;
}


/* =========================================================
   ROOM JOIN PERMISSION
========================================================= */

function canEnterRoom(
  user,
  room
) {

  if (!user || !room) {
    return {
      ok: false,
      message:
        "الغرفة غير موجودة"
    };
  }

  if (
    room.enabled === false
  ) {

    return {
      ok: false,
      message:
        "🚫 هذه الغرفة مغلقة حاليًا"
    };
  }

  if (
    isRoomBanned(
      room.id,
      user.username,
      user.ip
    )
  ) {

    return {
      ok: false,
      message:
        "🚫 أنت محظور من هذه الغرفة"
    };
  }

  const moderation =
    ensureRoomModeration(
      room.id
    );

  const disconnected =
    moderation
      .disconnectedUsers
      .some(
        item =>
          String(
            item.username
          ).toLowerCase() ===
          String(
            user.username
          ).toLowerCase()
      );

  if (disconnected) {

    return {
      ok: false,
      message:
        "⛔ تم فصلك من هذه الغرفة"
    };
  }

  return {
    ok: true
  };
}


/* =========================================================
   ROOM ADMIN STATUS
========================================================= */

function updateRoomAdminStatus(
  user,
  room
) {

  if (!user || !room) {
    return;
  }

  const admin =
    findAdmin(
      user.username
    );

  if (!admin) {

    user.admin = false;

    user.adminRole = null;

    user.roomAdmin = false;

    return;
  }

  user.admin = true;

  user.adminRole =
    isMasterAdmin(admin)
      ? "master"
      : "moderator";

  user.roomAdmin =
    isRoomAdmin(
      admin,
      room.id
    );
}


/* =========================================================
   SEND ROOM HISTORY
========================================================= */

function sendRoomHistory(
  socket,
  roomId
) {

  const room =
    getRoom(roomId);

  if (!room) {
    return;
  }

  const history =
    getRoomMessageList(
      room.id
    );

  socket.emit(
    "room history",
    {

      roomId:
        room.id,

      messages:
        history
    }
  );

  /*
     توافق مع واجهة الشات الحالية
  */

  socket.emit(
    "chat history",
    {

      roomId:
        room.id,

      messages:
        history
    }
  );
}


/* =========================================================
   PRIVATE MESSAGE STORAGE
========================================================= */

let privateMessages =
  loadJSON(
    "privateMessages.json",
    {}
  );


function privateKey(
  userA,
  userB
) {

  const a =
    String(
      userA || ""
    ).toLowerCase();

  const b =
    String(
      userB || ""
    ).toLowerCase();

  return [
    a,
    b
  ]
    .sort()
    .join("::");
}


function getPrivateMessages(
  userA,
  userB
) {

  const key =
    privateKey(
      userA,
      userB
    );

  if (
    !privateMessages[key]
  ) {
    privateMessages[key] = [];
  }

  return privateMessages[key];
}


function addPrivateMessage(
  from,
  to,
  message
) {

  const key =
    privateKey(
      from,
      to
    );

  if (
    !privateMessages[key]
  ) {
    privateMessages[key] = [];
  }

  const item = {

    id:
      createId("pm"),

    from:
      from,

    to:
      to,

    message:
      cleanText(
        message,
        2000
      ),

    time:
      Date.now()
  };

  privateMessages[key].push(
    item
  );

  if (
    privateMessages[key].length >
    300
  ) {

    privateMessages[key] =
      privateMessages[key]
        .slice(-300);
  }

  saveJSON(
    "privateMessages.json",
    privateMessages
  );

  return item;
}


/* =========================================================
   PRIVATE MESSAGE DELIVERY
========================================================= */

function sendPrivateMessageToUser(
  targetUsername,
  eventName,
  data
) {

  const target =
    getUserByName(
      targetUsername
    );

  if (!target) {
    return false;
  }

  const targetSocket =
    io.sockets.sockets.get(
      target.socketId ||
      target.id
    );

  if (!targetSocket) {
    return false;
  }

  targetSocket.emit(
    eventName,
    data
  );

  return true;
}


/* =========================================================
   FIND SOCKET
========================================================= */

function findSocketForUser(
  username
) {

  const user =
    getUserByName(
      username
    );

  if (!user) {
    return null;
  }

  return io.sockets.sockets.get(
    user.socketId ||
    user.id
  ) || null;
}


/* =========================================================
   ADMIN ROOM LIST
========================================================= */

function adminRoomList(
  admin
) {

  if (!admin) {
    return [];
  }

  if (
    isMasterAdmin(admin)
  ) {

    return rooms.map(
      publicRoom
    );
  }

  return rooms
    .filter(
      room =>
        isRoomAdmin(
          admin,
          room.id
        )
    )
    .map(
      publicRoom
    );
}


/* =========================================================
   PUBLIC ROOM LIST
========================================================= */

function publicRoomList() {

  return rooms
    .filter(
      room =>
        room.enabled !== false
    )
    .map(
      publicRoom
    );
}
/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
  "connection",
  socket => {

    console.log(
      "🔌 Socket connected:",
      socket.id
    );


    /* =====================================================
       CHECK ADMIN
    ===================================================== */

    socket.on(
      "check admin",
      name => {

        const admin =
          findAdmin(name);

        socket.emit(
          "admin check result",
          !!admin
        );

      }
    );


    /* =====================================================
       USER LOGIN / JOIN
    ===================================================== */

    socket.on(
      "join",
      data => {

        try {

          const username =
            cleanText(
              data?.username,
              25
            );


          /* -----------------------------------------------
             USERNAME
          ------------------------------------------------ */

          if (
            !username
          ) {

            socket.emit(
              "banned",
              "⚠️ اكتب اسمك أولاً"
            );

            return;
          }


          if (
            !validUsername(
              username
            ) &&
            !findAdmin(username)
          ) {

            socket.emit(
              "banned",
              "⚠️ هذا الاسم غير مسموح"
            );

            return;
          }


          /* -----------------------------------------------
             DUPLICATE USERNAME
          ------------------------------------------------ */

          const existingUser =
            getUserByName(
              username
            );

          if (existingUser) {

            socket.emit(
              "banned",
              "⚠️ الاسم مستخدم حاليًا"
            );

            return;
          }


          /* -----------------------------------------------
             CONNECTION INFO
          ------------------------------------------------ */

          const ip =
            getIP(socket);

          const device =
            String(
              data?.deviceToken ||
              getDevice(socket)
            );


          /* -----------------------------------------------
             GLOBAL DEVICE BAN
          ------------------------------------------------ */

          if (
            isDeviceBanned(
              device
            )
          ) {

            socket.emit(
              "banned",
              "⛔ هذا الجهاز محظور"
            );

            return;
          }


          /* -----------------------------------------------
             GLOBAL BAN
          ------------------------------------------------ */

          if (
            isGloballyBanned(
              username,
              ip
            )
          ) {

            socket.emit(
              "banned",
              "🚫 أنت محظور من الشات"
            );

            return;
          }


          /* -----------------------------------------------
             ADMIN
          ------------------------------------------------ */

          const admin =
            findAdmin(
              username
            );


          if (admin) {

            const password =
              String(
                data?.adminPassword ||
                ""
              );

            if (
              String(
                admin.password
              ) !== password
            ) {

              socket.emit(
                "banned",
                "🚫 كلمة السر خطأ"
              );

              return;
            }

            socket.adminData =
              admin;
          }


          /* -----------------------------------------------
             ADMIN ROLE
          ------------------------------------------------ */

          let adminRole =
            null;

          let prefix =
            "";


          if (admin) {

            if (
              isMasterAdmin(
                admin
              )
            ) {

              adminRole =
                "master";

              prefix =
                "&";

            } else {

              adminRole =
                "moderator";

              prefix =
                "@";
            }
          }


          /* -----------------------------------------------
             USER OBJECT
          ------------------------------------------------ */

          const user = {

            id:
              socket.id,

            socketId:
              socket.id,

            username:
              username,

            name:
              username,

            color:
              data?.color ||
              "#ffd700",

            ip:
              ip,

            device:
              device,

            admin:
              !!admin,

            isAdmin:
              !!admin,

            adminRole:
              adminRole,

            prefix:
              prefix,

            roomId:
              null,

            roomAdmin:
              false,

            joinedAt:
              Date.now()
          };


          users.push(
            user
          );


          socket.username =
            username;

          socket.userId =
            socket.id;


          /* -----------------------------------------------
             LOGIN SUCCESS
          ------------------------------------------------ */

          socket.emit(
            "login success",
            {

              username:
                username,

              name:
                username,

              isAdmin:
                !!admin,

              adminRole:
                adminRole,

              prefix:
                prefix,

              rooms:
                publicRoomList()
            }
          );


          /* -----------------------------------------------
             UPDATE USERS
          ------------------------------------------------ */

          broadcastOnlineUsers();

          broadcastAdminOnlineUsers();

          broadcastServerStats();


          /* -----------------------------------------------
             LOG
          ------------------------------------------------ */

          addLog(
            `👤 ${username} دخل`
          );


          console.log(
            `👤 User joined: ${username}`
          );

        } catch (error) {

          console.error(
            "❌ JOIN ERROR:",
            error
          );

          socket.emit(
            "banned",
            "❌ حدث خطأ أثناء تسجيل الدخول"
          );

        }

      }
    );


    /* =====================================================
       GET ROOMS
    ===================================================== */

    socket.on(
      "get rooms",
      () => {

        if (
          socket.adminData
        ) {

          socket.emit(
            "admin rooms",
            adminRoomList(
              socket.adminData
            )
          );

          return;
        }


        socket.emit(
          "rooms",
          publicRoomList()
        );

      }
    );


    /* =====================================================
       GET PUBLIC ROOMS
    ===================================================== */

    socket.on(
      "get public rooms",
      () => {

        socket.emit(
          "rooms",
          publicRoomList()
        );

      }
    );


    /* =====================================================
       JOIN ROOM
    ===================================================== */

    socket.on(
      "join room",
      roomId => {

        try {

          const user =
            getUserBySocket(
              socket.id
            );

          if (!user) {

            socket.emit(
              "room error",
              "❌ يجب تسجيل الدخول أولاً"
            );

            return;
          }


          const room =
            getRoom(roomId);

          if (!room) {

            socket.emit(
              "room error",
              "❌ الغرفة غير موجودة"
            );

            return;
          }


          /* -----------------------------------------------
             ROOM ACCESS
          ------------------------------------------------ */

          const access =
            canEnterRoom(
              user,
              room
            );

          if (!access.ok) {

            socket.emit(
              "room error",
              access.message
            );

            return;
          }


          /* -----------------------------------------------
             LEAVE OLD ROOM
          ------------------------------------------------ */

          if (
            user.roomId &&
            user.roomId !== room.id
          ) {

            const oldRoom =
              getRoom(
                user.roomId
              );

            if (oldRoom) {

              socket.leave(
                `room:${oldRoom.id}`
              );

              roomNotification(
                oldRoom.id,
                `👋 غادر ${user.username} الغرفة`
              );

              broadcastRoomUsers(
                oldRoom.id
              );
            }
          }


          /* -----------------------------------------------
             JOIN SOCKET.IO ROOM
          ------------------------------------------------ */

          socket.join(
            `room:${room.id}`
          );


          user.roomId =
            room.id;


          /* -----------------------------------------------
             ROOM ADMIN
          ------------------------------------------------ */

          updateRoomAdminStatus(
            user,
            room
          );


          /* -----------------------------------------------
             ROOM JOINED
          ------------------------------------------------ */

          socket.emit(
            "room joined",
            {

              room:
                publicRoom(room),

              role:
                getUserRole(
                  user,
                  room.id
                ),

              roomAdmin:
                user.roomAdmin === true
            }
          );


          /* -----------------------------------------------
             ROOM HISTORY
          ------------------------------------------------ */

          sendRoomHistory(
            socket,
            room.id
          );


          /* -----------------------------------------------
             USERS
          ------------------------------------------------ */

          broadcastRoomUsers(
            room.id
          );

          broadcastOnlineUsers();

          broadcastAdminOnlineUsers();


          /* -----------------------------------------------
             ADMIN NOTICE
          ------------------------------------------------ */

          if (
            user.admin
          ) {

            roomNotification(
              room.id,
              `✨ تم توكيل ${user.username}`
            );
          }


          /* -----------------------------------------------
             JOIN NOTICE
          ------------------------------------------------ */

          roomNotification(
            room.id,
            `👋 انضم ${user.username} إلى الغرفة`
          );


          addLog(
            `🏠 ${user.username} دخل الغرفة ${room.name}`,
            room.id
          );


          console.log(
            `🏠 ${user.username} joined room ${room.name}`
          );

        } catch (error) {

          console.error(
            "❌ JOIN ROOM ERROR:",
            error
          );

          socket.emit(
            "room error",
            "❌ تعذر دخول الغرفة"
          );

        }

      }
    );


    /* =====================================================
       LEAVE ROOM
    ===================================================== */

    socket.on(
      "leave room",
      () => {

        const user =
          getUserBySocket(
            socket.id
          );

        if (!user) {
          return;
        }

        leaveRoomSocket(
          socket,
          true
        );


        broadcastOnlineUsers();

        broadcastAdminOnlineUsers();

      }
    );


    /* =====================================================
       CURRENT ROOM
    ===================================================== */

    socket.on(
      "get current room",
      () => {

        const user =
          getUserBySocket(
            socket.id
          );

        if (!user) {
          return;
        }

        const room =
          getRoom(
            user.roomId
          );

        socket.emit(
          "current room",
          room
            ? publicRoom(room)
            : null
        );

      }
    );


    /* =====================================================
       ROOM USERS
    ===================================================== */

    socket.on(
      "get room users",
      roomId => {

        const user =
          getUserBySocket(
            socket.id
          );

        if (!user) {
          return;
        }

        const room =
          getRoom(
            roomId ||
            user.roomId
          );

        if (!room) {
          return;
        }

        socket.emit(
          "room users",
          users
            .filter(
              item =>
                item.roomId ===
                room.id
            )
            .map(
              publicUser
            )
        );

      }
    );


    /* =====================================================
       ROOM HISTORY REQUEST
    ===================================================== */

    socket.on(
      "get room history",
      roomId => {

        const user =
          getUserBySocket(
            socket.id
          );

        if (!user) {
          return;
        }

        const room =
          getRoom(
            roomId ||
            user.roomId
          );

        if (!room) {
          return;
        }

        sendRoomHistory(
          socket,
          room.id
        );

      }
    );
    /* =========================================================
   CREATE ROOM
========================================================= */

socket.on(
  "create room",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "room error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      if (
        !isMasterAdmin(admin) &&
        !hasPermission(
          admin,
          "rooms"
        ) &&
        !hasPermission(
          admin,
          "addAdmin"
        )
      ) {

        socket.emit(
          "room error",
          "⛔ ليس لديك صلاحية إنشاء الغرف"
        );

        return;
      }


      const name =
        cleanText(
          data?.name,
          50
        );

      const description =
        cleanText(
          data?.description,
          500
        );


      if (!name) {

        socket.emit(
          "room error",
          "⚠️ اكتب اسم الغرفة"
        );

        return;
      }


      const exists =
        rooms.some(
          room =>
            String(
              room.name
            ).toLowerCase() ===
            name.toLowerCase()
        );


      if (exists) {

        socket.emit(
          "room error",
          "⚠️ توجد غرفة بهذا الاسم"
        );

        return;
      }


      const room = {

        id:
          createId("room"),

        name:
          name,

        description:
          description,

        enabled:
          true,

        createdAt:
          Date.now(),

        createdBy:
          admin.name,

        admins:
          [],

        permissions:
          {},

        settings: {

          stars:
            false,

          chatLock:
            false,

          maintenance:
            false,

          protection:
            true
        }

      };


      rooms.push(
        room
      );


      saveJSON(
        "rooms.json",
        rooms
      );


      ensureRoomModeration(
        room.id
      );


      socket.emit(
        "room created",
        publicRoom(room)
      );


      io.emit(
        "rooms updated",
        publicRoomList()
      );


      socket.emit(
        "admin rooms",
        adminRoomList(admin)
      );


      addLog(
        `🏠 تم إنشاء الغرفة ${room.name} بواسطة ${admin.name}`
      );


      console.log(
        `🏠 Room created: ${room.name}`
      );

    } catch (error) {

      console.error(
        "❌ CREATE ROOM ERROR:",
        error
      );

      socket.emit(
        "room error",
        "❌ حدث خطأ أثناء إنشاء الغرفة"
      );
    }

  }
);


/* =========================================================
   EDIT ROOM
========================================================= */

socket.on(
  "edit room",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "room error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );

      if (!room) {

        socket.emit(
          "room error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          "rooms"
        ) &&
        !isMasterAdmin(admin)
      ) {

        socket.emit(
          "room error",
          "⛔ ليس لديك صلاحية تعديل هذه الغرفة"
        );

        return;
      }


      const newName =
        cleanText(
          data?.name,
          50
        );

      const description =
        cleanText(
          data?.description,
          500
        );


      if (newName) {

        const duplicate =
          rooms.some(
            item =>
              item.id !== room.id &&
              String(
                item.name
              ).toLowerCase() ===
              newName.toLowerCase()
          );

        if (duplicate) {

          socket.emit(
            "room error",
            "⚠️ يوجد اسم غرفة آخر مطابق"
          );

          return;
        }

        room.name =
          newName;
      }


      room.description =
        description;


      saveJSON(
        "rooms.json",
        rooms
      );


      socket.emit(
        "room updated",
        publicRoom(room)
      );


      io.emit(
        "rooms updated",
        publicRoomList()
      );


      socket.emit(
        "admin rooms",
        adminRoomList(admin)
      );


      addLog(
        `✏️ تم تعديل الغرفة ${room.name} بواسطة ${admin.name}`
      );

    } catch (error) {

      console.error(
        "❌ EDIT ROOM ERROR:",
        error
      );

      socket.emit(
        "room error",
        "❌ حدث خطأ أثناء تعديل الغرفة"
      );
    }

  }
);


/* =========================================================
   UPDATE ROOM
   ALIAS FOR EDIT ROOM
========================================================= */

socket.on(
  "update room",
  data => {

    socket.emit(
      "edit room",
      data
    );

  }
);


/* =========================================================
   DELETE ROOM
========================================================= */

socket.on(
  "delete room",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "room error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );

      if (!room) {

        socket.emit(
          "room error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          "rooms"
        ) &&
        !isMasterAdmin(admin)
      ) {

        socket.emit(
          "room error",
          "⛔ ليس لديك صلاحية حذف هذه الغرفة"
        );

        return;
      }


      /*
         إخراج جميع الموجودين
         من الغرفة قبل حذفها
      */

      users
        .filter(
          user =>
            user.roomId ===
            room.id
        )
        .forEach(
          user => {

            const targetSocket =
              io.sockets.sockets.get(
                user.socketId
              );

            if (
              targetSocket
            ) {

              targetSocket.leave(
                `room:${room.id}`
              );

              targetSocket.emit(
                "room deleted",
                {
                  roomId:
                    room.id
                }
              );
            }

            user.roomId =
              null;

            user.roomAdmin =
              false;
          }
        );


      rooms =
        rooms.filter(
          item =>
            item.id !==
            room.id
        );


      delete roomMessages[
        room.id
      ];


      delete roomModeration[
        room.id
      ];


      saveJSON(
        "rooms.json",
        rooms
      );

      saveJSON(
        "roomMessages.json",
        roomMessages
      );

      saveJSON(
        "roomModeration.json",
        roomModeration
      );


      socket.emit(
        "room deleted",
        {
          roomId:
            room.id
        }
      );


      io.emit(
        "rooms updated",
        publicRoomList()
      );


      socket.emit(
        "admin rooms",
        adminRoomList(admin)
      );


      broadcastOnlineUsers();

      broadcastAdminOnlineUsers();


      addLog(
        `🗑️ تم حذف الغرفة ${room.name} بواسطة ${admin.name}`
      );


      console.log(
        `🗑️ Room deleted: ${room.name}`
      );

    } catch (error) {

      console.error(
        "❌ DELETE ROOM ERROR:",
        error
      );

      socket.emit(
        "room error",
        "❌ حدث خطأ أثناء حذف الغرفة"
      );
    }

  }
);


/* =========================================================
   ENABLE / DISABLE ROOM
========================================================= */

socket.on(
  "toggle room",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "room error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );

      if (!room) {

        socket.emit(
          "room error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          "rooms"
        ) &&
        !isMasterAdmin(admin)
      ) {

        socket.emit(
          "room error",
          "⛔ ليس لديك صلاحية التحكم بهذه الغرفة"
        );

        return;
      }


      room.enabled =
        data?.enabled === undefined
          ? !room.enabled
          : Boolean(
              data.enabled
            );


      saveJSON(
        "rooms.json",
        rooms
      );


      socket.emit(
        "room toggled",
        publicRoom(room)
      );


      io.emit(
        "rooms updated",
        publicRoomList()
      );


      socket.emit(
        "admin rooms",
        adminRoomList(admin)
      );


      addLog(
        `${room.enabled ? "🟢" : "🔴"} تم ${
          room.enabled
            ? "تفعيل"
            : "تعطيل"
        } الغرفة ${room.name}`
      );

    } catch (error) {

      console.error(
        "❌ TOGGLE ROOM ERROR:",
        error
      );

      socket.emit(
        "room error",
        "❌ حدث خطأ أثناء تغيير حالة الغرفة"
      );
    }

  }
);


/* =========================================================
   ADMIN PANEL LOGIN
========================================================= */

socket.on(
  "admin panel login",
  data => {

    try {

      const name =
        cleanText(
          data?.name,
          50
        );

      const password =
        String(
          data?.password ||
          ""
        );


      const admin =
        findAdmin(name);


      if (
        !admin ||
        String(
          admin.password
        ) !== password
      ) {

        socket.emit(
          "admin login failed"
        );

        return;
      }


      socket.adminData =
        admin;

      socket.isAdminPanel =
        true;


      socket.emit(
        "admin login success",
        {

          name:
            admin.name,

          permissions:
            admin.permissions ||
            {},

          role:
            isMasterAdmin(admin)
              ? "master"
              : "moderator",

          rooms:
            adminRoomList(admin)
        }
      );


      /*
         أرسل البيانات مباشرة
         حتى لا تحتاج لوحة الإدارة
         إلى تسجيل دخول مرة ثانية
      */

      socket.emit(
        "admin rooms",
        adminRoomList(admin)
      );


      socket.emit(
        "admin online users",
        users.map(
          adminUser
        )
      );


      socket.emit(
        "server stats",
        getServerStats()
      );


      socket.emit(
        "admin list",
        admins.map(
          admin =>
            ({
              name:
                admin.name,

              role:
                isMasterAdmin(admin)
                  ? "master"
                  : "moderator",

              permissions:
                admin.permissions ||
                {}
            })
        )
      );


      socket.emit(
        "logs",
        logs
      );


      console.log(
        `👑 Admin panel login: ${admin.name}`
      );

    } catch (error) {

      console.error(
        "❌ ADMIN LOGIN ERROR:",
        error
      );

      socket.emit(
        "admin login failed"
      );
    }

  }
);


/* =========================================================
   GET ADMIN ROOMS
========================================================= */

socket.on(
  "get admin rooms",
  () => {

    const admin =
      socket.adminData;

    if (!admin) {
      return;
    }

    socket.emit(
      "admin rooms",
      adminRoomList(admin)
    );

  }
);


/* =========================================================
   GET ADMIN USERS
========================================================= */

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
      users.map(
        adminUser
      )
    );

    socket.emit(
      "server stats",
      getServerStats()
    );

  }
);


/* =========================================================
   GET LOGS
========================================================= */

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

  }
);
    /* =========================================================
   ROOM CHAT MESSAGE
========================================================= */

socket.on(
  "chat message",
  data => {

    try {

      const user =
        getUserBySocket(
          socket.id
        );

      if (!user) {
        return;
      }


      const roomId =
        data?.roomId ||
        user.roomId;


      const room =
        getRoom(roomId);


      if (!room) {

        socket.emit(
          "chat error",
          "❌ يجب دخول غرفة أولاً"
        );

        return;
      }


      if (
        user.roomId !==
        room.id
      ) {

        socket.emit(
          "chat error",
          "❌ أنت لست داخل هذه الغرفة"
        );

        return;
      }


      const moderation =
        ensureRoomModeration(
          room.id
        );


      /* -----------------------------------------------
         CHAT LOCK
      ------------------------------------------------ */

      if (
        room.settings?.chatLock === true &&
        !user.admin
      ) {

        socket.emit(
          "chat error",
          "🔒 الدردشة مقفلة حاليًا"
        );

        return;
      }


      /* -----------------------------------------------
         MAINTENANCE
      ------------------------------------------------ */

      if (
        room.settings?.maintenance === true &&
        !user.admin
      ) {

        socket.emit(
          "chat error",
          "🛠️ الغرفة تحت الصيانة حاليًا"
        );

        return;
      }


      /* -----------------------------------------------
         ROOM BAN
      ------------------------------------------------ */

      if (
        isRoomBanned(
          room.id,
          user.username,
          user.ip
        )
      ) {

        socket.emit(
          "chat error",
          "🚫 أنت محظور من هذه الغرفة"
        );

        return;
      }


      /* -----------------------------------------------
         ROOM MUTE
      ------------------------------------------------ */

      const muted =
        moderation.mutedUsers.some(
          item =>
            String(
              item.username
            ).toLowerCase() ===
            String(
              user.username
            ).toLowerCase()
        );


      if (
        muted &&
        !user.admin
      ) {

        socket.emit(
          "chat error",
          "🔇 أنت مكتوم في هذه الغرفة"
        );

        return;
      }


      const messageText =
        cleanText(
          data?.message,
          2000
        );


      if (!messageText) {
        return;
      }


      const item =
        addRoomMessage(
          room.id,
          {

            username:
              user.username,

            name:
              user.name,

            color:
              user.color,

            message:
              messageText,

            reply:
              data?.reply || null
          }
        );


      if (!item) {
        return;
      }


      /*
         أرسل الرسالة لكل الموجودين
         في نفس الغرفة فقط
      */

      io.to(
        `room:${room.id}`
      ).emit(
        "chat message",
        item
      );


      addLog(
        `💬 ${user.username} أرسل رسالة في ${room.name}`,
        room.id
      );

    } catch (error) {

      console.error(
        "❌ CHAT MESSAGE ERROR:",
        error
      );

      socket.emit(
        "chat error",
        "❌ تعذر إرسال الرسالة"
      );
    }

  }
);


/* =========================================================
   ROOM MESSAGE ALIAS
========================================================= */

socket.on(
  "room message",
  data => {

    socket.emit(
      "chat message",
      data
    );

  }
);


/* =========================================================
   DELETE ROOM MESSAGE
========================================================= */

socket.on(
  "delete room message",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "admin error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );


      if (!room) {

        socket.emit(
          "admin error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          "deleteMessage"
        )
      ) {

        socket.emit(
          "admin error",
          "⛔ ليس لديك صلاحية حذف الرسائل"
        );

        return;
      }


      const messageId =
        String(
          data?.messageId ||
          ""
        );


      const list =
        getRoomMessageList(
          room.id
        );


      const index =
        list.findIndex(
          message =>
            String(
              message.id
            ) === messageId
        );


      if (
        index === -1
      ) {

        socket.emit(
          "admin error",
          "❌ الرسالة غير موجودة"
        );

        return;
      }


      list.splice(
        index,
        1
      );


      saveRoomMessages(
        room.id
      );


      io.to(
        `room:${room.id}`
      ).emit(
        "room message deleted",
        {

          roomId:
            room.id,

          messageId:
            messageId
        }
      );


      addLog(
        `🗑️ حذف الأدمن ${admin.name} رسالة من ${room.name}`,
        room.id
      );

    } catch (error) {

      console.error(
        "❌ DELETE MESSAGE ERROR:",
        error
      );

      socket.emit(
        "admin error",
        "❌ تعذر حذف الرسالة"
      );
    }

  }
);


/* =========================================================
   GIVE STAR
========================================================= */

socket.on(
  "give room star",
  data => {

    try {

      const user =
        getUserBySocket(
          socket.id
        );

      if (!user) {
        return;
      }


      const room =
        getRoom(
          data?.roomId ||
          user.roomId
        );


      if (!room) {
        return;
      }


      if (
        room.settings?.stars !== true &&
        !user.admin
      ) {

        socket.emit(
          "star error",
          "⭐ النجوم غير مفعلة في هذه الغرفة"
        );

        return;
      }


      const targetName =
        cleanText(
          data?.username,
          50
        );


      const target =
        getUserByName(
          targetName
        );


      if (
        !target ||
        target.roomId !==
        room.id
      ) {

        socket.emit(
          "star error",
          "❌ المستخدم غير موجود في الغرفة"
        );

        return;
      }


      if (
        String(
          target.username
        ).toLowerCase() ===
        String(
          user.username
        ).toLowerCase()
      ) {

        socket.emit(
          "star error",
          "❌ لا يمكنك إعطاء نجمة لنفسك"
        );

        return;
      }


      const star = {

        id:
          createId("star"),

        roomId:
          room.id,

        from:
          user.username,

        to:
          target.username,

        time:
          Date.now()
      };


      stars.push(
        star
      );


      saveJSON(
        "stars.json",
        stars
      );


      io.to(
        `room:${room.id}`
      ).emit(
        "room star",
        star
      );


      addLog(
        `⭐ ${user.username} أعطى نجمة إلى ${target.username}`,
        room.id
      );

    } catch (error) {

      console.error(
        "❌ STAR ERROR:",
        error
      );

      socket.emit(
        "star error",
        "❌ تعذر إعطاء النجمة"
      );
    }

  }
);


/* =========================================================
   REMOVE STAR
========================================================= */

socket.on(
  "remove room star",
  data => {

    try {

      const user =
        getUserBySocket(
          socket.id
        );

      if (!user) {
        return;
      }


      const room =
        getRoom(
          data?.roomId ||
          user.roomId
        );


      if (!room) {
        return;
      }


      const targetName =
        cleanText(
          data?.username,
          50
        );


      const index =
        stars.findIndex(
          star =>
            String(
              star.roomId
            ) ===
            String(
              room.id
            ) &&
            String(
              star.to
            ).toLowerCase() ===
            targetName.toLowerCase()
        );


      if (
        index === -1
      ) {

        socket.emit(
          "star error",
          "⭐ لا توجد نجمة"
        );

        return;
      }


      stars.splice(
        index,
        1
      );


      saveJSON(
        "stars.json",
        stars
      );


      io.to(
        `room:${room.id}`
      ).emit(
        "room star removed",
        {

          roomId:
            room.id,

          username:
            targetName
        }
      );

    } catch (error) {

      console.error(
        "❌ REMOVE STAR ERROR:",
        error
      );

      socket.emit(
        "star error",
        "❌ تعذر إزالة النجمة"
      );
    }

  }
);


/* =========================================================
   TOGGLE ROOM STARS
========================================================= */

socket.on(
  "toggle room stars",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "admin error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );


      if (!room) {

        socket.emit(
          "admin error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          "stars"
        )
      ) {

        socket.emit(
          "admin error",
          "⛔ ليس لديك صلاحية النجوم"
        );

        return;
      }


      if (!room.settings) {
        room.settings = {};
      }


      room.settings.stars =
        data?.enabled === undefined
          ? !room.settings.stars
          : Boolean(
              data.enabled
            );


      saveJSON(
        "rooms.json",
        rooms
      );


      io.to(
        `room:${room.id}`
      ).emit(
        "room stars mode",
        {

          roomId:
            room.id,

          enabled:
            room.settings.stars
        }
      );


      socket.emit(
        "room stars updated",
        {

          roomId:
            room.id,

          enabled:
            room.settings.stars
        }
      );


      addLog(
        `⭐ تم ${
          room.settings.stars
            ? "تفعيل"
            : "تعطيل"
        } النجوم في ${room.name}`,
        room.id
      );

    } catch (error) {

      console.error(
        "❌ TOGGLE STARS ERROR:",
        error
      );

      socket.emit(
        "admin error",
        "❌ تعذر تغيير حالة النجوم"
      );
    }

  }
);


/* =========================================================
   ROOM SETTINGS
========================================================= */

socket.on(
  "room setting",
  data => {

    try {

      const admin =
        socket.adminData;

      if (!admin) {

        socket.emit(
          "admin error",
          "❌ يجب تسجيل الدخول كأدمن"
        );

        return;
      }


      const room =
        getRoom(
          data?.roomId
        );


      if (!room) {

        socket.emit(
          "admin error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      if (
        !hasRoomPermission(
          admin,
          room.id,
          data?.setting
        )
      ) {

        socket.emit(
          "admin error",
          "⛔ ليس لديك صلاحية تغيير هذا الإعداد"
        );

        return;
      }


      if (!room.settings) {
        room.settings = {};
      }


      const setting =
        String(
          data?.setting ||
          ""
        );


      const allowed = [
        "stars",
        "chatLock",
        "maintenance",
        "protection"
      ];


      if (
        !allowed.includes(
          setting
        )
      ) {

        socket.emit(
          "admin error",
          "❌ إعداد غير معروف"
        );

        return;
      }


      room.settings[setting] =
        data?.enabled === undefined
          ? !room.settings[setting]
          : Boolean(
              data.enabled
            );


      saveJSON(
        "rooms.json",
        rooms
      );


      io.to(
        `room:${room.id}`
      ).emit(
        "room setting updated",
        {

          roomId:
            room.id,

          setting:
            setting,

          enabled:
            room.settings[setting]
        }
      );


      socket.emit(
        "room settings",
        {

          roomId:
            room.id,

          settings:
            room.settings
        }
      );


    } catch (error) {

      console.error(
        "❌ ROOM SETTING ERROR:",
        error
      );

      socket.emit(
        "admin error",
        "❌ تعذر تغيير إعداد الغرفة"
      );
    }

  }
);
    /* =========================================================
   PART 6
   ROOM MODERATION
   ========================================================= */


/* =========================
   ROOM MODERATION HELPER
========================= */

function getSocketByUser(target){

  if(!target){
    return null;
  }

  const socketId =
    target.socketId ||
    target.id ||
    null;

  if(!socketId){
    return null;
  }

  return io.sockets.sockets.get(socketId) || null;
}


function canModerateRoom(socket, roomId, permission){

  const admin = getAdmin(socket);

  if(!admin){
    return false;
  }

  if(isMasterAdmin(socket)){
    return true;
  }

  if(admin.permissions?.[permission] === true){
    return true;
  }

  return hasRoomPermission(
    admin,
    roomId,
    permission
  );
}


/* =========================================================
   KICK USER FROM ROOM
   ========================================================= */

socket.on("room kick", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "kick"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الطرد في هذه الغرفة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);

    if(!room){
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }


    const target =
      users.find(u =>
        String(u.name).toLowerCase() ===
        username.toLowerCase()
      );


    if(!target){
      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );
      return;
    }


    const targetSocket =
      getSocketByUser(target);


    /*
       إزالة المستخدم من الغرفة فقط
    */

    if(
      typeof leaveRoomSocket === "function"
    ){

      leaveRoomSocket(
        targetSocket,
        roomId
      );

    }else{

      if(
        Array.isArray(target.rooms)
      ){

        target.rooms =
          target.rooms.filter(
            id => id !== roomId
          );

      }

    }


    if(targetSocket){

      targetSocket.emit(
        "room kicked",
        {
          roomId: roomId,
          message:
            "👢 تم طردك من الغرفة"
        }
      );

    }


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `👢 تم طرد ${target.name} من الغرفة`
      }
    );


    logs.push({

      action: "room_kick",

      roomId: roomId,

      admin:
        getAdmin(socket)?.name || "",

      target:
        target.name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


  }catch(error){

    console.error(
      "❌ ROOM KICK ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل طرد المستخدم"
    );

  }

});


/* =========================================================
   BAN USER FROM ROOM
   ========================================================= */

socket.on("room ban", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "ban"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الحظر في هذه الغرفة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);


    if(!room){
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }


    const target =
      users.find(u =>
        String(u.name).toLowerCase() ===
        username.toLowerCase()
      );


    if(!target){
      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );
      return;
    }


    if(
      !roomModeration[roomId]
    ){

      ensureRoomModeration(
        roomId
      );

    }


    const moderation =
      roomModeration[roomId];


    if(
      !Array.isArray(
        moderation.banned
      )
    ){

      moderation.banned = [];

    }


    const exists =
      moderation.banned.some(
        name =>
          String(name).toLowerCase() ===
          String(target.name).toLowerCase()
      );


    if(!exists){

      moderation.banned.push(
        target.name
      );

    }


    saveJSON(
      "roomModeration.json",
      roomModeration
    );


    const targetSocket =
      getSocketByUser(target);


    if(targetSocket){

      if(
        typeof leaveRoomSocket === "function"
      ){

        leaveRoomSocket(
          targetSocket,
          roomId
        );

      }


      targetSocket.emit(
        "room banned",
        {
          roomId: roomId,
          message:
            "🚫 تم حظرك من هذه الغرفة"
        }
      );

    }


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `🚫 تم حظر ${target.name} من الغرفة`
      }
    );


    logs.push({

      action: "room_ban",

      roomId: roomId,

      admin:
        getAdmin(socket)?.name || "",

      target:
        target.name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


  }catch(error){

    console.error(
      "❌ ROOM BAN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل حظر المستخدم"
    );

  }

});


/* =========================================================
   UNBAN USER FROM ROOM
   ========================================================= */

socket.on("room unban", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "unban"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الحظر"
      );

      return;
    }


    ensureRoomModeration(
      roomId
    );


    const moderation =
      roomModeration[roomId];


    moderation.banned =
      (moderation.banned || [])
        .filter(name =>
          String(name).toLowerCase() !==
          username.toLowerCase()
        );


    saveJSON(
      "roomModeration.json",
      roomModeration
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `🔓 تم فك حظر ${username}`
      }
    );


    socket.emit(
      "admin success",
      "🔓 تم فك الحظر"
    );


  }catch(error){

    console.error(
      "❌ ROOM UNBAN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فك الحظر"
    );

  }

});


/* =========================================================
   MUTE USER IN ROOM
   ========================================================= */

socket.on("room mute", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "mute"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الكتم"
      );

      return;
    }


    const target =
      users.find(u =>
        String(u.name).toLowerCase() ===
        username.toLowerCase()
      );


    if(!target){
      return;
    }


    ensureRoomModeration(
      roomId
    );


    const moderation =
      roomModeration[roomId];


    if(
      !Array.isArray(
        moderation.muted
      )
    ){

      moderation.muted = [];

    }


    const exists =
      moderation.muted.some(
        name =>
          String(name).toLowerCase() ===
          String(target.name).toLowerCase()
      );


    if(!exists){

      moderation.muted.push(
        target.name
      );

    }


    saveJSON(
      "roomModeration.json",
      roomModeration
    );


    const targetSocket =
      getSocketByUser(target);


    if(targetSocket){

      targetSocket.emit(
        "room muted",
        {
          roomId: roomId,
          message:
            "🔇 تم كتمك في هذه الغرفة"
        }
      );

    }


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `🔇 تم كتم ${target.name}`
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM MUTE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل كتم المستخدم"
    );

  }

});


/* =========================================================
   UNMUTE USER
   ========================================================= */

socket.on("room unmute", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "unmute"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الكتم"
      );

      return;
    }


    ensureRoomModeration(
      roomId
    );


    const moderation =
      roomModeration[roomId];


    moderation.muted =
      (moderation.muted || [])
        .filter(name =>
          String(name).toLowerCase() !==
          username.toLowerCase()
        );


    saveJSON(
      "roomModeration.json",
      roomModeration
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `🔊 تم فك كتم ${username}`
      }
    );


    socket.emit(
      "admin success",
      "🔊 تم فك الكتم"
    );


  }catch(error){

    console.error(
      "❌ ROOM UNMUTE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فك الكتم"
    );

  }

});


/* =========================================================
   DISCONNECT USER FROM ROOM
   ========================================================= */

socket.on("room disconnect", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const username =
      String(
        data?.username ||
        data?.name ||
        ""
      ).trim();


    if(!roomId || !username){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "disconnect"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فصل المستخدم"
      );

      return;
    }


    const target =
      users.find(u =>
        String(u.name).toLowerCase() ===
        username.toLowerCase()
      );


    if(!target){
      return;
    }


    const targetSocket =
      getSocketByUser(target);


    if(targetSocket){

      if(
        typeof leaveRoomSocket === "function"
      ){

        leaveRoomSocket(
          targetSocket,
          roomId
        );

      }


      targetSocket.emit(
        "room disconnected",
        {
          roomId: roomId,
          message:
            "⛔ تم فصلك من الغرفة"
        }
      );

    }


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          `⛔ تم فصل ${target.name} من الغرفة`
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM DISCONNECT ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فصل المستخدم"
    );

  }

});


/* =========================================================
   ROOM CHAT LOCK
   ========================================================= */

socket.on("toggle room chat lock", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const enabled =
      Boolean(data?.enabled);


    if(!roomId){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "chatLock"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية قفل الدردشة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);


    if(!room){
      return;
    }


    room.settings =
      room.settings || {};


    room.settings.chatLock =
      enabled;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(roomId).emit(
      "room settings updated",
      {
        roomId: roomId,
        chatLock: enabled
      }
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          enabled
            ? "🔒 تم قفل الدردشة"
            : "🔓 تم فتح الدردشة"
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM CHAT LOCK ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير قفل الدردشة"
    );

  }

});


/* =========================================================
   ROOM MAINTENANCE
   ========================================================= */

socket.on("toggle room maintenance", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const enabled =
      Boolean(data?.enabled);


    if(!roomId){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "maintenance"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية وضع الغرفة في الصيانة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);


    if(!room){
      return;
    }


    room.settings =
      room.settings || {};


    room.settings.maintenance =
      enabled;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(roomId).emit(
      "room settings updated",
      {
        roomId: roomId,
        maintenance: enabled
      }
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          enabled
            ? "🛠️ تم تفعيل صيانة الغرفة"
            : "✅ تم إنهاء صيانة الغرفة"
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM MAINTENANCE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير صيانة الغرفة"
    );

  }

});


/* =========================================================
   ROOM STARS
   ========================================================= */

socket.on("toggle room stars", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const enabled =
      Boolean(data?.enabled);


    if(!roomId){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "stars"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية النجوم في هذه الغرفة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);


    if(!room){
      return;
    }


    room.settings =
      room.settings || {};


    room.settings.stars =
      enabled;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(roomId).emit(
      "room settings updated",
      {
        roomId: roomId,
        stars: enabled
      }
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          enabled
            ? "⭐ تم تفعيل النجوم في الغرفة"
            : "⭐ تم إيقاف النجوم في الغرفة"
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM STARS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير النجوم"
    );

  }

});


/* =========================================================
   ROOM PROTECTION
   ========================================================= */

socket.on("toggle room protection", (data) => {

  try {

    const roomId =
      String(data?.roomId || "").trim();

    const enabled =
      Boolean(data?.enabled);


    if(!roomId){
      return;
    }


    if(
      !canModerateRoom(
        socket,
        roomId,
        "protection"
      )
    ){

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية تغيير حماية الغرفة"
      );

      return;
    }


    const room =
      rooms.find(r => r.id === roomId);


    if(!room){
      return;
    }


    room.settings =
      room.settings || {};


    room.settings.protection =
      enabled;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(roomId).emit(
      "room settings updated",
      {
        roomId: roomId,
        protection: enabled
      }
    );


    io.to(roomId).emit(
      "room notification",
      {
        roomId: roomId,
        message:
          enabled
            ? "🛡️ تم تفعيل حماية الغرفة"
            : "🛡️ تم إيقاف حماية الغرفة"
      }
    );


  }catch(error){

    console.error(
      "❌ ROOM PROTECTION ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير حماية الغرفة"
    );

  }

});
    /* =========================================================
   PART 7
   ADMIN MANAGEMENT / LOGS / STATS
   ========================================================= */


/* =========================================================
   GET ADMIN USERS
   ========================================================= */

socket.on("get admin users", () => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {

      socket.emit(
        "admin error",
        "❌ يجب تسجيل الدخول كأدمن"
      );

      return;
    }

    socket.emit(
      "admin users",
      admins.map(a => ({
        name: a.name,
        role: a.role || "admin",
        permissions: a.permissions || {}
      }))
    );

  } catch (error) {

    console.error(
      "❌ GET ADMIN USERS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ تعذر تحميل قائمة الأدمن"
    );

  }

});


/* =========================================================
   GET LOGS
   ========================================================= */

socket.on("get logs", () => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }

    socket.emit(
      "logs",
      Array.isArray(logs) ? logs : []
    );

  } catch (error) {

    console.error(
      "❌ GET LOGS ERROR",
      error
    );

  }

});


/* =========================================================
   GET SERVER STATS
   ========================================================= */

socket.on("get server stats", () => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }

    socket.emit(
      "server stats",
      {
        onlineUsers:
          Array.isArray(users)
            ? users.length
            : 0,

        bannedUsers:
          Array.isArray(bannedUsers)
            ? bannedUsers.length
            : 0,

        admins:
          Array.isArray(admins)
            ? admins.length
            : 0
      }
    );

  } catch (error) {

    console.error(
      "❌ SERVER STATS ERROR",
      error
    );

  }

});


/* =========================================================
   ADD ADMIN
   ========================================================= */

socket.on("add admin", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {

      socket.emit(
        "admin error",
        "❌ يجب تسجيل الدخول كأدمن"
      );

      return;
    }


    const allowed =
      isMasterAdmin(socket) ||
      admin.permissions?.addAdmin === true;


    if (!allowed) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية إضافة أدمن"
      );

      return;
    }


    const name =
      String(data?.name || "").trim();

    const password =
      String(data?.password || "");


    if (!name || !password) {

      socket.emit(
        "admin error",
        "❌ اكتب اسم الأدمن وكلمة المرور"
      );

      return;
    }


    const exists =
      admins.some(a =>
        String(a.name).toLowerCase() ===
        name.toLowerCase()
      );


    if (exists) {

      socket.emit(
        "admin error",
        "❌ هذا الأدمن موجود مسبقًا"
      );

      return;
    }


    const newAdmin = {

      name: name,

      password: password,

      role: "admin",

      permissions:
        data?.permissions || {}

    };


    admins.push(newAdmin);


    saveJSON(
      "admins.json",
      admins
    );


    logs.push({

      action: "add_admin",

      admin: admin.name,

      target: name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    io.emit(
      "admin users",
      admins.map(a => ({
        name: a.name,
        role: a.role || "admin",
        permissions: a.permissions || {}
      }))
    );


    socket.emit(
      "admin success",
      "✅ تم إضافة الأدمن بنجاح"
    );


  } catch (error) {

    console.error(
      "❌ ADD ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل إضافة الأدمن"
    );

  }

});


/* =========================================================
   REMOVE ADMIN
   ========================================================= */

socket.on("remove admin", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {

      socket.emit(
        "admin error",
        "❌ يجب تسجيل الدخول كأدمن"
      );

      return;
    }


    const allowed =
      isMasterAdmin(socket) ||
      admin.permissions?.removeAdmin === true;


    if (!allowed) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية حذف أدمن"
      );

      return;
    }


    const name =
      String(data?.name || "").trim();


    if (!name) {
      return;
    }


    const targetIndex =
      admins.findIndex(a =>
        String(a.name).toLowerCase() ===
        name.toLowerCase()
      );


    if (targetIndex === -1) {

      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );

      return;
    }


    const target =
      admins[targetIndex];


    const targetIsMaster =
      target.role === "master" ||
      (
        admins.length > 0 &&
        admins[0].name === target.name
      );


    if (targetIsMaster) {

      socket.emit(
        "admin error",
        "❌ لا يمكن حذف الأدمن الرئيسي"
      );

      return;
    }


    admins.splice(
      targetIndex,
      1
    );


    saveJSON(
      "admins.json",
      admins
    );


    logs.push({

      action: "remove_admin",

      admin: admin.name,

      target: name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    io.emit(
      "admin users",
      admins.map(a => ({
        name: a.name,
        role: a.role || "admin",
        permissions: a.permissions || {}
      }))
    );


    socket.emit(
      "admin success",
      "🗑️ تم حذف الأدمن بنجاح"
    );


  } catch (error) {

    console.error(
      "❌ REMOVE ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل حذف الأدمن"
    );

  }

});


/* =========================================================
   REFRESH ADMIN PANEL
   ========================================================= */

socket.on("refresh admin panel", () => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    socket.emit(
      "admin users",
      admins.map(a => ({
        name: a.name,
        role: a.role || "admin",
        permissions: a.permissions || {}
      }))
    );


    socket.emit(
      "admin rooms",
      getPublicRooms()
    );


    socket.emit(
      "logs",
      Array.isArray(logs)
        ? logs
        : []
    );


    socket.emit(
      "server stats",
      {

        onlineUsers:
          Array.isArray(users)
            ? users.length
            : 0,

        bannedUsers:
          Array.isArray(bannedUsers)
            ? bannedUsers.length
            : 0,

        admins:
          Array.isArray(admins)
            ? admins.length
            : 0

      }
    );


  } catch (error) {

    console.error(
      "❌ REFRESH ADMIN PANEL ERROR",
      error
    );

  }

});
    /* =========================================================
   PART 8
   GLOBAL USER MODERATION
   ========================================================= */


/* =========================================================
   VIEW USER INFORMATION
   ========================================================= */

socket.on("view user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {

      socket.emit(
        "admin error",
        "❌ يجب تسجيل الدخول كأدمن"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.viewUserInfo !== true &&
      admin.permissions?.viewIP !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية عرض معلومات المستخدم"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    const target =
      users.find(user =>
        String(user.name).toLowerCase() ===
        username.toLowerCase()
      );


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId || target.id
      );


    const handshake =
      targetSocket?.handshake || {};


    const headers =
      handshake.headers || {};


    const userAgent =
      headers["user-agent"] ||
      target.userAgent ||
      "غير معروف";


    const ip =
      target.ip ||
      handshake.address ||
      "غير معروف";


    let device =
      target.device ||
      "غير معروف";


    if (
      /iPhone/i.test(userAgent)
    ) {

      device = "iPhone";

    } else if (
      /iPad/i.test(userAgent)
    ) {

      device = "iPad";

    } else if (
      /Android/i.test(userAgent)
    ) {

      device = "Android";

    } else if (
      /Windows/i.test(userAgent)
    ) {

      device = "Windows";

    } else if (
      /Macintosh|Mac OS/i.test(userAgent)
    ) {

      device = "Mac";

    }


    socket.emit(
      "user info",
      {

        name:
          target.name,

        username:
          target.name,

        ip:
          ip,

        device:
          device,

        userAgent:
          userAgent,

        socketId:
          target.socketId ||
          target.id ||
          ""

      }
    );


  } catch (error) {

    console.error(
      "❌ VIEW USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل عرض معلومات المستخدم"
    );

  }

});


/* =========================================================
   KICK USER
   ========================================================= */

socket.on("kick user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.kick !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الطرد"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    const target =
      users.find(user =>
        String(user.name).toLowerCase() ===
        username.toLowerCase()
      );


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId || target.id
      );


    if (!targetSocket) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير متصل"
      );

      return;
    }


    targetSocket.emit(
      "kicked",
      {
        message:
          "👢 تم طردك من الدردشة"
      }
    );


    io.emit(
      "admin notification",
      `👢 تم طرد ${target.name}`
    );


    logs.push({

      action:
        "kick",

      admin:
        admin.name,

      target:
        target.name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `👢 تم طرد ${target.name}`
    );


    setTimeout(() => {

      try {

        targetSocket.disconnect(
          true
        );

      } catch (error) {

        console.error(
          "❌ KICK DISCONNECT ERROR",
          error
        );

      }

    }, 100);


  } catch (error) {

    console.error(
      "❌ KICK USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل طرد المستخدم"
    );

  }

});


/* =========================================================
   BAN USER
   ========================================================= */

socket.on("ban user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.ban !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الحظر"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    const target =
      users.find(user =>
        String(user.name).toLowerCase() ===
        username.toLowerCase()
      );


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const ip =
      target.ip ||
      "";


    const alreadyBanned =
      bannedUsers.some(item => {

        if (
          typeof item === "string"
        ) {

          return (
            item.toLowerCase() ===
            username.toLowerCase()
          );

        }


        return (
          String(item?.name || "").toLowerCase() ===
          username.toLowerCase() ||
          String(item?.username || "").toLowerCase() ===
          username.toLowerCase() ||
          (
            ip &&
            String(item?.ip || "") === ip
          )
        );

      });


    if (!alreadyBanned) {

      bannedUsers.push({

        name:
          target.name,

        username:
          target.name,

        ip:
          ip,

        time:
          new Date().toISOString(),

        admin:
          admin.name

      });

    }


    saveJSON(
      "banned.json",
      bannedUsers
    );


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId || target.id
      );


    if (targetSocket) {

      targetSocket.emit(
        "banned",
        {
          message:
            "🚫 تم حظرك من الدردشة"
        }
      );


      setTimeout(() => {

        try {

          targetSocket.disconnect(
            true
          );

        } catch (error) {

          console.error(
            "❌ BAN DISCONNECT ERROR",
            error
          );

        }

      }, 100);

    }


    logs.push({

      action:
        "ban",

      admin:
        admin.name,

      target:
        target.name,

      ip:
        ip,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🚫 تم حظر ${target.name}`
    );


    io.emit(
      "admin notification",
      `🚫 تم حظر ${target.name}`
    );


  } catch (error) {

    console.error(
      "❌ BAN USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل حظر المستخدم"
    );

  }

});


/* =========================================================
   UNBAN USER
   ========================================================= */

socket.on("unban user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.unban !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الحظر"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const ip =
      String(
        data?.ip ||
        ""
      ).trim();


    if (!username && !ip) {
      return;
    }


    bannedUsers =
      bannedUsers.filter(item => {

        if (
          typeof item === "string"
        ) {

          return (
            username &&
            item.toLowerCase() !==
            username.toLowerCase()
          );

        }


        const itemName =
          String(
            item?.name ||
            item?.username ||
            ""
          ).toLowerCase();


        const itemIP =
          String(
            item?.ip ||
            ""
          );


        if (
          username &&
          itemName ===
          username.toLowerCase()
        ) {

          return false;

        }


        if (
          ip &&
          itemIP === ip
        ) {

          return false;

        }


        return true;

      });


    saveJSON(
      "banned.json",
      bannedUsers
    );


    logs.push({

      action:
        "unban",

      admin:
        admin.name,

      target:
        username || ip,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      "🔓 تم فك الحظر بنجاح"
    );


    io.emit(
      "admin notification",
      `🔓 تم فك حظر ${username || ip}`
    );


  } catch (error) {

    console.error(
      "❌ UNBAN USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فك الحظر"
    );

  }

});


/* =========================================================
   MUTE USER
   ========================================================= */

socket.on("mute user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.mute !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الكتم"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    const target =
      users.find(user =>
        String(user.name).toLowerCase() ===
        username.toLowerCase()
      );


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const exists =
      mutedUsers.some(item => {

        if (
          typeof item === "string"
        ) {

          return (
            item.toLowerCase() ===
            username.toLowerCase()
          );

        }


        return (
          String(item?.name || "").toLowerCase() ===
          username.toLowerCase()
        );

      });


    if (!exists) {

      mutedUsers.push({

        name:
          target.name,

        time:
          new Date().toISOString(),

        admin:
          admin.name

      });

    }


    saveJSON(
      "muted.json",
      mutedUsers
    );


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId || target.id
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


    logs.push({

      action:
        "mute",

      admin:
        admin.name,

      target:
        target.name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🔇 تم كتم ${target.name}`
    );


    io.emit(
      "admin notification",
      `🔇 تم كتم ${target.name}`
    );


  } catch (error) {

    console.error(
      "❌ MUTE USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل كتم المستخدم"
    );

  }

});


/* =========================================================
   UNMUTE USER
   ========================================================= */

socket.on("unmute user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.unmute !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الكتم"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    mutedUsers =
      mutedUsers.filter(item => {

        if (
          typeof item === "string"
        ) {

          return (
            item.toLowerCase() !==
            username.toLowerCase()
          );

        }


        return (
          String(
            item?.name || ""
          ).toLowerCase() !==
          username.toLowerCase()
        );

      });


    saveJSON(
      "muted.json",
      mutedUsers
    );


    logs.push({

      action:
        "unmute",

      admin:
        admin.name,

      target:
        username,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🔊 تم فك كتم ${username}`
    );


    io.emit(
      "admin notification",
      `🔊 تم فك كتم ${username}`
    );


  } catch (error) {

    console.error(
      "❌ UNMUTE USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فك الكتم"
    );

  }

});


/* =========================================================
   DISCONNECT USER
   ========================================================= */

socket.on("disconnect user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      admin.permissions?.disconnect !== true
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فصل المستخدم"
      );

      return;
    }


    const username =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    if (!username) {
      return;
    }


    const target =
      users.find(user =>
        String(user.name).toLowerCase() ===
        username.toLowerCase()
      );


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId || target.id
      );


    if (!targetSocket) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير متصل"
      );

      return;
    }


    targetSocket.emit(
      "disconnected by admin",
      {
        message:
          "⛔ تم فصلك من الخادم"
      }
    );


    logs.push({

      action:
        "disconnect",

      admin:
        admin.name,

      target:
        target.name,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `⛔ تم فصل ${target.name}`
    );


    setTimeout(() => {

      try {

        targetSocket.disconnect(
          true
        );

      } catch (error) {

        console.error(
          "❌ DISCONNECT USER ERROR",
          error
        );

      }

    }, 100);


  } catch (error) {

    console.error(
      "❌ DISCONNECT USER ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل فصل المستخدم"
    );

  }

});
    /* =========================================================
   PART 9
   ROOM ADMIN MANAGEMENT
   ========================================================= */


/* =========================================================
   GET ROOMS
   ========================================================= */

socket.on("get rooms", () => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }

    socket.emit(
      "admin rooms",
      getPublicRooms()
    );

  } catch (error) {

    console.error(
      "❌ GET ROOMS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ تعذر تحميل الغرف"
    );

  }

});


/* =========================================================
   ASSIGN ADMIN TO ROOM
   ========================================================= */

socket.on("assign room admin", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (!isMasterAdmin(socket)) {

      socket.emit(
        "admin error",
        "❌ هذه العملية متاحة للأدمن الرئيسي فقط"
      );

      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const adminName =
      String(
        data?.adminName ||
        data?.name ||
        ""
      ).trim();


    if (!roomId || !adminName) {

      socket.emit(
        "admin error",
        "❌ بيانات الغرفة أو الأدمن ناقصة"
      );

      return;
    }


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    const targetAdmin =
      admins.find(
        a =>
          String(a.name).toLowerCase() ===
          adminName.toLowerCase()
      );


    if (!targetAdmin) {

      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );

      return;
    }


    if (!Array.isArray(
      targetAdmin.rooms
    )) {

      targetAdmin.rooms = [];

    }


    if (
      !targetAdmin.rooms.includes(
        roomId
      )
    ) {

      targetAdmin.rooms.push(
        roomId
      );

    }


    saveJSON(
      "admins.json",
      admins
    );


    logs.push({

      action:
        "assign_room_admin",

      admin:
        admin.name,

      target:
        targetAdmin.name,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `✅ تم تعيين ${targetAdmin.name} لإدارة ${room.name}`
    );


    socket.emit(
      "admin users",
      admins.map(a => ({
        name:
          a.name,

        role:
          a.role || "admin",

        permissions:
          a.permissions || {},

        rooms:
          a.rooms || []

      }))
    );


  } catch (error) {

    console.error(
      "❌ ASSIGN ROOM ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تعيين الأدمن للغرفة"
    );

  }

});


/* =========================================================
   REMOVE ADMIN FROM ROOM
   ========================================================= */

socket.on("remove room admin", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (!isMasterAdmin(socket)) {

      socket.emit(
        "admin error",
        "❌ هذه العملية متاحة للأدمن الرئيسي فقط"
      );

      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const adminName =
      String(
        data?.adminName ||
        data?.name ||
        ""
      ).trim();


    if (!roomId || !adminName) {
      return;
    }


    const targetAdmin =
      admins.find(
        a =>
          String(a.name).toLowerCase() ===
          adminName.toLowerCase()
      );


    if (!targetAdmin) {

      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );

      return;
    }


    targetAdmin.rooms =
      (targetAdmin.rooms || [])
        .filter(
          id => id !== roomId
        );


    saveJSON(
      "admins.json",
      admins
    );


    logs.push({

      action:
        "remove_room_admin",

      admin:
        admin.name,

      target:
        targetAdmin.name,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      "✅ تم إزالة صلاحية الأدمن من الغرفة"
    );


    socket.emit(
      "admin users",
      admins.map(a => ({
        name:
          a.name,

        role:
          a.role || "admin",

        permissions:
          a.permissions || {},

        rooms:
          a.rooms || []

      }))
    );


  } catch (error) {

    console.error(
      "❌ REMOVE ROOM ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل إزالة الأدمن من الغرفة"
    );

  }

});


/* =========================================================
   GET ADMIN ROOM ASSIGNMENTS
   ========================================================= */

socket.on("get room admins", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (!isMasterAdmin(socket)) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية عرض تعيينات الغرف"
      );

      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    if (!roomId) {
      return;
    }


    const assignedAdmins =
      admins
        .filter(a =>
          Array.isArray(a.rooms) &&
          a.rooms.includes(roomId)
        )
        .map(a => ({
          name:
            a.name,

          role:
            a.role || "admin",

          permissions:
            a.permissions || {}

        }));


    socket.emit(
      "room admins",
      {
        roomId:
          roomId,

        admins:
          assignedAdmins
      }
    );


  } catch (error) {

    console.error(
      "❌ GET ROOM ADMINS ERROR",
      error
    );

  }

});


/* =========================================================
   UPDATE ADMIN ROOM PERMISSIONS
   ========================================================= */

socket.on("update room admin permissions", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    if (!isMasterAdmin(socket)) {

      socket.emit(
        "admin error",
        "❌ هذه العملية متاحة للأدمن الرئيسي فقط"
      );

      return;
    }


    const adminName =
      String(
        data?.adminName ||
        ""
      ).trim();


    const roomId =
      String(
        data?.roomId ||
        ""
      ).trim();


    const permissions =
      data?.permissions || {};


    if (!adminName || !roomId) {
      return;
    }


    const targetAdmin =
      admins.find(
        a =>
          String(a.name).toLowerCase() ===
          adminName.toLowerCase()
      );


    if (!targetAdmin) {

      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );

      return;
    }


    if (!targetAdmin.roomPermissions) {

      targetAdmin.roomPermissions = {};

    }


    targetAdmin.roomPermissions[roomId] = {

      kick:
        permissions.kick === true,

      ban:
        permissions.ban === true,

      unban:
        permissions.unban === true,

      mute:
        permissions.mute === true,

      unmute:
        permissions.unmute === true,

      disconnect:
        permissions.disconnect === true,

      clear:
        permissions.clear === true,

      deleteMessage:
        permissions.deleteMessage === true,

      chatLock:
        permissions.chatLock === true,

      maintenance:
        permissions.maintenance === true,

      stars:
        permissions.stars === true,

      protection:
        permissions.protection === true

    };


    saveJSON(
      "admins.json",
      admins
    );


    logs.push({

      action:
        "update_room_admin_permissions",

      admin:
        admin.name,

      target:
        targetAdmin.name,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      "✅ تم تحديث صلاحيات الأدمن في الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ UPDATE ROOM ADMIN PERMISSIONS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحديث صلاحيات الأدمن"
    );

  }

});
    /* =========================================================
   PART 10
   ROOM SETTINGS
   ========================================================= */


/* =========================================================
   UPDATE ROOM SETTINGS
   ========================================================= */

socket.on("update room settings", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    if (!roomId) {

      socket.emit(
        "admin error",
        "❌ لم يتم تحديد الغرفة"
      );

      return;
    }


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    /* =====================================================
       CHECK ROOM PERMISSION
       ===================================================== */

    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "roomSettings"
      ) &&
      !hasRoomPermission(
        socket,
        roomId,
        "maintenance"
      ) &&
      !hasRoomPermission(
        socket,
        roomId,
        "chatLock"
      ) &&
      !hasRoomPermission(
        socket,
        roomId,
        "stars"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية تعديل إعدادات هذه الغرفة"
      );

      return;
    }


    /* =====================================================
       MAKE SURE SETTINGS EXIST
       ===================================================== */

    if (!room.settings) {

      room.settings = {

        enabled: true,

        chatLock: false,

        privateLock: false,

        maintenance: false,

        stars: false,

        protection: false

      };

    }


    /* =====================================================
       UPDATE ONLY PROVIDED VALUES
       ===================================================== */

    if (
      typeof data.enabled === "boolean"
    ) {

      room.settings.enabled =
        data.enabled;

    }


    if (
      typeof data.chatLock === "boolean"
    ) {

      room.settings.chatLock =
        data.chatLock;

    }


    if (
      typeof data.privateLock === "boolean"
    ) {

      room.settings.privateLock =
        data.privateLock;

    }


    if (
      typeof data.maintenance === "boolean"
    ) {

      room.settings.maintenance =
        data.maintenance;

    }


    if (
      typeof data.stars === "boolean"
    ) {

      room.settings.stars =
        data.stars;

    }


    if (
      typeof data.protection === "boolean"
    ) {

      room.settings.protection =
        data.protection;

    }


    /* =====================================================
       SAVE
       ===================================================== */

    saveJSON(
      "rooms.json",
      rooms
    );


    /* =====================================================
       LOG
       ===================================================== */

    logs.push({

      action:
        "update_room_settings",

      admin:
        admin.name,

      roomId:
        roomId,

      settings:
        room.settings,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    /* =====================================================
       SEND UPDATED ROOM
       ===================================================== */

    socket.emit(
      "room settings updated",
      {
        roomId:
          room.id,

        settings:
          room.settings
      }
    );


    io.emit(
      "room settings changed",
      {
        roomId:
          room.id,

        settings:
          room.settings
      }
    );


    socket.emit(
      "admin success",
      "✅ تم تحديث إعدادات الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ UPDATE ROOM SETTINGS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحديث إعدادات الغرفة"
    );

  }

});


/* =========================================================
   TOGGLE ROOM ENABLED
   ========================================================= */

socket.on("toggle room", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "roomSettings"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية تشغيل أو إيقاف هذه الغرفة"
      );

      return;
    }


    if (!room.settings) {

      room.settings = {};

    }


    room.settings.enabled =
      room.settings.enabled === false;


    saveJSON(
      "rooms.json",
      rooms
    );


    logs.push({

      action:
        "toggle_room",

      admin:
        admin.name,

      roomId:
        roomId,

      enabled:
        room.settings.enabled,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    io.emit(
      "room status changed",
      {
        roomId:
          room.id,

        enabled:
          room.settings.enabled
      }
    );


    socket.emit(
      "admin success",
      room.settings.enabled
        ? "✅ تم تشغيل الغرفة"
        : "⛔ تم إيقاف الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ TOGGLE ROOM ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير حالة الغرفة"
    );

  }

});


/* =========================================================
   TOGGLE ROOM CHAT LOCK
   ========================================================= */

socket.on("toggle room chat lock", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "chatLock"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية قفل دردشة هذه الغرفة"
      );

      return;
    }


    if (!room.settings) {

      room.settings = {};

    }


    room.settings.chatLock =
      room.settings.chatLock !== true;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(room.id).emit(
      "room chat lock changed",
      {
        roomId:
          room.id,

        locked:
          room.settings.chatLock
      }
    );


    socket.emit(
      "admin success",
      room.settings.chatLock
        ? "🔒 تم قفل الدردشة في الغرفة"
        : "🔓 تم فتح الدردشة في الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ ROOM CHAT LOCK ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير قفل الدردشة"
    );

  }

});


/* =========================================================
   TOGGLE ROOM MAINTENANCE
   ========================================================= */

socket.on("toggle room maintenance", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "maintenance"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الصيانة لهذه الغرفة"
      );

      return;
    }


    if (!room.settings) {

      room.settings = {};

    }


    room.settings.maintenance =
      room.settings.maintenance !== true;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(room.id).emit(
      "room maintenance changed",
      {
        roomId:
          room.id,

        maintenance:
          room.settings.maintenance
      }
    );


    socket.emit(
      "admin success",
      room.settings.maintenance
        ? "🛠️ تم تفعيل وضع الصيانة"
        : "✅ تم إيقاف وضع الصيانة"
    );


  } catch (error) {

    console.error(
      "❌ ROOM MAINTENANCE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير وضع الصيانة"
    );

  }

});


/* =========================================================
   TOGGLE ROOM STARS
   ========================================================= */

socket.on("toggle room stars", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "stars"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية النجوم لهذه الغرفة"
      );

      return;
    }


    if (!room.settings) {

      room.settings = {};

    }


    room.settings.stars =
      room.settings.stars !== true;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(room.id).emit(
      "room stars changed",
      {
        roomId:
          room.id,

        enabled:
          room.settings.stars
      }
    );


    socket.emit(
      "admin success",
      room.settings.stars
        ? "⭐ تم تفعيل النجوم في الغرفة"
        : "⭐ تم إيقاف النجوم في الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ ROOM STARS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير نظام النجوم"
    );

  }

});


/* =========================================================
   TOGGLE ROOM PROTECTION
   ========================================================= */

socket.on("toggle room protection", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const room =
      rooms.find(
        r => r.id === roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "protection"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية حماية هذه الغرفة"
      );

      return;
    }


    if (!room.settings) {

      room.settings = {};

    }


    room.settings.protection =
      room.settings.protection !== true;


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(room.id).emit(
      "room protection changed",
      {
        roomId:
          room.id,

        enabled:
          room.settings.protection
      }
    );


    socket.emit(
      "admin success",
      room.settings.protection
        ? "🛡️ تم تفعيل حماية الغرفة"
        : "🔓 تم إيقاف حماية الغرفة"
    );


  } catch (error) {

    console.error(
      "❌ ROOM PROTECTION ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تغيير حماية الغرفة"
    );

  }

});
    /* =========================================================
   PART 11
   ROOM MODERATION
   ========================================================= */


/* =========================================================
   ROOM MODERATION STORAGE
   ========================================================= */

function ensureRoomModeration(room) {

  if (!room.moderation) {

    room.moderation = {

      banned: [],
      muted: [],
      disconnected: []

    };

  }


  if (!Array.isArray(room.moderation.banned)) {
    room.moderation.banned = [];
  }

  if (!Array.isArray(room.moderation.muted)) {
    room.moderation.muted = [];
  }

  if (!Array.isArray(room.moderation.disconnected)) {
    room.moderation.disconnected = [];
  }


  return room.moderation;

}


/* =========================================================
   FIND ROOM
   ========================================================= */

function findRoomById(roomId) {

  return rooms.find(
    room =>
      String(room.id) ===
      String(roomId)
  );

}


/* =========================================================
   FIND USER
   ========================================================= */

function findOnlineUser(name) {

  if (!name) {
    return null;
  }


  const searchName =
    String(name)
      .trim()
      .toLowerCase();


  return users.find(
    user =>
      String(
        user.name ||
        user.username ||
        ""
      )
      .trim()
      .toLowerCase() ===
      searchName
  ) || null;

}


/* =========================================================
   ADD ROOM BAN
   ========================================================= */

socket.on("room ban user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "ban"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الحظر في هذه الغرفة"
      );

      return;
    }


    const target =
      findOnlineUser(targetName);


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    const normalizedName =
      String(
        target.name ||
        target.username
      ).trim();


    const alreadyBanned =
      moderation.banned.some(
        item =>
          String(
            item.name || item
          ).toLowerCase() ===
          normalizedName.toLowerCase()
      );


    if (!alreadyBanned) {

      moderation.banned.push({

        name:
          normalizedName,

        time:
          new Date().toISOString(),

        by:
          admin.name

      });

    }


    saveJSON(
      "rooms.json",
      rooms
    );


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );


    if (targetSocket) {

      targetSocket.emit(
        "room banned",
        {
          roomId:
            roomId,

          message:
            "🚫 تم حظرك من الغرفة"
        }
      );


      targetSocket.leave(
        roomId
      );

    }


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "ban",

        name:
          normalizedName,

        message:
          `🚫 تم حظر ${normalizedName} من الغرفة`
      }
    );


    logs.push({

      action:
        "room_ban",

      admin:
        admin.name,

      target:
        normalizedName,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🚫 تم حظر ${normalizedName} من الغرفة`
    );


  } catch (error) {

    console.error(
      "❌ ROOM BAN ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل حظر المستخدم"
    );

  }

});


/* =========================================================
   REMOVE ROOM BAN
   ========================================================= */

socket.on("room unban user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "unban"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الحظر"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    const before =
      moderation.banned.length;


    moderation.banned =
      moderation.banned.filter(
        item =>
          String(
            item.name || item
          ).toLowerCase() !==
          targetName.toLowerCase()
      );


    if (
      moderation.banned.length ===
      before
    ) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في قائمة الحظر"
      );

      return;
    }


    saveJSON(
      "rooms.json",
      rooms
    );


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "unban",

        name:
          targetName,

        message:
          `🔓 تم فك حظر ${targetName}`
      }
    );


    logs.push({

      action:
        "room_unban",

      admin:
        admin.name,

      target:
        targetName,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🔓 تم فك حظر ${targetName}`
    );


  } catch (error) {

    console.error(
      "❌ ROOM UNBAN ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل فك الحظر"
    );

  }

});


/* =========================================================
   MUTE USER IN ROOM
   ========================================================= */

socket.on("room mute user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "mute"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الكتم في هذه الغرفة"
      );

      return;
    }


    const target =
      findOnlineUser(targetName);


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    const normalizedName =
      String(
        target.name ||
        target.username
      ).trim();


    const exists =
      moderation.muted.some(
        item =>
          String(
            item.name || item
          ).toLowerCase() ===
          normalizedName.toLowerCase()
      );


    if (!exists) {

      moderation.muted.push({

        name:
          normalizedName,

        time:
          new Date().toISOString(),

        by:
          admin.name

      });

    }


    saveJSON(
      "rooms.json",
      rooms
    );


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );


    if (targetSocket) {

      targetSocket.emit(
        "room muted",
        {
          roomId:
            roomId,

          muted:
            true
        }
      );

    }


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "mute",

        name:
          normalizedName,

        message:
          `🔇 تم كتم ${normalizedName}`
      }
    );


    logs.push({

      action:
        "room_mute",

      admin:
        admin.name,

      target:
        normalizedName,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🔇 تم كتم ${normalizedName}`
    );


  } catch (error) {

    console.error(
      "❌ ROOM MUTE ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل كتم المستخدم"
    );

  }

});


/* =========================================================
   UNMUTE USER IN ROOM
   ========================================================= */

socket.on("room unmute user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "unmute"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فك الكتم"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    const before =
      moderation.muted.length;


    moderation.muted =
      moderation.muted.filter(
        item =>
          String(
            item.name || item
          ).toLowerCase() !==
          targetName.toLowerCase()
      );


    if (
      moderation.muted.length ===
      before
    ) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود في قائمة الكتم"
      );

      return;
    }


    saveJSON(
      "rooms.json",
      rooms
    );


    const target =
      findOnlineUser(targetName);


    if (target) {

      const targetSocket =
        io.sockets.sockets.get(
          target.socketId
        );


      if (targetSocket) {

        targetSocket.emit(
          "room muted",
          {
            roomId:
              roomId,

            muted:
              false
          }
        );

      }

    }


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "unmute",

        name:
          targetName,

        message:
          `🔊 تم فك كتم ${targetName}`
      }
    );


    logs.push({

      action:
        "room_unmute",

      admin:
        admin.name,

      target:
        targetName,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `🔊 تم فك كتم ${targetName}`
    );


  } catch (error) {

    console.error(
      "❌ ROOM UNMUTE ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل فك الكتم"
    );

  }

});


/* =========================================================
   KICK USER FROM ROOM
   ========================================================= */

socket.on("room kick user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "kick"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية الطرد في هذه الغرفة"
      );

      return;
    }


    const target =
      findOnlineUser(targetName);


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
        "room kicked",
        {
          roomId:
            roomId,

          message:
            "👢 تم طردك من الغرفة"
        }
      );


      targetSocket.leave(
        roomId
      );

    }


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "kick",

        name:
          target.name,

        message:
          `👢 تم طرد ${target.name} من الغرفة`
      }
    );


    logs.push({

      action:
        "room_kick",

      admin:
        admin.name,

      target:
        target.name,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `👢 تم طرد ${target.name} من الغرفة`
    );


  } catch (error) {

    console.error(
      "❌ ROOM KICK ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل طرد المستخدم"
    );

  }

});


/* =========================================================
   DISCONNECT USER FROM ROOM
   ========================================================= */

socket.on("room disconnect user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "disconnect"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية فصل المستخدم"
      );

      return;
    }


    const target =
      findOnlineUser(targetName);


    if (!target) {

      socket.emit(
        "admin error",
        "❌ المستخدم غير موجود"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    const normalizedName =
      String(
        target.name ||
        target.username
      ).trim();


    const exists =
      moderation.disconnected.some(
        item =>
          String(
            item.name || item
          ).toLowerCase() ===
          normalizedName.toLowerCase()
      );


    if (!exists) {

      moderation.disconnected.push({

        name:
          normalizedName,

        time:
          new Date().toISOString(),

        by:
          admin.name

      });

    }


    saveJSON(
      "rooms.json",
      rooms
    );


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );


    if (targetSocket) {

      targetSocket.emit(
        "room disconnected",
        {
          roomId:
            roomId,

          message:
            "⛔ تم فصلك من الغرفة"
        }
      );


      targetSocket.leave(
        roomId
      );

    }


    io.to(roomId).emit(
      "room moderation notice",
      {
        type:
          "disconnect",

        name:
          normalizedName,

        message:
          `⛔ تم فصل ${normalizedName} من الغرفة`
      }
    );


    logs.push({

      action:
        "room_disconnect",

      admin:
        admin.name,

      target:
        normalizedName,

      roomId:
        roomId,

      time:
        new Date().toISOString()

    });


    saveJSON(
      "logs.json",
      logs
    );


    socket.emit(
      "admin success",
      `⛔ تم فصل ${normalizedName} من الغرفة`
    );


  } catch (error) {

    console.error(
      "❌ ROOM DISCONNECT ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل فصل المستخدم"
    );

  }

});


/* =========================================================
   CLEAR ROOM DISCONNECTED STATUS
   ========================================================= */

socket.on("room reconnect user", (data) => {

  try {

    const admin = getAdmin(socket);

    if (!admin) {
      return;
    }


    const roomId =
      String(
        data?.roomId || ""
      ).trim();


    const targetName =
      String(
        data?.name ||
        data?.username ||
        ""
      ).trim();


    const room =
      findRoomById(roomId);


    if (!room) {
      return;
    }


    if (
      !isMasterAdmin(socket) &&
      !hasRoomPermission(
        socket,
        roomId,
        "disconnect"
      )
    ) {

      socket.emit(
        "admin error",
        "❌ ليس لديك صلاحية إعادة المستخدم"
      );

      return;
    }


    const moderation =
      ensureRoomModeration(room);


    moderation.disconnected =
      moderation.disconnected.filter(
        item =>
          String(
            item.name || item
          ).toLowerCase() !==
          targetName.toLowerCase()
      );


    saveJSON(
      "rooms.json",
      rooms
    );


    socket.emit(
      "admin success",
      `🔓 تم السماح مجددًا لـ ${targetName} بدخول الغرفة`
    );


  } catch (error) {

    console.error(
      "❌ ROOM RECONNECT ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل إعادة السماح للمستخدم"
    );

  }

});
    /* =========================================================
   PART 12
   ROOM ADMIN LIST + ROOM ADMIN PERMISSIONS
   ========================================================= */

socket.on("get room admins", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit("admin error", "❌ يجب تسجيل دخول الأدمن");
      return;
    }

    const roomId = String(data.roomId || "").trim();

    if (!roomId) {
      socket.emit("admin error", "❌ لم يتم تحديد الغرفة");
      return;
    }

    const room = rooms.find(r => String(r.id) === roomId);

    if (!room) {
      socket.emit("admin error", "❌ الغرفة غير موجودة");
      return;
    }

    const roomAdmins = admins.map(admin => {

      const assignment =
        room.admins?.find(a =>
          String(a.name).toLowerCase() ===
          String(admin.name).toLowerCase()
        );

      return {
        name: admin.name,
        role: assignment?.role || "user",
        assigned: !!assignment,
        permissions: assignment?.permissions || {}
      };

    });

    socket.emit("room admins", {
      roomId,
      admins: roomAdmins
    });

  } catch (error) {

    console.error(
      "❌ GET ROOM ADMINS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحميل أدمن الغرفة"
    );

  }
});


/* =========================================================
   ASSIGN ADMIN TO ROOM
   ========================================================= */

socket.on("assign room admin", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit("admin error", "❌ يجب تسجيل دخول الأدمن");
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const adminName = String(data.adminName || "").trim();

    if (!roomId || !adminName) {
      socket.emit(
        "admin error",
        "❌ بيانات الأدمن أو الغرفة ناقصة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    const admin = admins.find(
      a =>
        String(a.name).toLowerCase() ===
        adminName.toLowerCase()
    );

    if (!admin) {
      socket.emit(
        "admin error",
        "❌ الأدمن غير موجود"
      );
      return;
    }

    if (!room.admins) {
      room.admins = [];
    }

    const alreadyAssigned = room.admins.find(
      a =>
        String(a.name).toLowerCase() ===
        adminName.toLowerCase()
    );

    if (!alreadyAssigned) {

      room.admins.push({
        name: admin.name,
        role: data.role === "master"
          ? "master"
          : "moderator",

        permissions:
          data.permissions || {
            kick: true,
            ban: true,
            mute: true,
            disconnect: true,
            deleteMessage: true,
            stars: true
          }
      });

    } else {

      alreadyAssigned.role =
        data.role === "master"
          ? "master"
          : "moderator";

      alreadyAssigned.permissions =
        data.permissions ||
        alreadyAssigned.permissions ||
        {};
    }

    saveJSON("rooms.json", rooms);

    socket.emit(
      "room admin assigned",
      {
        roomId,
        adminName: admin.name
      }
    );

    socket.emit(
      "admin success",
      "✅ تم تعيين الأدمن في الغرفة"
    );

    io.emit(
      "rooms updated",
      getPublicRooms()
    );

  } catch (error) {

    console.error(
      "❌ ASSIGN ROOM ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تعيين الأدمن في الغرفة"
    );

  }
});


/* =========================================================
   REMOVE ADMIN FROM ROOM
   ========================================================= */

socket.on("remove room admin", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const adminName = String(data.adminName || "").trim();

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    if (!room.admins) {
      room.admins = [];
    }

    room.admins = room.admins.filter(
      a =>
        String(a.name).toLowerCase() !==
        adminName.toLowerCase()
    );

    saveJSON("rooms.json", rooms);

    socket.emit(
      "room admin removed",
      {
        roomId,
        adminName
      }
    );

    socket.emit(
      "admin success",
      "✅ تم إزالة الأدمن من الغرفة"
    );

  } catch (error) {

    console.error(
      "❌ REMOVE ROOM ADMIN ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل إزالة الأدمن من الغرفة"
    );

  }
});


/* =========================================================
   UPDATE ROOM ADMIN PERMISSIONS
   ========================================================= */

socket.on("update room admin permissions", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const adminName = String(data.adminName || "").trim();

    if (!roomId || !adminName) {
      socket.emit(
        "admin error",
        "❌ بيانات الغرفة أو الأدمن ناقصة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    if (!room.admins) {
      room.admins = [];
    }

    const roomAdmin = room.admins.find(
      a =>
        String(a.name).toLowerCase() ===
        adminName.toLowerCase()
    );

    if (!roomAdmin) {
      socket.emit(
        "admin error",
        "❌ هذا الأدمن غير معين في الغرفة"
      );
      return;
    }

    roomAdmin.permissions =
      data.permissions || {};

    if (data.role) {
      roomAdmin.role =
        data.role === "master"
          ? "master"
          : "moderator";
    }

    saveJSON("rooms.json", rooms);

    socket.emit(
      "room admin permissions updated",
      {
        roomId,
        adminName,
        permissions: roomAdmin.permissions,
        role: roomAdmin.role
      }
    );

    socket.emit(
      "admin success",
      "✅ تم تحديث صلاحيات الأدمن"
    );

  } catch (error) {

    console.error(
      "❌ UPDATE ROOM ADMIN PERMISSIONS ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحديث صلاحيات الأدمن"
    );

  }
});
    /* =========================================================
   PART 13
   ROOM ADMIN / USER STATUS
   ========================================================= */

socket.on("get room user info", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const username = String(data.username || "").trim();

    if (!roomId || !username) {
      socket.emit(
        "admin error",
        "❌ بيانات الغرفة أو المستخدم ناقصة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    const user = users.find(
      u =>
        String(u.name || u.username || "")
          .toLowerCase() === username.toLowerCase()
    );

    const roomModeration =
      roomModerationData[roomId] || {
        banned: [],
        muted: [],
        disconnected: []
      };

    const isBanned =
      roomModeration.banned.includes(username);

    const isMuted =
      roomModeration.muted.includes(username);

    const isDisconnected =
      roomModeration.disconnected.includes(username);

    socket.emit(
      "room user info",
      {
        roomId,
        username,
        online: !!user,
        banned: isBanned,
        muted: isMuted,
        disconnected: isDisconnected,
        ip: user?.ip || "",
        device: user?.device || "",
        userAgent: user?.userAgent || ""
      }
    );

  } catch (error) {

    console.error(
      "❌ ROOM USER INFO ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل الحصول على معلومات المستخدم"
    );

  }
});


/* =========================================================
   ROOM MODERATION STATUS
   ========================================================= */

socket.on("get room moderation", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();

    if (!roomId) {
      socket.emit(
        "admin error",
        "❌ لم يتم تحديد الغرفة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    if (!roomModerationData[roomId]) {
      roomModerationData[roomId] = {
        banned: [],
        muted: [],
        disconnected: []
      };

      saveJSON(
        "roomModeration.json",
        roomModerationData
      );
    }

    socket.emit(
      "room moderation",
      {
        roomId,
        ...roomModerationData[roomId]
      }
    );

  } catch (error) {

    console.error(
      "❌ GET ROOM MODERATION ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحميل إدارة الحظر والكتم"
    );

  }
});


/* =========================================================
   ROOM ADMIN SUCCESS MESSAGE
   ========================================================= */

socket.on("room admin test", () => {

  if (!adminSession) {
    socket.emit(
      "admin error",
      "❌ يجب تسجيل دخول الأدمن"
    );
    return;
  }

  socket.emit(
    "admin success",
    "✅ اتصال إدارة الغرفة يعمل بشكل صحيح"
  );

});


/* =========================================================
   REFRESH ROOM DATA
   ========================================================= */

socket.on("refresh room data", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();

    if (!roomId) {
      socket.emit(
        "admin error",
        "❌ لم يتم تحديد الغرفة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    socket.emit(
      "room data refreshed",
      {
        room,
        users: getRoomUsers(roomId),
        moderation:
          roomModerationData[roomId] || {
            banned: [],
            muted: [],
            disconnected: []
          }
      }
    );

  } catch (error) {

    console.error(
      "❌ REFRESH ROOM DATA ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحديث بيانات الغرفة"
    );

  }
});
    /* =========================================================
   PART 14
   ROOM MESSAGE MANAGEMENT
   ========================================================= */

socket.on("get room messages", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();

    if (!roomId) {
      socket.emit(
        "admin error",
        "❌ لم يتم تحديد الغرفة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    if (!roomMessages[roomId]) {
      roomMessages[roomId] = [];
    }

    socket.emit(
      "room messages",
      {
        roomId,
        messages: roomMessages[roomId]
      }
    );

  } catch (error) {

    console.error(
      "❌ GET ROOM MESSAGES ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل تحميل رسائل الغرفة"
    );

  }
});


/* =========================================================
   DELETE ROOM MESSAGE
   ========================================================= */

socket.on("delete room message", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const messageId = String(data.messageId || "").trim();

    if (!roomId || !messageId) {
      socket.emit(
        "admin error",
        "❌ بيانات الرسالة ناقصة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    if (!roomMessages[roomId]) {
      roomMessages[roomId] = [];
    }

    const oldLength = roomMessages[roomId].length;

    roomMessages[roomId] =
      roomMessages[roomId].filter(
        message =>
          String(
            message.id ||
            message.messageId ||
            ""
          ) !== messageId
      );

    if (
      roomMessages[roomId].length === oldLength
    ) {
      socket.emit(
        "admin error",
        "❌ الرسالة غير موجودة"
      );
      return;
    }

    saveJSON(
      "roomMessages.json",
      roomMessages
    );

    io.to(roomId).emit(
      "room message deleted",
      {
        roomId,
        messageId
      }
    );

    socket.emit(
      "admin success",
      "🗑️ تم حذف الرسالة"
    );

  } catch (error) {

    console.error(
      "❌ DELETE ROOM MESSAGE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل حذف الرسالة"
    );

  }
});


/* =========================================================
   CLEAR ALL ROOM MESSAGES
   ========================================================= */

socket.on("clear room messages", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();

    if (!roomId) {
      socket.emit(
        "admin error",
        "❌ لم يتم تحديد الغرفة"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    roomMessages[roomId] = [];

    saveJSON(
      "roomMessages.json",
      roomMessages
    );

    io.to(roomId).emit(
      "room messages cleared",
      {
        roomId
      }
    );

    socket.emit(
      "admin success",
      "🧹 تم مسح جميع رسائل الغرفة"
    );

  } catch (error) {

    console.error(
      "❌ CLEAR ROOM MESSAGES ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل مسح رسائل الغرفة"
    );

  }
});


/* =========================================================
   SEND ADMIN ROOM NOTICE
   ========================================================= */

socket.on("send room notice", async (data = {}) => {
  try {

    if (!adminSession) {
      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );
      return;
    }

    const roomId = String(data.roomId || "").trim();
    const text = String(data.text || "").trim();

    if (!roomId || !text) {
      socket.emit(
        "admin error",
        "❌ اكتب نص التنبيه"
      );
      return;
    }

    const room = rooms.find(
      r => String(r.id) === roomId
    );

    if (!room) {
      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );
      return;
    }

    const notice = {
      id:
        "notice_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      roomId,

      type: "admin",

      username: adminSession.name || "Admin",

      message: text,

      timestamp: Date.now()
    };

    io.to(roomId).emit(
      "room notice",
      notice
    );

    socket.emit(
      "admin success",
      "📢 تم إرسال التنبيه إلى الغرفة"
    );

  } catch (error) {

    console.error(
      "❌ SEND ROOM NOTICE ERROR",
      error
    );

    socket.emit(
      "admin error",
      "❌ فشل إرسال تنبيه الغرفة"
    );

  }
});
    /* =========================================================
   PART 15
   ROOM SYSTEM NOTICES + CLEANUP
   ========================================================= */


/* =========================================================
   ROOM NOTICE HELPER
   ========================================================= */

function sendRoomNotice(roomId, message, type = "system") {

  try {

    if (!roomId || !message) {
      return;
    }

    io.to(roomId).emit(
      "room notice",
      {
        id:
          "system_" +
          Date.now() +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 8),

        roomId:
          roomId,

        type:
          type,

        username:
          "Mersal",

        message:
          message,

        timestamp:
          Date.now()
      }
    );

  } catch (error) {

    console.error(
      "❌ ROOM NOTICE ERROR",
      error
    );

  }

}


/* =========================================================
   ROOM MODERATION NOTICE HELPER
   ========================================================= */

function sendRoomModerationNotice(
  roomId,
  type,
  username
) {

  let message = "";

  if (type === "ban") {

    message =
      `🚫 تم حظر ${username} من الغرفة`;

  } else if (type === "unban") {

    message =
      `🔓 تم فك حظر ${username}`;

  } else if (type === "kick") {

    message =
      `👢 تم طرد ${username} من الغرفة`;

  } else if (type === "mute") {

    message =
      `🔇 تم كتم ${username}`;

  } else if (type === "unmute") {

    message =
      `🔊 تم فك كتم ${username}`;

  } else if (type === "disconnect") {

    message =
      `⛔ تم فصل ${username} من الغرفة`;

  } else {

    message =
      username
        ? `${username}`
        : "تحديث إداري";

  }


  sendRoomNotice(
    roomId,
    message,
    "moderation"
  );

}


/* =========================================================
   ROOM JOIN NOTICE
   ========================================================= */

function sendRoomJoinNotice(
  roomId,
  username
) {

  if (!roomId || !username) {
    return;
  }


  sendRoomNotice(
    roomId,
    `👋 انضم ${username} إلى الغرفة`,
    "join"
  );

}


/* =========================================================
   ROOM LEAVE NOTICE
   ========================================================= */

function sendRoomLeaveNotice(
  roomId,
  username
) {

  if (!roomId || !username) {
    return;
  }


  sendRoomNotice(
    roomId,
    `👋 غادر ${username} الغرفة`,
    "leave"
  );

}


/* =========================================================
   ROOM ADMIN NOTICE
   ========================================================= */

function sendRoomAdminNotice(
  roomId,
  username
) {

  if (!roomId || !username) {
    return;
  }


  io.to(roomId).emit(
    "room admin notice",
    {
      roomId:
        roomId,

      username:
        username,

      message:
        `✨ تم توكيل ${username}`,

      timestamp:
        Date.now()
    }
  );

}


/* =========================================================
   ROOM CLEANUP
   ========================================================= */

function cleanupRoomData(roomId) {

  try {

    if (!roomId) {
      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          String(roomId)
      );


    if (!room) {
      return;
    }


    if (
      roomMessages &&
      !roomMessages[roomId]
    ) {

      roomMessages[roomId] = [];

    }


    if (
      roomModerationData &&
      !roomModerationData[roomId]
    ) {

      roomModerationData[roomId] = {

        banned: [],
        muted: [],
        disconnected: []

      };

    }


    if (!room.admins) {
      room.admins = [];
    }


    if (!room.settings) {

      room.settings = {

        enabled:
          true,

        chatLock:
          false,

        privateLock:
          false,

        maintenance:
          false,

        stars:
          false,

        protection:
          false

      };

    }


  } catch (error) {

    console.error(
      "❌ ROOM CLEANUP ERROR",
      error
    );

  }

}


/* =========================================================
   CLEANUP ALL ROOMS
   ========================================================= */

function cleanupAllRooms() {

  try {

    rooms.forEach(
      room => {

        cleanupRoomData(
          room.id
        );

      }
    );


    saveJSON(
      "rooms.json",
      rooms
    );


    saveJSON(
      "roomMessages.json",
      roomMessages
    );


    saveJSON(
      "roomModeration.json",
      roomModerationData
    );


  } catch (error) {

    console.error(
      "❌ CLEANUP ALL ROOMS ERROR",
      error
    );

  }

}


/* =========================================================
   INITIAL ROOM CLEANUP
   ========================================================= */

cleanupAllRooms();


/* =========================================================
   ADMIN ROOM NOTICE
   ========================================================= */

socket.on("room admin notice", (data = {}) => {

  try {

    if (!adminSession) {

      socket.emit(
        "admin error",
        "❌ يجب تسجيل دخول الأدمن"
      );

      return;
    }


    const roomId =
      String(
        data.roomId || ""
      ).trim();


    const message =
      String(
        data.message || ""
      ).trim();


    if (!roomId || !message) {

      socket.emit(
        "admin error",
        "❌ بيانات التنبيه ناقصة"
      );

      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {

      socket.emit(
        "admin error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    sendRoomNotice(
      roomId,
      message,
      "admin"
    );


    socket.emit(
      "admin success",
      "📢 تم إرسال التنبيه"
    );


  } catch (error) {

    console.error(
      "❌ ADMIN ROOM NOTICE ERROR",
      error
    );


    socket.emit(
      "admin error",
      "❌ فشل إرسال التنبيه"
    );

  }

});
    /* =========================================================
   PART 16
   ROOM JOIN / LEAVE + ROOM ACCESS CONTROL
   ========================================================= */


/* =========================================================
   CHECK ROOM BAN
   ========================================================= */

function isUserBannedFromRoom(roomId, username) {

  try {

    const moderation =
      roomModerationData?.[roomId];

    if (!moderation) {
      return false;
    }

    const list =
      Array.isArray(moderation.banned)
        ? moderation.banned
        : [];

    return list.some(item => {

      const name =
        typeof item === "string"
          ? item
          : item?.name;

      return String(name || "")
        .toLowerCase() ===
        String(username || "")
          .toLowerCase();

    });

  } catch (error) {

    console.error(
      "❌ ROOM BAN CHECK ERROR",
      error
    );

    return false;

  }

}


/* =========================================================
   CHECK ROOM MUTE
   ========================================================= */

function isUserMutedInRoom(roomId, username) {

  try {

    const moderation =
      roomModerationData?.[roomId];

    if (!moderation) {
      return false;
    }

    const list =
      Array.isArray(moderation.muted)
        ? moderation.muted
        : [];

    return list.some(item => {

      const name =
        typeof item === "string"
          ? item
          : item?.name;

      return String(name || "")
        .toLowerCase() ===
        String(username || "")
          .toLowerCase();

    });

  } catch (error) {

    console.error(
      "❌ ROOM MUTE CHECK ERROR",
      error
    );

    return false;

  }

}


/* =========================================================
   CHECK ROOM DISCONNECT
   ========================================================= */

function isUserDisconnectedFromRoom(
  roomId,
  username
) {

  try {

    const moderation =
      roomModerationData?.[roomId];

    if (!moderation) {
      return false;
    }

    const list =
      Array.isArray(moderation.disconnected)
        ? moderation.disconnected
        : [];

    return list.some(item => {

      const name =
        typeof item === "string"
          ? item
          : item?.name;

      return String(name || "")
        .toLowerCase() ===
        String(username || "")
          .toLowerCase();

    });

  } catch (error) {

    console.error(
      "❌ ROOM DISCONNECT CHECK ERROR",
      error
    );

    return false;

  }

}


/* =========================================================
   JOIN ROOM
   ========================================================= */

socket.on("join room", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();

    if (!roomId) {

      socket.emit(
        "room error",
        "❌ لم يتم تحديد الغرفة"
      );

      return;

    }


    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {

      socket.emit(
        "room error",
        "❌ يجب تسجيل الدخول أولًا"
      );

      return;

    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;

    }


    cleanupRoomData(roomId);


    /* =====================================================
       ROOM ENABLED
       ===================================================== */

    if (
      room.settings &&
      room.settings.enabled === false
    ) {

      socket.emit(
        "room error",
        "⛔ هذه الغرفة متوقفة حاليًا"
      );

      return;

    }


    /* =====================================================
       MAINTENANCE
       ===================================================== */

    if (
      room.settings &&
      room.settings.maintenance === true
    ) {

      socket.emit(
        "room error",
        "🛠️ الغرفة في وضع الصيانة حاليًا"
      );

      return;

    }


    /* =====================================================
       ROOM BAN
       ===================================================== */

    if (
      isUserBannedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "🚫 أنت محظور من هذه الغرفة"
      );

      return;

    }


    /* =====================================================
       ROOM DISCONNECT
       ===================================================== */

    if (
      isUserDisconnectedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "⛔ تم منعك من دخول هذه الغرفة"
      );

      return;

    }


    /* =====================================================
       LEAVE PREVIOUS ROOM
       ===================================================== */

    if (user.roomId) {

      const oldRoomId =
        String(
          user.roomId
        );

      if (
        oldRoomId !==
        roomId
      ) {

        socket.leave(
          oldRoomId
        );

        sendRoomLeaveNotice(
          oldRoomId,
          user.name
        );

      }

    }


    /* =====================================================
       JOIN SOCKET.IO ROOM
       ===================================================== */

    socket.join(
      roomId
    );


    user.roomId =
      roomId;


    user.currentRoom =
      roomId;


    /* =====================================================
       SAVE
       ===================================================== */

    saveUsers();


    /* =====================================================
       SEND ROOM DATA
       ===================================================== */

    socket.emit(
      "room joined",
      {
        room,
        roomId,
        username:
          user.name,

        muted:
          isUserMutedInRoom(
            roomId,
            user.name
          ),

        settings:
          room.settings || {}
      }
    );


    /* =====================================================
       SEND ROOM USERS
       ===================================================== */

    socket.emit(
      "room users",
      getRoomUsers(roomId)
    );


    io.to(roomId).emit(
      "room users",
      getRoomUsers(roomId)
    );


    /* =====================================================
       SEND ROOM HISTORY
       ===================================================== */

    socket.emit(
      "room history",
      {
        roomId,

        messages:
          roomMessages?.[roomId] || []
      }
    );


    /* =====================================================
       JOIN NOTICE
       ===================================================== */

    sendRoomJoinNotice(
      roomId,
      user.name
    );


    console.log(
      `🏠 ${user.name} joined room ${roomId}`
    );


  } catch (error) {

    console.error(
      "❌ JOIN ROOM ERROR",
      error
    );

    socket.emit(
      "room error",
      "❌ فشل دخول الغرفة"
    );

  }

});


/* =========================================================
   LEAVE ROOM
   ========================================================= */

socket.on("leave room", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {
      return;
    }


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    if (!roomId) {
      return;
    }


    socket.leave(
      roomId
    );


    user.roomId =
      null;


    user.currentRoom =
      null;


    saveUsers();


    io.to(roomId).emit(
      "room users",
      getRoomUsers(roomId)
    );


    sendRoomLeaveNotice(
      roomId,
      user.name
    );


    socket.emit(
      "room left",
      {
        roomId
      }
    );


    console.log(
      `🚪 ${user.name} left room ${roomId}`
    );


  } catch (error) {

    console.error(
      "❌ LEAVE ROOM ERROR",
      error
    );

  }

});


/* =========================================================
   GET ROOM USERS
   ========================================================= */

socket.on("get room users", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();


    if (!roomId) {
      return;
    }


    socket.emit(
      "room users",
      getRoomUsers(roomId)
    );


  } catch (error) {

    console.error(
      "❌ GET ROOM USERS ERROR",
      error
    );

  }

});


/* =========================================================
   ROOM ACCESS CHECK
   ========================================================= */

socket.on("check room access", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();


    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "login"
        }
      );

      return;

    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "not_found"
        }
      );

      return;

    }


    if (
      room.settings?.enabled === false
    ) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "disabled"
        }
      );

      return;

    }


    if (
      room.settings?.maintenance === true
    ) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "maintenance"
        }
      );

      return;

    }


    if (
      isUserBannedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "banned"
        }
      );

      return;

    }


    if (
      isUserDisconnectedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room access",
        {
          roomId,
          allowed:
            false,

          reason:
            "disconnected"
        }
      );

      return;

    }


    socket.emit(
      "room access",
      {
        roomId,
        allowed:
          true,

        reason:
          "ok"
      }
    );


  } catch (error) {

    console.error(
      "❌ ROOM ACCESS ERROR",
      error
    );

  }

});
    /* =========================================================
   PART 17
   ROOM PUBLIC MESSAGES
   ========================================================= */


/* =========================================================
   SEND ROOM MESSAGE
   ========================================================= */

socket.on("room message", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {

      socket.emit(
        "room error",
        "❌ يجب تسجيل الدخول أولًا"
      );

      return;

    }


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    const message =
      String(
        data.message ||
        data.text ||
        ""
      ).trim();


    if (!roomId) {

      socket.emit(
        "room error",
        "❌ لم يتم تحديد الغرفة"
      );

      return;

    }


    if (!message) {
      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;

    }


    /* =====================================================
       USER MUST BE IN ROOM
       ===================================================== */

    if (
      String(
        user.roomId || ""
      ) !== roomId
    ) {

      socket.emit(
        "room error",
        "❌ يجب دخول الغرفة أولًا"
      );

      return;

    }


    /* =====================================================
       ROOM ENABLED
       ===================================================== */

    if (
      room.settings?.enabled === false
    ) {

      socket.emit(
        "room error",
        "⛔ هذه الغرفة متوقفة"
      );

      return;

    }


    /* =====================================================
       MAINTENANCE
       ===================================================== */

    if (
      room.settings?.maintenance === true
    ) {

      socket.emit(
        "room error",
        "🛠️ الغرفة في وضع الصيانة"
      );

      return;

    }


    /* =====================================================
       CHAT LOCK
       ===================================================== */

    if (
      room.settings?.chatLock === true
    ) {

      socket.emit(
        "room error",
        "🔒 الدردشة مقفلة حاليًا"
      );

      return;

    }


    /* =====================================================
       ROOM BAN
       ===================================================== */

    if (
      isUserBannedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "🚫 أنت محظور من هذه الغرفة"
      );

      return;

    }


    /* =====================================================
       ROOM DISCONNECT
       ===================================================== */

    if (
      isUserDisconnectedFromRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "⛔ لا يمكنك الكتابة في هذه الغرفة"
      );

      return;

    }


    /* =====================================================
       ROOM MUTE
       ===================================================== */

    if (
      isUserMutedInRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "🔇 أنت مكتوم في هذه الغرفة"
      );

      return;

    }


    /* =====================================================
       CREATE MESSAGE
       ===================================================== */

    const roomMessage = {

      id:
        "msg_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      roomId:
        roomId,

      username:
        user.name,

      name:
        user.name,

      message:
        message,

      text:
        message,

      timestamp:
        Date.now(),

      time:
        new Date().toISOString(),

      type:
        "room"

    };


    /* =====================================================
       ROOM STORAGE
       ===================================================== */

    if (
      !roomMessages[roomId]
    ) {

      roomMessages[roomId] = [];

    }


    roomMessages[roomId].push(
      roomMessage
    );


    /* =====================================================
       LIMIT HISTORY
       ===================================================== */

    if (
      roomMessages[roomId].length >
      500
    ) {

      roomMessages[roomId] =
        roomMessages[roomId].slice(
          -500
        );

    }


    /* =====================================================
       SAVE
       ===================================================== */

    saveJSON(
      "roomMessages.json",
      roomMessages
    );


    /* =====================================================
       SEND TO ROOM
       ===================================================== */

    io.to(roomId).emit(
      "room message",
      roomMessage
    );


    /* =====================================================
       COMPATIBILITY EVENT
       ===================================================== */

    io.to(roomId).emit(
      "chat message",
      roomMessage
    );


    console.log(
      `💬 [${room.name}] ${user.name}: ${message}`
    );


  } catch (error) {

    console.error(
      "❌ ROOM MESSAGE ERROR",
      error
    );


    socket.emit(
      "room error",
      "❌ فشل إرسال الرسالة"
    );

  }

});


/* =========================================================
   GET ROOM HISTORY
   ========================================================= */

socket.on("get room history", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();


    if (!roomId) {
      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;

    }


    socket.emit(
      "room history",
      {
        roomId,

        messages:
          roomMessages?.[roomId] || []
      }
    );


  } catch (error) {

    console.error(
      "❌ ROOM HISTORY ERROR",
      error
    );

  }

});


/* =========================================================
   ROOM TYPING
   ========================================================= */

socket.on("room typing", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {
      return;
    }


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    if (!roomId) {
      return;
    }


    socket.to(roomId).emit(
      "room typing",
      {
        roomId,

        username:
          user.name,

        typing:
          data.typing === true
      }
    );


  } catch (error) {

    console.error(
      "❌ ROOM TYPING ERROR",
      error
    );

  }

});


/* =========================================================
   ROOM REPLY
   ========================================================= */

socket.on("room reply", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {
      return;
    }


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    const message =
      String(
        data.message ||
        ""
      ).trim();


    const replyTo =
      data.replyTo || null;


    if (!roomId || !message) {
      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) ===
          roomId
      );


    if (!room) {
      return;
    }


    if (
      room.settings?.chatLock === true
    ) {

      socket.emit(
        "room error",
        "🔒 الدردشة مقفلة حاليًا"
      );

      return;

    }


    if (
      isUserMutedInRoom(
        roomId,
        user.name
      )
    ) {

      socket.emit(
        "room error",
        "🔇 أنت مكتوم في هذه الغرفة"
      );

      return;

    }


    const replyMessage = {

      id:
        "msg_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      roomId,

      username:
        user.name,

      name:
        user.name,

      message,

      text:
        message,

      replyTo,

      timestamp:
        Date.now(),

      time:
        new Date().toISOString(),

      type:
        "room"

    };


    if (
      !roomMessages[roomId]
    ) {

      roomMessages[roomId] = [];

    }


    roomMessages[roomId].push(
      replyMessage
    );


    if (
      roomMessages[roomId].length >
      500
    ) {

      roomMessages[roomId] =
        roomMessages[roomId].slice(
          -500
        );

    }


    saveJSON(
      "roomMessages.json",
      roomMessages
    );


    io.to(roomId).emit(
      "room message",
      replyMessage
    );


    io.to(roomId).emit(
      "chat message",
      replyMessage
    );


  } catch (error) {

    console.error(
      "❌ ROOM REPLY ERROR",
      error
    );


    socket.emit(
      "room error",
      "❌ فشل إرسال الرد"
    );

  }

});
    /* =========================================================
   PART 18
   ROOM STARS / STAR MODE
   ========================================================= */


/* =========================================================
   GET ROOM STAR STATUS
   ========================================================= */

socket.on("get room stars", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();

    if (!roomId) return;


    const room =
      rooms.find(
        r => String(r.id) === roomId
      );

    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    if (!roomStars[roomId]) {
      roomStars[roomId] = [];
    }


    socket.emit(
      "room stars",
      {
        roomId,
        enabled:
          room.settings?.stars === true,
        stars:
          roomStars[roomId]
      }
    );


  } catch (error) {

    console.error(
      "❌ GET ROOM STARS ERROR",
      error
    );

  }

});


/* =========================================================
   GIVE STAR
   ========================================================= */

socket.on("give room star", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) {

      socket.emit(
        "room error",
        "❌ يجب تسجيل الدخول أولًا"
      );

      return;
    }


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    const targetName =
      String(
        data.username ||
        data.name ||
        ""
      ).trim();


    if (!roomId || !targetName) {

      socket.emit(
        "room error",
        "❌ بيانات النجمة غير مكتملة"
      );

      return;
    }


    const room =
      rooms.find(
        r =>
          String(r.id) === roomId
      );


    if (!room) {

      socket.emit(
        "room error",
        "❌ الغرفة غير موجودة"
      );

      return;
    }


    /* =====================================================
       STAR MODE
       ===================================================== */

    if (
      room.settings?.stars !== true
    ) {

      socket.emit(
        "room error",
        "⭐ النجوم غير مفعلة في هذه الغرفة"
      );

      return;
    }


    /* =====================================================
       USER MUST BE IN SAME ROOM
       ===================================================== */

    if (
      String(
        user.roomId || ""
      ) !== roomId
    ) {

      socket.emit(
        "room error",
        "❌ يجب أن تكون داخل الغرفة"
      );

      return;
    }


    /* =====================================================
       TARGET USER
       ===================================================== */

    const target =
      users.find(
        u =>
          String(
            u.name || ""
          ).toLowerCase() ===
          targetName.toLowerCase() &&
          String(
            u.roomId || ""
          ) === roomId
      );


    if (!target) {

      socket.emit(
        "room error",
        "❌ المستخدم غير موجود في هذه الغرفة"
      );

      return;
    }


    /* =====================================================
       CREATE ROOM STAR LIST
       ===================================================== */

    if (!roomStars[roomId]) {
      roomStars[roomId] = [];
    }


    /* =====================================================
       ADD STAR
       ===================================================== */

    const existing =
      roomStars[roomId].find(
        star =>
          String(
            star.from || ""
          ).toLowerCase() ===
          String(
            user.name || ""
          ).toLowerCase() &&
          String(
            star.to || ""
          ).toLowerCase() ===
          String(
            target.name || ""
          ).toLowerCase()
      );


    if (existing) {

      socket.emit(
        "room error",
        "⭐ لقد أعطيت هذا المستخدم نجمة بالفعل"
      );

      return;
    }


    const star = {

      id:
        "star_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      roomId,

      from:
        user.name,

      to:
        target.name,

      timestamp:
        Date.now(),

      time:
        new Date().toISOString()

    };


    roomStars[roomId].push(
      star
    );


    saveJSON(
      "roomStars.json",
      roomStars
    );


    /* =====================================================
       NOTIFY ROOM
       ===================================================== */

    io.to(roomId).emit(
      "room star given",
      star
    );


    /* =====================================================
       UPDATE STAR LIST
       ===================================================== */

    io.to(roomId).emit(
      "room stars",
      {
        roomId,

        enabled:
          room.settings?.stars === true,

        stars:
          roomStars[roomId]
      }
    );


    console.log(
      `⭐ ${user.name} gave ${target.name} a star in ${room.name}`
    );


  } catch (error) {

    console.error(
      "❌ GIVE ROOM STAR ERROR",
      error
    );


    socket.emit(
      "room error",
      "❌ فشل إعطاء النجمة"
    );

  }

});


/* =========================================================
   REMOVE STAR
   ========================================================= */

socket.on("remove room star", (data = {}) => {

  try {

    const user =
      users.find(
        u =>
          String(
            u.socketId || u.id
          ) ===
          String(socket.id)
      );


    if (!user) return;


    const roomId =
      String(
        data.roomId ||
        user.roomId ||
        ""
      ).trim();


    const targetName =
      String(
        data.username ||
        data.name ||
        ""
      ).trim();


    if (!roomId || !targetName) {
      return;
    }


    if (!roomStars[roomId]) {
      roomStars[roomId] = [];
    }


    const before =
      roomStars[roomId].length;


    roomStars[roomId] =
      roomStars[roomId].filter(
        star => {

          const sameFrom =
            String(
              star.from || ""
            ).toLowerCase() ===
            String(
              user.name || ""
            ).toLowerCase();

          const sameTarget =
            String(
              star.to || ""
            ).toLowerCase() ===
            targetName.toLowerCase();

          return !(
            sameFrom &&
            sameTarget
          );

        }
      );


    if (
      roomStars[roomId].length ===
      before
    ) {

      socket.emit(
        "room error",
        "❌ النجمة غير موجودة"
      );

      return;
    }


    saveJSON(
      "roomStars.json",
      roomStars
    );


    io.to(roomId).emit(
      "room star removed",
      {
        roomId,
        from:
          user.name,
        to:
          targetName
      }
    );


    io.to(roomId).emit(
      "room stars",
      {
        roomId,

        enabled:
          rooms.find(
            r =>
              String(r.id) === roomId
          )?.settings?.stars === true,

        stars:
          roomStars[roomId]
      }
    );


  } catch (error) {

    console.error(
      "❌ REMOVE ROOM STAR ERROR",
      error
    );

  }

});


/* =========================================================
   STAR COUNT
   ========================================================= */

socket.on("get room star count", (data = {}) => {

  try {

    const roomId =
      String(
        data.roomId || ""
      ).trim();


    if (!roomId) return;


    const username =
      String(
        data.username ||
        data.name ||
        ""
      ).trim();


    const list =
      roomStars[roomId] || [];


    const count =
      list.filter(
        star =>
          String(
            star.to || ""
          ).toLowerCase() ===
          username.toLowerCase()
      ).length;


    socket.emit(
      "room star count",
      {
        roomId,
        username,
        count
      }
    );


  } catch (error) {

    console.error(
      "❌ ROOM STAR COUNT ERROR",
      error
    );

  }

});


/* =========================================================
   ROOM STAR CLEANUP
   ========================================================= */

function cleanupRoomStars(roomId) {

  try {

    const id =
      String(
        roomId || ""
      ).trim();


    if (!id) return;


    if (!roomStars[id]) {
      roomStars[id] = [];
      return;
    }


    const roomExists =
      rooms.some(
        room =>
          String(room.id) === id
      );


    if (!roomExists) {

      delete roomStars[id];

      saveJSON(
        "roomStars.json",
        roomStars
      );

    }

  } catch (error) {

    console.error(
      "❌ ROOM STAR CLEANUP ERROR",
      error
    );

  }

}
    /* =========================================================
   PART 19
   ROOM ADMIN NOTICES + ROOM SYSTEM NOTIFICATIONS
   ========================================================= */


/* =========================================================
   ROOM NOTICE HELPER
   ========================================================= */

function sendRoomNotice(roomId, message, type = "system") {

  try {

    const id =
      String(roomId || "").trim();

    if (!id || !message) {
      return;
    }

    const notice = {

      roomId: id,

      message:
        String(message),

      type,

      timestamp:
        Date.now(),

      time:
        new Date().toISOString()

    };

    io.to(id).emit(
      "room notice",
      notice
    );

  } catch (error) {

    console.error(
      "❌ ROOM NOTICE ERROR",
      error
    );

  }

}


/* =========================================================
   ROOM JOIN NOTICE
   ========================================================= */

function sendRoomJoinNotice(roomId, username) {

  if (!username) return;

  sendRoomNotice(
    roomId,
    `👋 انضم ${username} إلى الغرفة`,
    "join"
  );

}


/* =========================================================
   ROOM LEAVE NOTICE
   ========================================================= */

function sendRoomLeaveNotice(roomId, username) {

  if (!username) return;

  sendRoomNotice(
    roomId,
    `🚪 غادر ${username} الغرفة`,
    "leave"
  );

}


/* =========================================================
   ROOM ADMIN NOTICE
   ========================================================= */

function sendRoomAdminNotice(
  roomId,
  adminName
) {

  if (!roomId || !adminName) {
    return;
  }

  sendRoomNotice(
    roomId,
    `✨ تم توكيل ${adminName}`,
    "admin"
  );

}


/* =========================================================
   ADMIN ENTER ROOM NOTICE
   ========================================================= */

socket.on(
  "room admin notice",
  (data = {}) => {

    try {

      const roomId =
        String(
          data.roomId || ""
        ).trim();


      if (!roomId) {
        return;
      }


      const admin =
        getAdmin(socket);


      if (!admin) {

        socket.emit(
          "admin error",
          "❌ غير مصرح"
        );

        return;
      }


      const adminName =
        admin.name ||
        admin.username ||
        "";


      if (!adminName) {
        return;
      }


      sendRoomAdminNotice(
        roomId,
        adminName
      );


    } catch (error) {

      console.error(
        "❌ ROOM ADMIN NOTICE ERROR",
        error
      );

    }

  }
);


/* =========================================================
   SYSTEM NOTICE
   ========================================================= */

socket.on(
  "send room notice",
  (data = {}) => {

    try {

      const roomId =
        String(
          data.roomId || ""
        ).trim();


      const message =
        String(
          data.message || ""
        ).trim();


      if (!roomId || !message) {
        return;
      }


      const admin =
        getAdmin(socket);


      if (!admin) {

        socket.emit(
          "admin error",
          "❌ غير مصرح"
        );

        return;
      }


      sendRoomNotice(
        roomId,
        message,
        "admin"
      );


    } catch (error) {

      console.error(
        "❌ SEND ROOM NOTICE ERROR",
        error
      );

    }

  }
);


/* =========================================================
   ROOM USER COUNT
   ========================================================= */

socket.on(
  "get room user count",
  (data = {}) => {

    try {

      const roomId =
        String(
          data.roomId || ""
        ).trim();


      if (!roomId) {
        return;
      }


      const roomUsers =
        typeof getRoomUsers === "function"
          ? getRoomUsers(roomId)
          : [];


      socket.emit(
        "room user count",
        {
          roomId,

          count:
            Array.isArray(roomUsers)
              ? roomUsers.length
              : 0
        }
      );


    } catch (error) {

      console.error(
        "❌ ROOM USER COUNT ERROR",
        error
      );

    }

  }
);


/* =========================================================
   BROADCAST ROOM USER LIST
   ========================================================= */

function broadcastRoomUsers(roomId) {

  try {

    const id =
      String(roomId || "").trim();


    if (!id) {
      return;
    }


    const roomUsers =
      typeof getRoomUsers === "function"
        ? getRoomUsers(id)
        : [];


    io.to(id).emit(
      "room users",
      roomUsers
    );


    io.to(id).emit(
      "room user count",
      {
        roomId: id,

        count:
          Array.isArray(roomUsers)
            ? roomUsers.length
            : 0
      }
    );


  } catch (error) {

    console.error(
      "❌ BROADCAST ROOM USERS ERROR",
      error
    );

  }

}


/* =========================================================
   ROOM STATE
   ========================================================= */

socket.on(
  "get room state",
  (data = {}) => {

    try {

      const roomId =
        String(
          data.roomId || ""
        ).trim();


      if (!roomId) {
        return;
      }


      const room =
        rooms.find(
          r =>
            String(r.id) === roomId
        );


      if (!room) {

        socket.emit(
          "room error",
          "❌ الغرفة غير موجودة"
        );

        return;
      }


      socket.emit(
        "room state",
        {

          roomId,

          room,

          settings:
            room.settings || {},

          starsEnabled:
            room.settings?.stars === true,

          users:
            typeof getRoomUsers === "function"
              ? getRoomUsers(roomId)
              : [],

          messages:
            roomMessages?.[roomId] || [],

          stars:
            roomStars?.[roomId] || []

        }
      );


    } catch (error) {

      console.error(
        "❌ ROOM STATE ERROR",
        error
      );

    }

  }
);


/* =========================================================
   CLEAN ROOM STAR DATA
   ========================================================= */

function cleanupDeletedRoomStars(roomId) {

  try {

    const id =
      String(roomId || "").trim();


    if (!id) {
      return;
    }


    const exists =
      rooms.some(
        room =>
          String(room.id) === id
      );


    if (exists) {
      return;
    }


    if (
      typeof roomStars !== "undefined" &&
      roomStars[id]
    ) {

      delete roomStars[id];

      saveJSON(
        "roomStars.json",
        roomStars
      );

    }


  } catch (error) {

    console.error(
      "❌ CLEAN ROOM STAR DATA ERROR",
      error
    );

  }

}
    /* =========================================================
   PART 20
   ROOM DATA INITIALIZATION + STAR PERSISTENCE
   ========================================================= */


/* =========================================================
   INITIALIZE ROOM STARS
   ========================================================= */

try {

  if (typeof roomStars === "undefined") {

    roomStars =
      loadJSON(
        "roomStars.json",
        {}
      );

  }

  if (
    !roomStars ||
    typeof roomStars !== "object" ||
    Array.isArray(roomStars)
  ) {

    roomStars = {};

  }

} catch (error) {

  console.error(
    "❌ ROOM STARS INIT ERROR",
    error
  );

  roomStars = {};

}


/* =========================================================
   SAVE ROOM STARS
   ========================================================= */

function saveRoomStars() {

  try {

    if (
      typeof roomStars === "undefined"
    ) {
      return;
    }

    saveJSON(
      "roomStars.json",
      roomStars
    );

  } catch (error) {

    console.error(
      "❌ SAVE ROOM STARS ERROR",
      error
    );

  }

}


/* =========================================================
   ENSURE ROOM STAR STORAGE
   ========================================================= */

function ensureRoomStarStorage(roomId) {

  try {

    const id =
      String(
        roomId || ""
      ).trim();


    if (!id) {
      return [];
    }


    if (
      !roomStars[id] ||
      !Array.isArray(
        roomStars[id]
      )
    ) {

      roomStars[id] = [];

    }


    return roomStars[id];

  } catch (error) {

    console.error(
      "❌ ENSURE ROOM STAR STORAGE ERROR",
      error
    );

    return [];

  }

}


/* =========================================================
   REMOVE DELETED ROOM DATA
   ========================================================= */

function removeDeletedRoomData(roomId) {

  try {

    const id =
      String(
        roomId || ""
      ).trim();


    if (!id) {
      return;
    }


    const roomExists =
      rooms.some(
        room =>
          String(room.id) === id
      );


    if (roomExists) {
      return;
    }


    if (
      typeof roomStars !== "undefined" &&
      roomStars[id]
    ) {

      delete roomStars[id];

    }


    if (
      typeof roomMessages !== "undefined" &&
      roomMessages[id]
    ) {

      delete roomMessages[id];

    }


    if (
      typeof roomModerationData !== "undefined" &&
      roomModerationData[id]
    ) {

      delete roomModerationData[id];

    }


    saveRoomStars();


    if (
      typeof roomMessages !== "undefined"
    ) {

      saveJSON(
        "roomMessages.json",
        roomMessages
      );

    }


    if (
      typeof roomModerationData !== "undefined"
    ) {

      saveJSON(
        "roomModeration.json",
        roomModerationData
      );

    }


  } catch (error) {

    console.error(
      "❌ REMOVE DELETED ROOM DATA ERROR",
      error
    );

  }

}


/* =========================================================
   CHECK ALL ROOM DATA
   ========================================================= */

function cleanupAllRoomData() {

  try {

    if (
      !Array.isArray(rooms)
    ) {
      return;
    }


    const validRoomIds =
      new Set(
        rooms.map(
          room =>
            String(room.id)
        )
      );


    if (
      typeof roomStars !== "undefined"
    ) {

      Object.keys(
        roomStars
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomStars[roomId];

          }

        }
      );

    }


    if (
      typeof roomMessages !== "undefined"
    ) {

      Object.keys(
        roomMessages
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomMessages[roomId];

          }

        }
      );

    }


    if (
      typeof roomModerationData !== "undefined"
    ) {

      Object.keys(
        roomModerationData
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomModerationData[
              roomId
            ];

          }

        }
      );

    }


    saveRoomStars();


    if (
      typeof roomMessages !== "undefined"
    ) {

      saveJSON(
        "roomMessages.json",
        roomMessages
      );

    }


    if (
      typeof roomModerationData !== "undefined"
    ) {

      saveJSON(
        "roomModeration.json",
        roomModerationData
      );

    }


  } catch (error) {

    console.error(
      "❌ CLEAN ALL ROOM DATA ERROR",
      error
    );

  }

}


/* =========================================================
   INITIAL CLEANUP
   ========================================================= */

try {

  cleanupAllRoomData();

} catch (error) {

  console.error(
    "❌ INITIAL ROOM CLEANUP ERROR",
    error
  );

}
    /* =========================================================
   PART 21
   ROOM SYSTEM MAINTENANCE
   ========================================================= */


/* =========================================================
   ROOM DATA MAINTENANCE
   ========================================================= */

function maintainRoomSystem() {

  try {

    if (
      !Array.isArray(rooms)
    ) {
      return;
    }


    /* =====================================================
       VALID ROOM IDS
       ===================================================== */

    const validRoomIds =
      new Set(
        rooms.map(
          room =>
            String(
              room.id
            )
        )
      );


    /* =====================================================
       CLEAN STAR DATA
       ===================================================== */

    if (
      typeof roomStars !== "undefined" &&
      roomStars
    ) {

      Object.keys(
        roomStars
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomStars[
              roomId
            ];

          }

        }
      );

    }


    /* =====================================================
       CLEAN MESSAGE DATA
       ===================================================== */

    if (
      typeof roomMessages !== "undefined" &&
      roomMessages
    ) {

      Object.keys(
        roomMessages
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomMessages[
              roomId
            ];

          }

        }
      );

    }


    /* =====================================================
       CLEAN MODERATION DATA
       ===================================================== */

    if (
      typeof roomModerationData !== "undefined" &&
      roomModerationData
    ) {

      Object.keys(
        roomModerationData
      ).forEach(
        roomId => {

          if (
            !validRoomIds.has(
              String(roomId)
            )
          ) {

            delete roomModerationData[
              roomId
            ];

          }

        }
      );

    }


    /* =====================================================
       SAVE ROOM DATA
       ===================================================== */

    if (
      typeof roomStars !== "undefined"
    ) {

      saveJSON(
        "roomStars.json",
        roomStars
      );

    }


    if (
      typeof roomMessages !== "undefined"
    ) {

      saveJSON(
        "roomMessages.json",
        roomMessages
      );

    }


    if (
      typeof roomModerationData !== "undefined"
    ) {

      saveJSON(
        "roomModeration.json",
        roomModerationData
      );

    }


  } catch (error) {

    console.error(
      "❌ ROOM MAINTENANCE ERROR",
      error
    );

  }

}


/* =========================================================
   AUTOMATIC ROOM MAINTENANCE
   ========================================================= */

const roomMaintenanceInterval =
  setInterval(
    () => {

      maintainRoomSystem();

    },
    5 * 60 * 1000
  );


/* =========================================================
   SERVER SHUTDOWN
   ========================================================= */

function saveRoomSystemBeforeShutdown() {

  try {

    maintainRoomSystem();


    if (
      typeof rooms !== "undefined"
    ) {

      saveJSON(
        "rooms.json",
        rooms
      );

    }


    console.log(
      "💾 Room data saved before shutdown"
    );


  } catch (error) {

    console.error(
      "❌ ROOM SHUTDOWN SAVE ERROR",
      error
    );

  }

}


process.on(
  "SIGINT",
  () => {

    saveRoomSystemBeforeShutdown();

    clearInterval(
      roomMaintenanceInterval
    );

    process.exit(
      0
    );

  }
);


process.on(
  "SIGTERM",
  () => {

    saveRoomSystemBeforeShutdown();

    clearInterval(
      roomMaintenanceInterval
    );

    process.exit(
      0
    );

  }
);


/* =========================================================
   ROOM SYSTEM READY
   ========================================================= */

console.log(
  "🏠 Mersal Chat room system loaded"
);

console.log(
  `🏠 Rooms: ${
    Array.isArray(rooms)
      ? rooms.length
      : 0
  }`
);

console.log(
  "⭐ Room stars system loaded"
);

console.log(
  "🛡️ Room moderation system loaded"
);
    
    
