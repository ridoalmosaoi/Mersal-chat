const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   FILE SYSTEM
   ========================================================= */

const FILE = name =>
  path.join(__dirname, name);


function loadJSON(name, fallback) {

  try {

    const file = FILE(name);

    if (!fs.existsSync(file)) {

      fs.writeFileSync(
        file,
        JSON.stringify(
          fallback,
          null,
          2
        )
      );

      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  } catch (error) {

    console.error(
      "LOAD ERROR:",
      name,
      error
    );

    return fallback;
  }
}


function saveJSON(name, value) {

  try {

    fs.writeFileSync(
      FILE(name),
      JSON.stringify(
        value,
        null,
        2
      )
    );

  } catch (error) {

    console.error(
      "SAVE ERROR:",
      name,
      error
    );

  }

}


/* =========================================================
   DATABASE
   ========================================================= */

let users = [];

let admins =
  loadJSON(
    "admins.json",
    []
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

let roomStars =
  loadJSON(
    "roomStars.json",
    {}
  );

let roomMessages =
  loadJSON(
    "roomMessages.json",
    {}
  );

let roomModeration =
  loadJSON(
    "roomModeration.json",
    {}
  );


/* =========================================================
   GLOBAL SETTINGS
   ========================================================= */

let chatLocked = false;

let privateLocked = false;

let maintenanceMode = false;

let starsMode = false;


/* =========================================================
   HELPERS
   ========================================================= */

function uid() {

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );

}


function str(value) {

  return String(
    value ?? ""
  ).trim();

}


/* =========================================================
   IP
   ========================================================= */

function getIP(socket) {

  const forwarded =
    socket.handshake.headers[
      "x-forwarded-for"
    ];

  if (forwarded) {

    return str(
      forwarded
        .split(",")[0]
    );

  }

  return str(
    socket.handshake.address ||
    "unknown"
  );

}


/* =========================================================
   DEVICE
   ========================================================= */

function getDevice(
  socket,
  data
) {

  return str(
    data?.deviceToken ||
    socket.handshake.headers[
      "user-agent"
    ] ||
    "unknown"
  );

}


/* =========================================================
   ROOM NORMALIZE
   ========================================================= */

function normalizeRoom(room) {

  const r =
    room || {};

  return {

    id:
      str(r.id) ||
      uid(),

    name:
      str(r.name) ||
      "غرفة جديدة",

    description:
      str(r.description),

    enabled:
      r.enabled !== false,

    settings: {

      enabled:
        r.settings?.enabled !== false,

      maintenance:
        r.settings?.maintenance === true,

      chatLock:
        r.settings?.chatLock === true,

      chatLocked:
        r.settings?.chatLocked === true,

      stars:
        r.settings?.stars === true,

      starsMode:
        r.settings?.starsMode === true,

      protection:
        r.settings?.protection !== false

    },

    createdAt:
      r.createdAt ||
      Date.now()

  };

}


rooms =
  Array.isArray(rooms)
    ? rooms.map(
        normalizeRoom
      )
    : [];


/* =========================================================
   ROOM
   ========================================================= */

function getRoom(roomId) {

  return rooms.find(
    room =>
      String(room.id) ===
      String(roomId)
  );

}


/* =========================================================
   USER
   ========================================================= */

function getUser(socket) {

  return users.find(
    user =>
      String(user.id) ===
      String(socket.id)
  );

}


/* =========================================================
   TARGET USER
   ========================================================= */

function getTarget(data) {

  const value =
    str(
      typeof data === "object"
        ? (
            data?.id ||
            data?.name ||
            data?.username
          )
        : data
    );

  if (!value) {
    return null;
  }

  return users.find(
    user =>

      String(user.id) ===
        value ||

      String(
        user.name
      ).toLowerCase() ===
        value.toLowerCase()

  ) || null;

}


/* =========================================================
   TARGET SOCKET
   ========================================================= */

function getTargetSocket(user) {

  if (!user) {
    return null;
  }

  return io.sockets.sockets.get(
    user.id
  );

}


/* =========================================================
   ADMIN
   ========================================================= */

function getAdmin(socket) {

  return socket.adminData || null;

}


/* =========================================================
   MASTER ADMIN
   ========================================================= */

function isMaster(admin) {

  if (!admin) {
    return false;
  }

  if (
    admin.role === "master"
  ) {
    return true;
  }

  if (
    admin.master === true
  ) {
    return true;
  }

  if (
    admin.isMaster === true
  ) {
    return true;
  }

  if (
    admin.permissions?.master === true
  ) {
    return true;
  }

  /*
   * القديم:
   * أول أدمن في admins.json
   * يعتبر Master
   */

  return (
    admins.length > 0 &&
    admins[0] === admin
  );

}


/* =========================================================
   PERMISSION
   ========================================================= */

function hasPermission(
  admin,
  permission,
  roomId
) {

  if (!admin) {
    return false;
  }

  if (
    isMaster(admin)
  ) {
    return true;
  }

  if (
    admin.permissions?.[
      permission
    ] === true
  ) {
    return true;
  }

  if (
    roomId &&
    admin.roomPermissions?.[
      roomId
    ]?.[
      permission
    ] === true
  ) {
    return true;
  }

  return false;
}


/* =========================================================
   ROOM ASSIGNMENT
   ========================================================= */

function assignedToRoom(
  admin,
  roomId
) {

  if (!admin) {
    return false;
  }

  if (
    isMaster(admin)
  ) {
    return true;
  }

  return (
    admin.assignedRooms || []
  )
    .map(String)
    .includes(
      String(roomId)
    );

}


/* =========================================================
   ROOM PERMISSION
   ========================================================= */

function canRoom(
  admin,
  roomId,
  permission
) {

  if (!admin) {
    return false;
  }

  if (!getRoom(roomId)) {
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

  if (!permission) {
    return true;
  }

  return hasPermission(
    admin,
    permission,
    roomId
  );

}


/* =========================================================
   GLOBAL PERMISSION
   ========================================================= */

function canGlobal(
  socket,
  permission
) {

  return hasPermission(
    getAdmin(socket),
    permission
  );

}


/* =========================================================
   USER OUTPUT
   ========================================================= */

function publicUser(user) {

  if (!user) {
    return null;
  }

  return {

    id:
      user.id,

    socketId:
      user.id,

    name:
      user.name,

    username:
      user.name,

    color:
      user.color,

    roomId:
      user.roomId ||
      null,

    currentRoom:
      user.roomId ||
      null,

    isAdmin:
      !!user.isAdmin,

    role:
      user.role ||
      "user"

  };

}


function publicUsers() {

  return users.map(
    publicUser
  );

}


/* =========================================================
   ROOM USERS
   ========================================================= */

function getRoomUsers(
  roomId
) {

  return users
    .filter(
      user =>
        user.rooms?.has(
          String(roomId)
        )
    )
    .map(
      publicUser
    );

}


/* =========================================================
   ROOM DATA
   ========================================================= */

function ensureRoomData(
  roomId
) {

  if (
    !roomStars[roomId]
  ) {

    roomStars[roomId] = [];

  }

  if (
    !roomMessages[roomId]
  ) {

    roomMessages[roomId] = [];

  }

  if (
    !roomModeration[roomId]
  ) {

    roomModeration[
      roomId
    ] = {

      banned: [],

      muted: []

    };

  }

  if (
    !Array.isArray(
      roomModeration[
        roomId
      ].banned
    )
  ) {

    roomModeration[
      roomId
    ].banned = [];

  }

  if (
    !Array.isArray(
      roomModeration[
        roomId
      ].muted
    )
  ) {

    roomModeration[
      roomId
    ].muted = [];

  }

}


for (
  const room of rooms
) {

  ensureRoomData(
    room.id
  );

}


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
  roomModeration
);


/* =========================================================
   ROOM MODERATION CHECK
   ========================================================= */

function roomModerated(
  roomId,
  type,
  user
) {

  if (!user) {
    return false;
  }

  ensureRoomData(
    roomId
  );

  return roomModeration[
    roomId
  ][type].some(
    item => {

      const name =
        typeof item === "string"
          ? item
          : item?.name;

      const sameName =
        str(name)
          .toLowerCase() ===
        str(user.name)
          .toLowerCase();

      const sameIP =
        item?.ip &&
        user.ip &&
        String(item.ip) ===
          String(user.ip);

      const sameDevice =
        item?.device &&
        user.device &&
        String(item.device) ===
          String(user.device);

      return (
        sameName ||
        sameIP ||
        sameDevice
      );

    }
  );

}


/* =========================================================
   ADD ROOM MODERATION
   ========================================================= */

function addRoomModeration(
  roomId,
  type,
  user,
  adminName
) {

  ensureRoomData(
    roomId
  );

  if (
    !roomModeration[
      roomId
    ][type].some(
      item =>
        str(
          typeof item === "string"
            ? item
            : item?.name
        ).toLowerCase() ===
        str(user.name)
          .toLowerCase()
    )
  ) {

    roomModeration[
      roomId
    ][type].push({

      name:
        user.name,

      ip:
        user.ip,

      device:
        user.device,

      by:
        adminName,

      time:
        Date.now()

    });

  }

  saveJSON(
    "roomModeration.json",
    roomModeration
  );

}


/* =========================================================
   REMOVE ROOM MODERATION
   ========================================================= */

function removeRoomModeration(
  roomId,
  type,
  name
) {

  ensureRoomData(
    roomId
  );

  roomModeration[
    roomId
  ][type] =
    roomModeration[
      roomId
    ][type].filter(
      item => {

        const itemName =
          typeof item === "string"
            ? item
            : item?.name;

        return (
          str(itemName)
            .toLowerCase() !==
          str(name)
            .toLowerCase()
        );

      }
    );

  saveJSON(
    "roomModeration.json",
    roomModeration
  );

}


/* =========================================================
   ROOM NOTICE
   ========================================================= */

function roomNotice(
  roomId,
  message,
  type = "system"
) {

  io
    .to(
      "public:" +
      roomId
    )
    .emit(
      "room notice",
      {

        roomId:
          String(roomId),

        message,

        type,

        timestamp:
          Date.now()

      }
    );

}


/* =========================================================
   LOG
   ========================================================= */

function addLog(
  message
) {

  const item = {

    id:
      uid(),

    time:
      new Date()
        .toISOString(),

    message:
      str(message)

  };

  logs.unshift(
    item
  );

  logs =
    logs.slice(
      0,
      500
    );

  saveJSON(
    "logs.json",
    logs
  );

  io.emit(
    "new log",
    item
  );

  console.log(
    message
  );

}


/* =========================================================
   ONLINE USERS
   ========================================================= */

function emitOnline() {

  io.emit(
    "online users",
    publicUsers()
  );

  io.emit(
    "admin online users",
    publicUsers()
  );

  for (
    const socket
    of io.sockets.sockets.values()
  ) {

    if (
      socket.adminData
    ) {

      emitStats(
        socket
      );

    }

  }

}


/* =========================================================
   STATS
   ========================================================= */

function emitStats(
  socket
) {

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


/* =========================================================
   ROOMS TO USER
   ========================================================= */

function emitRooms(
  socket
) {

  const available =
    rooms.filter(
      room =>
        room.enabled !== false &&
        room.settings.enabled !== false
    );

  socket.emit(
    "rooms",
    available
  );

  socket.emit(
    "rooms list",
    available
  );

  socket.emit(
    "room list",
    available
  );

}


/* =========================================================
   ROOMS TO ADMIN
   ========================================================= */

function emitAdminRooms(
  socket
) {

  const admin =
    getAdmin(socket);

  if (!admin) {
    return;
  }

  const list =
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
    list
  );

  socket.emit(
    "rooms updated",
    list
  );

}


/* =========================================================
   NAME SECURITY
   ========================================================= */

function safeUsername(
  name
) {

  if (!name) {
    return false;
  }

  if (
    name.length > 30
  ) {
    return false;
  }

  if (
    /[&@]/.test(name)
  ) {
    return false;
  }

  const reserved = [

    "admin",
    "administrator",
    "master",
    "owner",
    "moderator"

  ];

  if (
    reserved.includes(
      name.toLowerCase()
    )
  ) {

    return false;

  }

  return true;

}


/* =========================================================
   API
   ========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      users:
        users.length,

      rooms:
        rooms.length

    });

  }
);


/* =========================================================
   SOCKET
   ========================================================= */

io.on(
  "connection",
  socket => {

    socket.roomsOpen =
      new Set();


    /* =====================================================
       CHECK ADMIN
       ===================================================== */

    socket.on(
      "check admin",
      name => {

        const exists =
          admins.some(
            admin =>
              str(
                admin.name
              ).toLowerCase() ===
              str(
                name
              ).toLowerCase()
          );

        socket.emit(
          "admin check result",
          exists
        );

      }
    );


    /* =====================================================
       LOGIN
       ===================================================== */

    socket.on(
      "join",
      data => {

        const name =
          str(
            data?.username
          );

        if (
          !safeUsername(name)
        ) {

          socket.emit(
            "banned",
            "⚠️ اسم المستخدم غير صالح"
          );

          return;

        }


        if (
          users.some(
            user =>
              user.name
                .toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "banned",
            "⚠️ الاسم مستخدم"
          );

          return;

        }


        const ip =
          getIP(socket);

        const device =
          getDevice(
            socket,
            data
          );


        /* GLOBAL BAN */

        if (
          bannedUsers.some(
            item =>
              str(
                item?.ip ||
                item
              ).toLowerCase() ===
              ip.toLowerCase()
          )
        ) {

          socket.emit(
            "banned",
            "🚫 أنت محظور"
          );

          return;

        }


        /* DEVICE BAN */

        if (
          deviceBannedUsers.some(
            item =>
              str(
                item?.device ||
                item
              ).toLowerCase() ===
              device.toLowerCase()
          )
        ) {

          socket.emit(
            "banned",
            "⛔ الجهاز محظور"
          );

          return;

        }


        /* ADMIN */

        const admin =
          admins.find(
            item =>
              str(
                item.name
              ).toLowerCase() ===
              name.toLowerCase()
          );


        if (admin) {

          if (
            str(
              data?.adminPassword
            ) !==
            str(
              admin.password
            )
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


        /* USER */

        const user = {

          id:
            socket.id,

          name,

          username:
            name,

          color:
            data?.color ||
            "#ffd700",

          ip,

          device,

          isAdmin:
            !!admin,

          role:
            admin
              ? (
                  isMaster(admin)
                    ? "master"
                    : "moderator"
                )
              : "user",

          rooms:
            new Set(),

          roomId:
            null

        };


        users.push(
          user
        );

        socket.username =
          name;


        socket.emit(
          "login success",
          publicUser(user)
        );


        emitRooms(
          socket
        );

        emitOnline();

        addLog(
          `👤 ${name} دخل`
        );

      }
    );


    /* =====================================================
       GET ROOMS
       ===================================================== */

    socket.on(
      "get rooms",
      () => {

        emitRooms(
          socket
        );

      }
    );


    /* =====================================================
       JOIN ROOM
       ===================================================== */

    socket.on(
      "join room",
      data => {

        const user =
          getUser(socket);

        const roomId =
          str(
            typeof data === "string"
              ? data
              : data?.roomId
          );

        const currentRoom =
          getRoom(roomId);


        if (!user) {

          socket.emit(
            "room error",
            "❌ يجب تسجيل الدخول أولًا"
          );

          return;

        }


        if (!currentRoom) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;

        }


        if (
          user.rooms.size >= 3 &&
          !user.rooms.has(roomId)
        ) {

          socket.emit(
            "room error",
            "❌ يمكنك فتح 3 غرف كحد أقصى"
          );

          return;

        }


        ensureRoomData(
          roomId
        );


        if (
          currentRoom.enabled === false ||
          currentRoom.settings.enabled === false
        ) {

          socket.emit(
            "room error",
            "⛔ الغرفة متوقفة"
          );

          return;

        }


        if (
          currentRoom.settings.maintenance &&
          !user.isAdmin
        ) {

          socket.emit(
            "room error",
            "🛠️ الغرفة في وضع الصيانة"
          );

          return;

        }


        if (
          roomModerated(
            roomId,
            "banned",
            user
          )
        ) {

          socket.emit(
            "room error",
            "🚫 أنت محظور من هذه الغرفة"
          );

          return;

        }


        socket.join(
          "public:" +
          roomId
        );

        socket.roomsOpen.add(
          roomId
        );

        user.rooms.add(
          roomId
        );

        user.roomId =
          roomId;


        socket.emit(
          "room joined",
          {

            room:
              currentRoom,

            roomId,

            username:
              user.name,

            settings:
              currentRoom.settings,

            muted:
              roomModerated(
                roomId,
                "muted",
                user
              )

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
          "room users",
          getRoomUsers(
            roomId
          )
        );


        io
          .to(
            "public:" +
            roomId
          )
          .emit(
            "room users",
            getRoomUsers(
              roomId
            )
          );


        roomNotice(
          roomId,
          `👋 انضم ${user.name} إلى الغرفة`,
          "join"
        );


        emitOnline();

      }
    );


    /* =====================================================
       LEAVE ROOM
       ===================================================== */

    socket.on(
      "leave room",
      data => {

        const user =
          getUser(socket);

        if (!user) {
          return;
        }

        const roomId =
          str(
            typeof data === "string"
              ? data
              : (
                  data?.roomId ||
                  user.roomId
                )
          );

        if (!roomId) {
          return;
        }


        socket.leave(
          "public:" +
          roomId
        );

        socket.roomsOpen.delete(
          roomId
        );

        user.rooms.delete(
          roomId
        );


        if (
          String(
            user.roomId
          ) ===
          roomId
        ) {

          user.roomId =
            [
              ...user.rooms
            ][0] || null;

        }


        io
          .to(
            "public:" +
            roomId
          )
          .emit(
            "room users",
            getRoomUsers(
              roomId
            )
          );


        roomNotice(
          roomId,
          `🚪 غادر ${user.name} الغرفة`,
          "leave"
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


    /* =====================================================
       ROOM USERS
       ===================================================== */

    socket.on(
      "get room users",
      data => {

        socket.emit(
          "room users",
          getRoomUsers(
            str(
              data?.roomId
            )
          )
        );

      }
    );


    /* =====================================================
       ROOM ACCESS
       ===================================================== */

    socket.on(
      "check room access",
      data => {

        const user =
          getUser(socket);

        const roomId =
          str(
            data?.roomId
          );

        const currentRoom =
          getRoom(roomId);

        let allowed =
          !!user &&
          !!currentRoom;

        let reason =
          allowed
            ? "ok"
            : (
                !user
                  ? "login"
                  : "not_found"
              );


        if (
          allowed &&
          (
            currentRoom.enabled === false ||
            currentRoom.settings.enabled === false
          )
        ) {

          allowed = false;
          reason = "disabled";

        }


        if (
          allowed &&
          currentRoom.settings.maintenance &&
          !user.isAdmin
        ) {

          allowed = false;
          reason = "maintenance";

        }


        if (
          allowed &&
          roomModerated(
            roomId,
            "banned",
            user
          )
        ) {

          allowed = false;
          reason = "banned";

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


    /* =====================================================
       ROOM MESSAGE
       ===================================================== */

    function sendRoomMessage(
      data,
      eventName
    ) {

      const user =
        getUser(socket);

      if (!user) {
        return;
      }


      const roomId =
        str(
          data?.roomId ||
          user.roomId
        );

      const currentRoom =
        getRoom(roomId);


      const text =
        str(
          data?.message ||
          data?.text
        );


      if (
        !currentRoom ||
        !text ||
        !user.rooms.has(roomId)
      ) {

        return;

      }


      if (
        !user.isAdmin &&
        maintenanceMode
      ) {

        return;

      }


      if (
        currentRoom.settings.chatLock ||
        currentRoom.settings.chatLocked
      ) {

        socket.emit(
          "banned",
          "🔒 الدردشة مقفلة"
        );

        return;

      }


      if (
        roomModerated(
          roomId,
          "banned",
          user
        )
      ) {

        socket.emit(
          "banned",
          "🚫 أنت محظور من هذه الغرفة"
        );

        return;

      }


      if (
        roomModerated(
          roomId,
          "muted",
          user
        )
      ) {

        socket.emit(
          "banned",
          "🔇 أنت مكتوم في هذه الغرفة"
        );

        return;

      }


      if (
        (
          currentRoom.settings.stars ||
          currentRoom.settings.starsMode
        ) &&
        !user.isAdmin
      ) {

        const hasStar =
          roomStars[
            roomId
          ].some(
            star =>
              str(
                star.to
              ).toLowerCase() ===
              user.name.toLowerCase()
          );

        if (!hasStar) {

          socket.emit(
            "banned",
            "⭐ الكتابة لأصحاب النجمة فقط"
          );

          return;

        }

      }


      const message = {

        id:
          uid(),

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
          Date.now()

      };


      roomMessages[
        roomId
      ].push(
        message
      );


      roomMessages[
        roomId
      ] =
        roomMessages[
          roomId
        ].slice(
          -500
        );


      saveJSON(
        "roomMessages.json",
        roomMessages
      );


      io
        .to(
          "public:" +
          roomId
        )
        .emit(
          eventName,
          message
        );

    }


    socket.on(
      "room message",
      data =>
        sendRoomMessage(
          data,
          "chat message"
        )
    );


    socket.on(
      "room reply",
      data =>
        sendRoomMessage(
          data,
          "chat message"
        )
    );


    /* =====================================================
       NORMAL CHAT
       ===================================================== */

    socket.on(
      "chat message",
      data => {

        const user =
          getUser(socket);

        if (!user) {
          return;
        }


        if (
          data?.roomId
        ) {

          sendRoomMessage(
            data,
            "chat message"
          );

          return;

        }


        if (
          !socket.adminData &&
          (
            maintenanceMode ||
            chatLocked
          )
        ) {

          return;

        }


        if (
          !socket.adminData &&
          starsMode
        ) {

          const hasStar =
            stars.some(
              star =>
                str(
                  star
                ).toLowerCase() ===
                user.name.toLowerCase()
            );

          if (!hasStar) {

            socket.emit(
              "banned",
              "⭐ الكتابة لأصحاب النجمة فقط"
            );

            return;

          }

        }


        if (
          mutedUsers.some(
            mute =>
              String(
                mute.id
              ) ===
                String(
                  socket.id
                ) ||

              str(
                mute.name ||
                mute.username
              ).toLowerCase() ===
                user.name.toLowerCase()
          )
        ) {

          socket.emit(
            "banned",
            "🔇 أنت مكتوم"
          );

          return;

        }


        const message = {

          id:
            user.id,

          username:
            user.name,

          name:
            user.name,

          message:
            str(
              data?.message
            ),

          color:
            user.color,

          reply:
            data?.reply ||
            null,

          timestamp:
            Date.now()

        };


        if (
          !message.message
        ) {

          return;

        }


        io.emit(
          "chat message",
          message
        );

      }
    );


    /* =====================================================
       TYPING
       ===================================================== */

    socket.on(
      "room typing",
      data => {

        const user =
          getUser(socket);

        const roomId =
          str(
            data?.roomId ||
            user?.roomId
          );

        if (
          user &&
          roomId
        ) {

          socket
            .to(
              "public:" +
              roomId
            )
            .emit(
              "room typing",
              {

                roomId,

                username:
                  user.name,

                typing:
                  data?.typing === true

              }
            );

        }

      }
    );


    /* =====================================================
       PRIVATE MESSAGE
       ===================================================== */

    socket.on(
      "private message",
      data => {

        const user =
          getUser(socket);

        if (
          !user
        ) {

          return;

        }


        if (
          privateLocked &&
          !socket.adminData
        ) {

          return;

        }


        const target =
          str(
            data?.to ||
            data?.socketId
          );

        const text =
          str(
            data?.message
          );


        if (
          !target ||
          !text
        ) {

          return;

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

          timestamp:
            Date.now()

        };


        io
          .to(target)
          .emit(
            "private message",
            payload
          );


        socket.emit(
          "private message",
          payload
        );

      }
    );


    /* =====================================================
       ADMIN LOGIN
       ===================================================== */

    socket.on(
      "admin panel login",
      data => {

        const admin =
          admins.find(
            item =>

              str(
                item.name
              ) ===
              str(
                data?.name
              ) &&

              str(
                item.password
              ) ===
              str(
                data?.password
              )
          );


        if (!admin) {

          socket.emit(
            "admin login failed"
          );

          return;

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
              isMaster(admin)

          }
        );


        socket.emit(
          "admin online users",
          publicUsers()
        );


        socket.emit(
          "logs",
          logs
        );


        socket.emit(
          "get logs result",
          logs
        );


        socket.emit(
          "admins list",
          admins
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


        emitAdminRooms(
          socket
        );

        emitStats(
          socket
        );

      }
    );


    /* =====================================================
       ADMIN USERS
       ===================================================== */

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
          publicUsers()
        );

        emitStats(
          socket
        );

      }
    );


    /* =====================================================
       ADMIN LOGS
       ===================================================== */

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
          "get logs result",
          logs
        );

      }
    );


    /* =====================================================
       VIEW USER
       ===================================================== */

    socket.on(
      "view user",
      data => {

        if (
          !canGlobal(
            socket,
            "viewUserInfo"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        const user =
          getTarget(data);


        if (!user) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        socket.emit(
          "user info",
          {

            name:
              user.name,

            username:
              user.name,

            ip:
              user.ip,

            device:
              user.device,

            userAgent:
              user.device,

            roomId:
              user.roomId,

            role:
              user.role

          }
        );

      }
    );


    /* =====================================================
       KICK USER
       ===================================================== */

    socket.on(
      "kick user",
      data => {

        const admin =
          getAdmin(socket);

        const target =
          getTarget(data);

        const roomId =
          str(
            data?.roomId ||
            target?.roomId
          );


        if (!target) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        if (
          roomId &&
          target.rooms.has(
            roomId
          )
        ) {

          if (
            !canRoom(
              admin,
              roomId,
              "kick"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          const targetSocket =
            getTargetSocket(
              target
            );


          targetSocket?.leave(
            "public:" +
            roomId
          );


          targetSocket?.roomsOpen.delete(
            roomId
          );


          target.rooms.delete(
            roomId
          );


          if (
            target.roomId ===
            roomId
          ) {

            target.roomId =
              [
                ...target.rooms
              ][0] || null;

          }


          targetSocket?.emit(
            "kicked",
            "👢 تم طردك من الغرفة"
          );


          roomNotice(
            roomId,
            `👢 تم طرد ${target.name} من الغرفة`,
            "kick"
          );


          io
            .to(
              "public:" +
              roomId
            )
            .emit(
              "room users",
              getRoomUsers(
                roomId
              )
            );


          emitOnline();

          return;

        }


        if (
          !canGlobal(
            socket,
            "kick"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        getTargetSocket(
          target
        )?.emit(
          "kicked",
          "👢 تم طردك"
        );


        getTargetSocket(
          target
        )?.disconnect(
          true
        );


        addLog(
          `👢 تم طرد ${target.name}`
        );

      }
    );


    /* =====================================================
       BAN USER
       ===================================================== */

    socket.on(
      "ban user",
      data => {

        const admin =
          getAdmin(socket);

        const target =
          getTarget(data);

        const roomId =
          str(
            data?.roomId
          );


        if (!target) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        /* ROOM BAN */

        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "ban"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          addRoomModeration(
            roomId,
            "banned",
            target,
            admin.name
          );


          const targetSocket =
            getTargetSocket(
              target
            );


          if (
            target.rooms.has(
              roomId
            )
          ) {

            targetSocket?.leave(
              "public:" +
              roomId
            );


            targetSocket?.roomsOpen.delete(
              roomId
            );


            target.rooms.delete(
              roomId
            );


            if (
              target.roomId ===
              roomId
            ) {

              target.roomId =
                [
                  ...target.rooms
                ][0] || null;

            }

          }


          targetSocket?.emit(
            "banned",
            "🚫 تم حظرك من هذه الغرفة"
          );


          roomNotice(
            roomId,
            `🚫 تم حظر ${target.name} من الغرفة`,
            "ban"
          );


          io
            .to(
              "public:" +
              roomId
            )
            .emit(
              "room users",
              getRoomUsers(
                roomId
              )
            );


          emitOnline();

          return;

        }


        /* GLOBAL BAN */

        if (
          !canGlobal(
            socket,
            "ban"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          !bannedUsers.some(
            item =>
              String(
                item.ip
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

            device:
              target.device,

            by:
              admin.name,

            time:
              Date.now()

          });

        }


        saveJSON(
          "banned.json",
          bannedUsers
        );


        getTargetSocket(
          target
        )?.emit(
          "banned",
          "🚫 تم حظرك"
        );


        getTargetSocket(
          target
        )?.disconnect(
          true
        );


        addLog(
          `🚫 تم حظر ${target.name}`
        );

      }
    );


    /* =====================================================
       UNBAN USER
       ===================================================== */

    socket.on(
      "unban user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          str(
            typeof data === "string"
              ? data
              : (
                  data?.name ||
                  data?.username ||
                  data?.id
                )
          );

        const roomId =
          str(
            data?.roomId
          );


        /* ROOM UNBAN */

        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "unban"
            ) &&
            !canRoom(
              admin,
              roomId,
              "ban"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          removeRoomModeration(
            roomId,
            "banned",
            name
          );


          roomNotice(
            roomId,
            `🔓 تم فك حظر ${name}`,
            "unban"
          );


          return;

        }


        /* GLOBAL */

        if (
          !canGlobal(
            socket,
            "unban"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        bannedUsers =
          bannedUsers.filter(
            item =>

              str(
                item?.name
              ).toLowerCase() !==
                name.toLowerCase() &&

              str(
                item?.ip
              ) !==
                name
          );


        saveJSON(
          "banned.json",
          bannedUsers
        );


        addLog(
          `🔓 تم فك حظر ${name}`
        );

      }
    );


    /* =====================================================
       MUTE USER
       ===================================================== */

    socket.on(
      "mute user",
      data => {

        const admin =
          getAdmin(socket);

        const target =
          getTarget(data);

        const roomId =
          str(
            data?.roomId ||
            target?.roomId
          );


        if (!target) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        /* ROOM MUTE */

        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "mute"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          addRoomModeration(
            roomId,
            "muted",
            target,
            admin.name
          );


          getTargetSocket(
            target
          )?.emit(
            "banned",
            "🔇 تم كتمك في الغرفة"
          );


          roomNotice(
            roomId,
            `🔇 تم كتم ${target.name}`,
            "mute"
          );


          return;

        }


        /* GLOBAL MUTE */

        if (
          !canGlobal(
            socket,
            "mute"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          !mutedUsers.some(
            item =>
              String(
                item.id
              ) ===
              String(
                target.id
              )
          )
        ) {

          mutedUsers.push({

            id:
              target.id,

            name:
              target.name,

            by:
              admin.name,

            time:
              Date.now()

          });

        }


        saveJSON(
          "muted.json",
          mutedUsers
        );


        getTargetSocket(
          target
        )?.emit(
          "banned",
          "🔇 تم كتمك"
        );

      }
    );


    /* =====================================================
       UNMUTE
       ===================================================== */

    socket.on(
      "unmute user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          str(
            typeof data === "string"
              ? data
              : (
                  data?.name ||
                  data?.username
                )
          );

        const roomId =
          str(
            data?.roomId
          );


        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "unmute"
            ) &&
            !canRoom(
              admin,
              roomId,
              "mute"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          removeRoomModeration(
            roomId,
            "muted",
            name
          );


          roomNotice(
            roomId,
            `🔊 تم فك كتم ${name}`,
            "unmute"
          );


          return;

        }


        if (
          !canGlobal(
            socket,
            "mute"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        mutedUsers =
          mutedUsers.filter(
            item =>
              str(
                item?.name
              ).toLowerCase() !==
              name.toLowerCase()
          );


        saveJSON(
          "muted.json",
          mutedUsers
        );

      }
    );


    /* =====================================================
       DISCONNECT USER
       ===================================================== */

    socket.on(
      "disconnect user",
      data => {

        const admin =
          getAdmin(socket);

        const target =
          getTarget(data);

        const roomId =
          str(
            data?.roomId ||
            target?.roomId
          );


        if (!target) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        /* ROOM DISCONNECT */

        if (
          roomId &&
          target.rooms.has(
            roomId
          )
        ) {

          if (
            !canRoom(
              admin,
              roomId,
              "disconnect"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          const targetSocket =
            getTargetSocket(
              target
            );


          targetSocket?.leave(
            "public:" +
            roomId
          );


          targetSocket?.roomsOpen.delete(
            roomId
          );


          target.rooms.delete(
            roomId
          );


          if (
            target.roomId ===
            roomId
          ) {

            target.roomId =
              [
                ...target.rooms
              ][0] || null;

          }


          targetSocket?.emit(
            "disconnected",
            "⛔ تم فصلك من الغرفة"
          );


          roomNotice(
            roomId,
            `⛔ تم فصل ${target.name} من الغرفة`,
            "disconnect"
          );


          io
            .to(
              "public:" +
              roomId
            )
            .emit(
              "room users",
              getRoomUsers(
                roomId
              )
            );


          emitOnline();

          return;

        }


        /* GLOBAL DISCONNECT */

        if (
          !canGlobal(
            socket,
            "disconnect"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        getTargetSocket(
          target
        )?.emit(
          "disconnected",
          "⛔ تم فصلك"
        );


        getTargetSocket(
          target
        )?.disconnect(
          true
        );


        addLog(
          `⛔ تم فصل ${target.name}`
        );

      }
    );


    /* =====================================================
       DELETE MESSAGE
       ===================================================== */

    socket.on(
      "delete message",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );

        const messageId =
          str(
            data?.messageId ||
            data?.id
          );


        if (roomId) {

          if (
            !canRoom(
              admin,
              roomId,
              "deleteMessage"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

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
                str(
                  message.id
                ) !==
                messageId
            );


          saveJSON(
            "roomMessages.json",
            roomMessages
          );


          io
            .to(
              "public:" +
              roomId
            )
            .emit(
              "message deleted",
              {

                roomId,

                messageId

              }
            );


          return;

        }


        if (
          !canGlobal(
            socket,
            "deleteMessage"
          )
        ) {

          return;

        }


        io.emit(
          "message deleted",
          {

            messageId

          }
        );

      }
    );


    /* =====================================================
       CREATE ROOM
       ===================================================== */

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
          !hasPermission(
            admin,
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
          str(
            data?.name
          );


        if (!name) {

          socket.emit(
            "room error",
            "❌ اكتب اسم الغرفة"
          );

          return;

        }


        if (
          rooms.some(
            room =>
              room.name
                .toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "room error",
            "❌ الغرفة موجودة بالفعل"
          );

          return;

        }


        const newRoom =
          normalizeRoom({

            id:
              uid(),

            name,

            description:
              data?.description ||
              "",

            enabled:
              true,

            settings: {}

          });


        rooms.push(
          newRoom
        );


        ensureRoomData(
          newRoom.id
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
          roomModeration
        );


        io.emit(
          "rooms",
          rooms
        );


        io.emit(
          "rooms list",
          rooms
        );


        emitAdminRooms(
          socket
        );


        socket.emit(
          "room created",
          newRoom
        );


        addLog(
          `🏠 تم إنشاء الغرفة ${name}`
        );

      }
    );


    /* =====================================================
       EDIT ROOM
       ===================================================== */

    socket.on(
      "edit room",
      data => {

        const admin =
          getAdmin(socket);

        const currentRoom =
          getRoom(
            data?.roomId
          );


        if (
          !currentRoom
        ) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;

        }


        if (
          !hasPermission(
            admin,
            "rooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          data?.name !==
          undefined
        ) {

          currentRoom.name =
            str(
              data.name
            );

        }


        if (
          data?.description !==
          undefined
        ) {

          currentRoom.description =
            str(
              data.description
            );

        }


        saveJSON(
          "rooms.json",
          rooms
        );


        io.emit(
          "rooms",
          rooms
        );


        emitAdminRooms(
          socket
        );


        socket.emit(
          "room updated",
          currentRoom
        );

      }
    );


    /* =====================================================
       UPDATE ROOM
       ===================================================== */

    socket.on(
      "update room",
      data => {

        const admin =
          getAdmin(socket);

        const currentRoom =
          getRoom(
            data?.roomId
          );


        if (
          !currentRoom ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          data?.name !==
          undefined
        ) {

          currentRoom.name =
            str(
              data.name
            );

        }


        if (
          data?.description !==
          undefined
        ) {

          currentRoom.description =
            str(
              data.description
            );

        }


        saveJSON(
          "rooms.json",
          rooms
        );


        io.emit(
          "rooms",
          rooms
        );


        emitAdminRooms(
          socket
        );

      }
    );


    /* =====================================================
       DELETE ROOM
       ===================================================== */

    socket.on(
      "delete room",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );


        if (
          !hasPermission(
            admin,
            "rooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          !getRoom(roomId)
        ) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;

        }


        for (
          const user of users
        ) {

          if (
            user.rooms?.has(
              roomId
            )
          ) {

            getTargetSocket(
              user
            )?.leave(
              "public:" +
              roomId
            );


            user.rooms.delete(
              roomId
            );


            if (
              user.roomId ===
              roomId
            ) {

              user.roomId =
                [
                  ...user.rooms
                ][0] || null;

            }

          }

        }


        rooms =
          rooms.filter(
            room =>
              String(
                room.id
              ) !==
              roomId
          );


        delete roomStars[
          roomId
        ];

        delete roomMessages[
          roomId
        ];

        delete roomModeration[
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
          roomModeration
        );


        io.emit(
          "rooms",
          rooms
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
          `🗑️ تم حذف الغرفة ${roomId}`
        );


        emitOnline();

      }
    );


    /* =====================================================
       ENABLE / DISABLE ROOM
       ===================================================== */

    socket.on(
      "toggle room",
      data => {

        const admin =
          getAdmin(socket);

        const currentRoom =
          getRoom(
            data?.roomId
          );


        if (
          !currentRoom ||
          !hasPermission(
            admin,
            "rooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        const enabled =
          data?.enabled !==
          undefined

            ? !!data.enabled

            : !currentRoom.enabled;


        currentRoom.enabled =
          enabled;

        currentRoom.settings.enabled =
          enabled;


        saveJSON(
          "rooms.json",
          rooms
        );


        io.emit(
          "rooms",
          rooms
        );


        emitAdminRooms(
          socket
        );

      }
    );


    /* =====================================================
       ROOM SETTING
       ===================================================== */

    socket.on(
      "room setting",
      data => {

        const admin =
          getAdmin(socket);

        const currentRoom =
          getRoom(
            data?.roomId
          );

        const key =
          str(
            data?.setting ||
            data?.key
          );


        let permission =
          "roomSettings";


        if (
          key === "stars" ||
          key === "starsMode"
        ) {

          permission =
            "stars";

        }


        if (
          key === "chatLock" ||
          key === "chatLocked"
        ) {

          permission =
            "chatLock";

        }


        if (
          key === "maintenance"
        ) {

          permission =
            "maintenance";

        }


        if (
          !currentRoom ||
          !canRoom(
            admin,
            currentRoom.id,
            permission
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح لهذا الإعداد"
          );

          return;

        }


        currentRoom.settings[
          key
        ] =
          !!data?.value;


        if (
          key === "chatLock"
        ) {

          currentRoom.settings.chatLocked =
            !!data.value;

        }


        if (
          key === "starsMode"
        ) {

          currentRoom.settings.stars =
            !!data.value;

        }


        saveJSON(
          "rooms.json",
          rooms
        );


        io
          .to(
            "public:" +
            currentRoom.id
          )
          .emit(
            "room settings",
            {

              roomId:
                currentRoom.id,

              settings:
                currentRoom.settings

            }
          );

      }
    );


    /* =====================================================
       ROOM STARS MODE
       ===================================================== */

    socket.on(
      "toggle room stars",
      data => {

        const admin =
          getAdmin(socket);

        const currentRoom =
          getRoom(
            data?.roomId
          );


        if (
          !currentRoom ||
          !canRoom(
            admin,
            currentRoom.id,
            "stars"
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        const enabled =
          data?.enabled !==
          undefined

            ? !!data.enabled

            : !(
                currentRoom.settings.stars ||
                currentRoom.settings.starsMode
              );


        currentRoom.settings.stars =
          enabled;

        currentRoom.settings.starsMode =
          enabled;


        saveJSON(
          "rooms.json",
          rooms
        );


        io
          .to(
            "public:" +
            currentRoom.id
          )
          .emit(
            "room stars mode",
            {

              roomId:
                currentRoom.id,

              enabled

            }
          );

      }
    );


    /* =====================================================
       GIVE ROOM STAR
       ===================================================== */

    socket.on(
      "give room star",
      data => {

        const user =
          getUser(socket);

        const roomId =
          str(
            data?.roomId ||
            user?.roomId
          );

        const targetName =
          str(
            data?.username ||
            data?.name
          );


        if (
          !user ||
          !getRoom(roomId)
        ) {

          return;

        }


        ensureRoomData(
          roomId
        );


        const target =
          users.find(
            item =>
              item.name
                .toLowerCase() ===
              targetName.toLowerCase() &&

              item.rooms.has(
                roomId
              )
          );


        if (!target) {

          socket.emit(
            "room error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        const exists =
          roomStars[
            roomId
          ].some(
            star =>

              str(
                star.from
              ).toLowerCase() ===
              user.name.toLowerCase() &&

              str(
                star.to
              ).toLowerCase() ===
              target.name.toLowerCase()
          );


        if (exists) {
          return;
        }


        roomStars[
          roomId
        ].push({

          id:
            uid(),

          roomId,

          from:
            user.name,

          to:
            target.name,

          timestamp:
            Date.now()

        });


        saveJSON(
          "roomStars.json",
          roomStars
        );


        io
          .to(
            "public:" +
            roomId
          )
          .emit(
            "room stars",
            {

              roomId,

              stars:
                roomStars[
                  roomId
                ],

              enabled:
                !!getRoom(
                  roomId
                ).settings.stars

            }
          );

      }
    );


    /* =====================================================
       REMOVE ROOM STAR
       ===================================================== */

    socket.on(
      "remove room star",
      data => {

        const user =
          getUser(socket);

        const roomId =
          str(
            data?.roomId ||
            user?.roomId
          );

        const targetName =
          str(
            data?.username ||
            data?.name
          );


        ensureRoomData(
          roomId
        );


        roomStars[
          roomId
        ] =
          roomStars[
            roomId
          ].filter(
            star =>

              !(
                str(
                  star.from
                ).toLowerCase() ===
                str(
                  user?.name
                ).toLowerCase() &&

                str(
                  star.to
                ).toLowerCase() ===
                targetName.toLowerCase()
              )
          );


        saveJSON(
          "roomStars.json",
          roomStars
        );


        io
          .to(
            "public:" +
            roomId
          )
          .emit(
            "room stars",
            {

              roomId,

              stars:
                roomStars[
                  roomId
                ],

              enabled:
                !!getRoom(
                  roomId
                )?.settings.stars

            }
          );

      }
    );


    /* =====================================================
       GET ROOM STARS
       ===================================================== */

    socket.on(
      "get room stars",
      data => {

        const roomId =
          str(
            data?.roomId
          );


        ensureRoomData(
          roomId
        );


        socket.emit(
          "room stars",
          {

            roomId,

            stars:
              roomStars[
                roomId
              ],

            enabled:
              !!getRoom(
                roomId
              )?.settings.stars

          }
        );

      }
    );


    /* =====================================================
       ROOM ADMIN NOTICE
       ===================================================== */

    socket.on(
      "room admin notice",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );


        if (
          !canRoom(
            admin,
            roomId
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        roomNotice(
          roomId,
          `✨ تم توكيل ${admin.name}`,
          "admin"
        );

      }
    );


    /* =====================================================
       CUSTOM ROOM NOTICE
       ===================================================== */

    socket.on(
      "send room notice",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );

        const message =
          str(
            data?.message
          );


        if (
          !canRoom(
            admin,
            roomId
          ) ||
          !message
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        roomNotice(
          roomId,
          message,
          "admin"
        );

      }
    );


    /* =====================================================
       ROOM STATE
       ===================================================== */

    socket.on(
      "get room state",
      data => {

        const roomId =
          str(
            data?.roomId
          );

        const currentRoom =
          getRoom(
            roomId
          );


        if (
          !currentRoom
        ) {
          return;
        }


        ensureRoomData(
          roomId
        );


        socket.emit(
          "room state",
          {

            roomId,

            room:
              currentRoom,

            settings:
              currentRoom.settings,

            users:
              getRoomUsers(
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


    /* =====================================================
       ROOM ADMINS
       ===================================================== */

    socket.on(
      "get room admins",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );


        if (
          !canRoom(
            admin,
            roomId
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        socket.emit(
          "room admins",
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
          )
        );

      }
    );


    /* =====================================================
       ASSIGN ROOM ADMIN
       ===================================================== */

    socket.on(
      "assign room admin",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );

        const name =
          str(
            data?.name ||
            data?.adminName
          );


        if (
          !isMaster(admin)
        ) {

          socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );

          return;

        }


        const target =
          admins.find(
            item =>
              item.name ===
              name
          );


        if (
          !target ||
          !getRoom(roomId)
        ) {

          socket.emit(
            "admin error",
            "❌ البيانات غير صحيحة"
          );

          return;

        }


        target.assignedRooms =
          Array.from(
            new Set(
              [
                ...(target.assignedRooms || [])
                  .map(String),

                roomId

              ]
            )
          );


        saveJSON(
          "admins.json",
          admins
        );


        emitAdminRooms(
          socket
        );


        io.emit(
          "admins list",
          admins
        );

      }
    );


    /* =====================================================
       REMOVE ROOM ADMIN
       ===================================================== */

    socket.on(
      "remove room admin",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );

        const name =
          str(
            data?.name ||
            data?.adminName
          );


        if (
          !isMaster(admin)
        ) {

          socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );

          return;

        }


        const target =
          admins.find(
            item =>
              item.name ===
              name
          );


        if (!target) {
          return;
        }


        target.assignedRooms =
          (
            target.assignedRooms ||
            []
          ).filter(
            id =>
              String(id) !==
              roomId
          );


        saveJSON(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );

      }
    );


    /* =====================================================
       ROOM ADMIN PERMISSIONS
       ===================================================== */

    socket.on(
      "update room admin permissions",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          str(
            data?.roomId
          );

        const name =
          str(
            data?.name ||
            data?.adminName
          );


        if (
          !isMaster(admin)
        ) {

          socket.emit(
            "admin error",
            "❌ هذه العملية للمدير الرئيسي فقط"
          );

          return;

        }


        const target =
          admins.find(
            item =>
              item.name ===
              name
          );


        if (!target) {
          return;
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

          ...(
            data?.permissions ||
            {}
          )

        };


        saveJSON(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );

      }
    );


    /* =====================================================
       ADD ADMIN
       ===================================================== */

    socket.on(
      "add admin",
      data => {

        if (
          !canGlobal(
            socket,
            "addAdmin"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        const name =
          str(
            data?.name
          );

        const password =
          str(
            data?.password
          );


        if (
          !name ||
          !password
        ) {

          socket.emit(
            "admin error",
            "❌ اكتب اسم الأدمن وكلمة المرور"
          );

          return;

        }


        if (
          admins.some(
            admin =>
              admin.name
                .toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "admin error",
            "❌ الأدمن موجود بالفعل"
          );

          return;

        }


        const newAdmin = {

          name,

          password,

          role:
            "moderator",

          permissions:
            data?.permissions ||
            {},

          assignedRooms:
            [],

          roomPermissions:
            {}

        };


        admins.push(
          newAdmin
        );


        saveJSON(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );


        socket.emit(
          "admin added",
          newAdmin
        );


        addLog(
          `👮 تمت إضافة ${name}`
        );

      }
    );


    /* =====================================================
       REMOVE ADMIN
       ===================================================== */

    socket.on(
      "remove admin",
      data => {

        if (
          !canGlobal(
            socket,
            "removeAdmin"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        const name =
          str(
            typeof data === "string"
              ? data
              : data?.name
          );


        if (!name) {
          return;
        }


        admins =
          admins.filter(
            admin =>
              admin.name !==
              name
          );


        saveJSON(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );


        addLog(
          `🗑️ تم حذف الأدمن ${name}`
        );

      }
    );


    /* =====================================================
       GLOBAL MAINTENANCE
       ===================================================== */

    socket.on(
      "toggle maintenance",
      data => {

        if (
          !canGlobal(
            socket,
            "maintenance"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

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


    /* =====================================================
       GLOBAL CHAT LOCK
       ===================================================== */

    socket.on(
      "toggle chat lock",
      data => {

        if (
          !canGlobal(
            socket,
            "chatLock"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

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


    /* =====================================================
       PRIVATE LOCK
       ===================================================== */

    socket.on(
      "toggle private lock",
      data => {

        if (
          !canGlobal(
            socket,
            "privateLock"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

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


    /* =====================================================
       GLOBAL / ROOM STARS MODE
       ===================================================== */

    socket.on(
      "toggle stars mode",
      data => {

        if (
          data?.roomId
        ) {

          const currentRoom =
            getRoom(
              data.roomId
            );


          if (
            !currentRoom ||
            !canRoom(
              getAdmin(socket),
              currentRoom.id,
              "stars"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح"
            );

            return;

          }


          const enabled =
            data?.enabled !==
            undefined

              ? !!data.enabled

              : !(
                  currentRoom.settings.stars ||
                  currentRoom.settings.starsMode
                );


          currentRoom.settings.stars =
            enabled;

          currentRoom.settings.starsMode =
            enabled;


          saveJSON(
            "rooms.json",
            rooms
          );


          io
            .to(
              "public:" +
              currentRoom.id
            )
            .emit(
              "room stars mode",
              {

                roomId:
                  currentRoom.id,

                enabled

              }
            );


          return;

        }


        if (
          !canGlobal(
            socket,
            "stars"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

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


    /* =====================================================
       GLOBAL GIVE STAR
       ===================================================== */

    socket.on(
      "give star",
      data => {

        if (
          !canGlobal(
            socket,
            "stars"
          )
        ) {

          return;

        }


        const name =
          str(
            typeof data === "string"
              ? data
              : (
                  data?.name ||
                  data?.username
                )
          );


        if (
          name &&
          !stars.includes(
            name
          )
        ) {

          stars.push(
            name
          );

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


    /* =====================================================
       GLOBAL REMOVE STAR
       ===================================================== */

    socket.on(
      "remove star",
      data => {

        if (
          !canGlobal(
            socket,
            "stars"
          )
        ) {

          return;

        }


        const name =
          str(
            typeof data === "string"
              ? data
              : (
                  data?.name ||
                  data?.username
                )
          );


        stars =
          stars.filter(
            item =>
              str(
                item
              ).toLowerCase() !==
              name.toLowerCase()
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


    /* =====================================================
       DISCONNECT
       ===================================================== */

    socket.on(
      "disconnect",
      () => {

        const user =
          getUser(socket);


        if (!user) {
          return;
        }


        for (
          const roomId
          of user.rooms
        ) {

          io
            .to(
              "public:" +
              roomId
            )
            .emit(
              "room users",
              getRoomUsers(
                roomId
              )
            );


          roomNotice(
            roomId,
            `🚪 غادر ${user.name} الغرفة`,
            "leave"
          );

        }


        users =
          users.filter(
            item =>
              String(
                item.id
              ) !==
              String(
                socket.id
              )
          );


        emitOnline();


        addLog(
          `👋 ${user.name} خرج`
        );

      }
    );

  }
);


/* =========================================================
   SAVE EVERYTHING
   ========================================================= */

function saveEverything() {

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
    roomModeration
  );

}


process.on(
  "SIGINT",
  () => {

    saveEverything();

    process.exit(0);

  }
);


process.on(
  "SIGTERM",
  () => {

    saveEverything();

    process.exit(0);

  }
);


/* =========================================================
   SERVER
   ========================================================= */

const PORT =
  process.env.PORT ||
  10000;


server.listen(
  PORT,
  () => {

    console.log(
      "================================="
    );

    console.log(
      "🚀 MERSAL CHAT SERVER STARTED"
    );

    console.log(
      `🌐 PORT: ${PORT}`
    );

    console.log(
      `🏠 ROOMS: ${rooms.length}`
    );

    console.log(
      `👮 ADMINS: ${admins.length}`
    );

    console.log(
      "================================="
    );

  }
);
