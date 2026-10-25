const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DATA = __dirname;


/* =========================================================
   FILE STORAGE
   ========================================================= */

function loadJSON(file, fallback) {
  try {
    const p = path.join(DATA, file);

    if (!fs.existsSync(p)) {
      fs.writeFileSync(
        p,
        JSON.stringify(fallback, null, 2)
      );

      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(p, "utf8")
    );

  } catch (error) {

    console.error(
      `LOAD ${file} ERROR`,
      error
    );

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

    console.error(
      `SAVE ${file} ERROR`,
      error
    );

  }

}


/* =========================================================
   DATA
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

let roomModerationData =
  loadJSON(
    "roomModeration.json",
    {}
  );


/* =========================================================
   GLOBAL MODES
   ========================================================= */

let chatLocked = false;
let privateLocked = false;
let maintenanceMode = false;
let starsMode = false;


/* =========================================================
   ID
   ========================================================= */

function createId() {

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );

}


/* =========================================================
   IP
   ========================================================= */

function getIP(socket) {

  try {

    const forwarded =
      socket.handshake.headers[
        "x-forwarded-for"
      ];

    if (forwarded) {

      return String(
        forwarded
      )
        .split(",")[0]
        .trim();

    }

    return (
      socket.handshake.address ||
      "unknown"
    );

  } catch {

    return "unknown";

  }

}


/* =========================================================
   DEVICE
   ========================================================= */

function getDevice(
  socket,
  data = {}
) {

  return String(
    data.deviceToken ||
    socket.handshake.headers[
      "user-agent"
    ] ||
    "unknown"
  );

}


/* =========================================================
   ROOM NORMALIZATION
   ========================================================= */

function normalizeRoom(room) {

  const r =
    room || {};

  return {

    id:
      String(
        r.id ||
        createId()
      ),

    name:
      String(
        r.name ||
        "غرفة"
      ).trim(),

    description:
      String(
        r.description ||
        ""
      ).trim(),

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
    ? rooms.map(normalizeRoom)
    : [];

saveJSON(
  "rooms.json",
  rooms
);


/* =========================================================
   ROOM HELPERS
   ========================================================= */

function getRoom(roomId) {

  return rooms.find(
    room =>
      String(room.id) ===
      String(roomId)
  );

}


function ensureRoomData(roomId) {

  const id =
    String(roomId);

  if (!roomStars[id]) {
    roomStars[id] = [];
  }

  if (!roomMessages[id]) {
    roomMessages[id] = [];
  }

  if (!roomModerationData[id]) {

    roomModerationData[id] = {

      banned: [],
      muted: [],
      kicked: [],
      disconnected: []

    };

  }

  const moderation =
    roomModerationData[id];

  for (
    const key of [
      "banned",
      "muted",
      "kicked",
      "disconnected"
    ]
  ) {

    if (
      !Array.isArray(
        moderation[key]
      )
    ) {

      moderation[key] = [];

    }

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


/* =========================================================
   ADMIN HELPERS
   ========================================================= */

function isMaster(admin) {

  if (!admin) {
    return false;
  }

  if (
    admin.role ===
    "master"
  ) {

    return true;

  }

  if (
    admin.isMaster === true
  ) {

    return true;

  }

  if (
    admin.permissions?.master ===
    true
  ) {

    return true;

  }

  /*
   * إذا لم يوجد role في ملف admins.json
   * نعتبر أول أدمن هو المدير الرئيسي.
   */

  if (
    admins.length > 0 &&
    admins[0] === admin
  ) {

    return true;

  }

  return false;

}


function getAdmin(socket) {

  return (
    socket.adminData ||
    null
  );

}


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
    Array.isArray(
      admin.assignedRooms
    ) &&
    admin.assignedRooms
      .map(String)
      .includes(
        String(roomId)
      )
  );

}


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
   USER HELPERS
   ========================================================= */

function getUser(socket) {

  return users.find(
    user =>
      user.id ===
      socket.id
  );

}


function findUser(name) {

  return users.find(
    user =>
      String(
        user.name
      ).toLowerCase() ===
      String(
        name || ""
      ).toLowerCase()
  );

}


function getUserSocket(user) {

  if (!user) {
    return null;
  }

  return (
    io.sockets.sockets.get(
      user.id
    ) ||
    null
  );

}


function sanitizeUser(user) {

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
    sanitizeUser
  );

}


function getRoomUsers(
  roomId
) {

  return users
    .filter(
      user =>
        String(
          user.roomId || ""
        ) ===
        String(roomId)
    )
    .map(
      sanitizeUser
    );

}


/* =========================================================
   USERNAME PROTECTION
   ========================================================= */

function validUsername(
  name
) {

  const username =
    String(
      name || ""
    ).trim();

  if (
    !username ||
    username.length > 30
  ) {

    return false;

  }

  if (
    /[&@]/.test(
      username
    )
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
      username.toLowerCase()
    )
  ) {

    return false;

  }

  return true;

}


/* =========================================================
   MODERATION HELPERS
   ========================================================= */

function getModerationList(
  roomId,
  key
) {

  ensureRoomData(
    roomId
  );

  return roomModerationData[
    roomId
  ][key];

}


function moderationHas(
  roomId,
  key,
  username
) {

  return getModerationList(
    roomId,
    key
  ).some(
    item => {

      const name =
        typeof item ===
        "string"
          ? item
          : item?.name;

      return (
        String(
          name || ""
        ).toLowerCase() ===
        String(
          username || ""
        ).toLowerCase()
      );

    }
  );

}


function addModeration(
  roomId,
  key,
  username,
  by
) {

  const list =
    getModerationList(
      roomId,
      key
    );

  const exists =
    list.some(
      item => {

        const name =
          typeof item ===
          "string"
            ? item
            : item?.name;

        return (
          String(
            name || ""
          ).toLowerCase() ===
          String(
            username
          ).toLowerCase()
        );

      }
    );

  if (!exists) {

    list.push({

      name:
        username,

      by:
        by ||
        "admin",

      time:
        Date.now()

    });

  }

  saveJSON(
    "roomModeration.json",
    roomModerationData
  );

}


function removeModeration(
  roomId,
  key,
  username
) {

  ensureRoomData(
    roomId
  );

  roomModerationData[
    roomId
  ][key] =
    roomModerationData[
      roomId
    ][key].filter(
      item => {

        const name =
          typeof item ===
          "string"
            ? item
            : item?.name;

        return (
          String(
            name || ""
          ).toLowerCase() !==
          String(
            username || ""
          ).toLowerCase()
        );

      }
    );

  saveJSON(
    "roomModeration.json",
    roomModerationData
  );

}


/* =========================================================
   LOGS
   ========================================================= */

function addLog(
  message
) {

  const log = {

    id:
      createId(),

    time:
      new Date().toISOString(),

    message:
      String(message)

  };

  logs.unshift(
    log
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
    log
  );

  console.log(
    message
  );

}


/* =========================================================
   ONLINE USERS
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
        admins.length

    }
  );

}


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
   ROOMS TO CLIENT
   ========================================================= */

function emitRooms(
  socket
) {

  socket.emit(
    "rooms",
    rooms
  );

  socket.emit(
    "room list",
    rooms
  );

}


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
   ROOM NOTICE
   ========================================================= */

function roomNotice(
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


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok:
        true,

      users:
        users.length,

      rooms:
        rooms.length

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
   SOCKET
   ========================================================= */

io.on(
  "connection",
  socket => {


    /* =====================================================
       CHECK ADMIN
       ===================================================== */

    socket.on(
      "check admin",
      name => {

        const exists =
          admins.some(
            admin =>
              String(
                admin.name
              ).toLowerCase() ===
              String(
                name || ""
              ).toLowerCase()
          );

        socket.emit(
          "admin check result",
          exists
        );

      }
    );


    /* =====================================================
       USER LOGIN
       ===================================================== */

    socket.on(
      "join",
      data => {

        const username =
          String(
            data?.username || ""
          ).trim();

        if (
          !validUsername(
            username
          )
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
              user.name.toLowerCase() ===
              username.toLowerCase()
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


        const ipBanned =
          bannedUsers.some(
            item => {

              const value =
                item?.ip ||
                item;

              return (
                String(
                  value
                ).toLowerCase() ===
                String(
                  ip
                ).toLowerCase()
              );

            }
          );


        if (ipBanned) {

          socket.emit(
            "banned",
            "🚫 أنت محظور"
          );

          return;

        }


        const deviceBanned =
          deviceBannedUsers.some(
            item => {

              const value =
                item?.device ||
                item;

              return (
                String(
                  value
                ).toLowerCase() ===
                String(
                  device
                ).toLowerCase()
              );

            }
          );


        if (
          deviceBanned
        ) {

          socket.emit(
            "banned",
            "⛔ الجهاز محظور"
          );

          return;

        }


        const admin =
          admins.find(
            item =>
              String(
                item.name
              ).toLowerCase() ===
              username.toLowerCase()
          );


        if (admin) {

          const password =
            String(
              data?.adminPassword ||
              ""
            );

          if (
            password !==
            String(
              admin.password ||
              ""
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


        const user = {

          id:
            socket.id,

          name:
            username,

          username:
            username,

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

          roomId:
            null

        };


        users.push(
          user
        );

        socket.username =
          username;


        socket.emit(
          "login success",
          sanitizeUser(user)
        );

        emitRooms(
          socket
        );

        emitOnline();

        addLog(
          `👤 ${username} دخل`
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
          String(
            data?.roomId ||
            ""
          ).trim();

        const room =
          getRoom(
            roomId
          );


        if (!user) {

          socket.emit(
            "room error",
            "❌ يجب تسجيل الدخول أولًا"
          );

          return;

        }


        if (!room) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;

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

          socket.emit(
            "room error",
            "⛔ هذه الغرفة متوقفة"
          );

          return;

        }


        if (
          room.settings.maintenance &&
          !user.isAdmin
        ) {

          socket.emit(
            "room error",
            "🛠️ الغرفة في وضع الصيانة"
          );

          return;

        }


        if (
          moderationHas(
            roomId,
            "banned",
            user.name
          )
        ) {

          socket.emit(
            "room error",
            "🚫 أنت محظور من هذه الغرفة"
          );

          return;

        }


        if (
          moderationHas(
            roomId,
            "disconnected",
            user.name
          )
        ) {

          socket.emit(
            "room error",
            "⛔ تم منعك من دخول هذه الغرفة"
          );

          return;

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

          roomNotice(
            user.roomId,
            `🚪 غادر ${user.name} الغرفة`,
            "leave"
          );

        }


        socket.join(
          `public:${roomId}`
        );

        user.roomId =
          roomId;


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
              room.settings

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


        io.to(
          `public:${roomId}`
        ).emit(
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
          String(
            data?.roomId ||
            user.roomId ||
            ""
          ).trim();

        if (!roomId) {
          return;
        }


        socket.leave(
          `public:${roomId}`
        );


        if (
          String(
            user.roomId
          ) === roomId
        ) {

          user.roomId =
            null;

        }


        roomNotice(
          roomId,
          `🚪 غادر ${user.name} الغرفة`,
          "leave"
        );


        io.to(
          `public:${roomId}`
        ).emit(
          "room users",
          getRoomUsers(
            roomId
          )
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

        const roomId =
          String(
            data?.roomId ||
            ""
          );

        socket.emit(
          "room users",
          getRoomUsers(
            roomId
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
          String(
            data?.roomId ||
            ""
          );

        const room =
          getRoom(
            roomId
          );

        let allowed =
          !!user &&
          !!room;

        let reason =
          "ok";


        if (!user) {

          reason =
            "login";

        } else if (!room) {

          reason =
            "not_found";

        } else if (
          room.enabled ===
          false ||
          room.settings.enabled ===
          false
        ) {

          allowed =
            false;

          reason =
            "disabled";

        } else if (
          room.settings.maintenance &&
          !user.isAdmin
        ) {

          allowed =
            false;

          reason =
            "maintenance";

        } else if (
          moderationHas(
            roomId,
            "banned",
            user.name
          )
        ) {

          allowed =
            false;

          reason =
            "banned";

        } else if (
          moderationHas(
            roomId,
            "disconnected",
            user.name
          )
        ) {

          allowed =
            false;

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


    /* =====================================================
       ROOM MESSAGE
       ===================================================== */

    function sendRoomMessage(
      data,
      eventName =
        "room message"
    ) {

      const user =
        getUser(socket);

      if (!user) {
        return;
      }


      const roomId =
        String(
          data?.roomId ||
          user.roomId ||
          ""
        ).trim();

      const message =
        String(
          data?.message ||
          data?.text ||
          ""
        ).trim();

      const room =
        getRoom(
          roomId
        );


      if (
        !room ||
        String(
          user.roomId
        ) !== roomId ||
        !message
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
        room.settings.chatLock ||
        room.settings.chatLocked
      ) {

        socket.emit(
          "room error",
          "🔒 الدردشة مقفلة حاليًا"
        );

        return;

      }


      if (
        moderationHas(
          roomId,
          "banned",
          user.name
        )
      ) {

        socket.emit(
          "room error",
          "🚫 أنت محظور من هذه الغرفة"
        );

        return;

      }


      if (
        moderationHas(
          roomId,
          "muted",
          user.name
        )
      ) {

        socket.emit(
          "room error",
          "🔇 أنت مكتوم في هذه الغرفة"
        );

        return;

      }


      if (
        moderationHas(
          roomId,
          "disconnected",
          user.name
        )
      ) {

        socket.emit(
          "room error",
          "⛔ لا يمكنك الكتابة في هذه الغرفة"
        );

        return;

      }


      if (
        (
          room.settings.stars ||
          room.settings.starsMode
        ) &&
        !user.isAdmin
      ) {

        const hasStar =
          roomStars[
            roomId
          ].some(
            star =>
              String(
                star.to
              ).toLowerCase() ===
              user.name.toLowerCase()
          );

        if (!hasStar) {

          socket.emit(
            "room error",
            "⭐ الكتابة لأصحاب النجمة فقط"
          );

          return;

        }

      }


      const messageObject = {

        id:
          createId(),

        roomId,

        username:
          user.name,

        name:
          user.name,

        message,

        text:
          message,

        color:
          user.color,

        reply:
          data?.reply ||
          null,

        timestamp:
          Date.now(),

        time:
          new Date().toISOString(),

        type:
          "room"

      };


      roomMessages[
        roomId
      ].push(
        messageObject
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


      io.to(
        `public:${roomId}`
      ).emit(
        eventName,
        messageObject
      );


      if (
        eventName !==
        "chat message"
      ) {

        io.to(
          `public:${roomId}`
        ).emit(
          "chat message",
          messageObject
        );

      }

    }


    socket.on(
      "room message",
      data =>
        sendRoomMessage(
          data
        )
    );


    socket.on(
      "room reply",
      data =>
        sendRoomMessage(
          data
        )
    );


    /* =====================================================
       PUBLIC CHAT
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
          starsMode &&
          !stars.includes(
            user.name
          )
        ) {

          socket.emit(
            "banned",
            "⭐ الكتابة لأصحاب النجمة فقط"
          );

          return;

        }


        if (
          mutedUsers.some(
            item =>
              item.id ===
                socket.id ||
              String(
                item.name ||
                item.username ||
                ""
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


        const message =
          String(
            data?.message ||
            ""
          ).trim();

        if (!message) {
          return;
        }


        const messageObject = {

          id:
            createId(),

          username:
            user.name,

          name:
            user.name,

          message,

          color:
            user.color,

          reply:
            data?.reply ||
            null,

          timestamp:
            Date.now()

        };


        io.emit(
          "chat message",
          messageObject
        );

      }
    );


    /* =====================================================
       ROOM TYPING
       ===================================================== */

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
          user &&
          roomId
        ) {

          socket
            .to(
              `public:${roomId}`
            )
            .emit(
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
          String(
            data?.to ||
            data?.socketId ||
            ""
          );

        const text =
          String(
            data?.message ||
            ""
          ).trim();


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


        io.to(
          target
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


    /* =====================================================
       ADMIN PANEL LOGIN
       ===================================================== */

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
              isMaster(
                admin
              )

          }
        );


        socket.emit(
          "admin online users",
          publicUsers()
        );


        socket.emit(
          "get logs result",
          logs
        );


        socket.emit(
          "logs",
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
              isMaster(
                admin
              )

          }
        );


        emitStats(
          socket
        );


        socket.emit(
          "admins list",
          admins.map(
            item => ({

              name:
                item.name,

              role:
                item.role ||
                (
                  isMaster(item)
                    ? "master"
                    : "moderator"
                ),

              permissions:
                item.permissions ||
                {},

              assignedRooms:
                item.assignedRooms ||
                []

            })
          )
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
       LOGS
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

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        const name =
          typeof data ===
          "string"
            ? data
            : data?.name ||
              data?.username;


        const user =
          findUser(
            name
          );


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
       ADMIN UTILS
       ===================================================== */

    function requireGlobal(
      permission
    ) {

      return hasPermission(
        getAdmin(socket),
        permission
      );

    }


    function targetName(
      data
    ) {

      return typeof data ===
        "string"
        ? data
        : data?.name ||
          data?.username ||
          "";

    }


    /* =====================================================
       KICK
       ===================================================== */

    socket.on(
      "kick user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          targetName(
            data
          );

        const target =
          findUser(
            name
          );


        if (!target) {

          socket.emit(
            "admin error",
            "❌ المستخدم غير موجود"
          );

          return;

        }


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


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
            getUserSocket(
              target
            );


          if (
            String(
              target.roomId
            ) === roomId
          ) {

            targetSocket?.leave(
              `public:${roomId}`
            );

            target.roomId =
              null;

            targetSocket?.emit(
              "kicked",
              "👢 تم طردك من الغرفة"
            );

            roomNotice(
              roomId,
              `👢 تم طرد ${target.name} من الغرفة`,
              "kick"
            );

            io.to(
              `public:${roomId}`
            ).emit(
              "room users",
              getRoomUsers(
                roomId
              )
            );

          }

          return;

        }


        if (
          !requireGlobal(
            "kick"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        getUserSocket(
          target
        )?.emit(
          "kicked",
          "👢 تم طردك"
        );

        getUserSocket(
          target
        )?.disconnect(
          true
        );

      }
    );


    /* =====================================================
       BAN
       ===================================================== */

    socket.on(
      "ban user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          targetName(
            data
          );

        const target =
          findUser(
            name
          );


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


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


          addModeration(
            roomId,
            "banned",
            name,
            admin.name
          );


          if (
            target &&
            String(
              target.roomId
            ) === roomId
          ) {

            const targetSocket =
              getUserSocket(
                target
              );

            targetSocket?.leave(
              `public:${roomId}`
            );

            target.roomId =
              null;

            targetSocket?.emit(
              "banned",
              "🚫 تم حظرك من الغرفة"
            );

          }


          roomNotice(
            roomId,
            `🚫 تم حظر ${name} من الغرفة`,
            "ban"
          );


          io.to(
            `public:${roomId}`
          ).emit(
            "room users",
            getRoomUsers(
              roomId
            )
          );


          return;

        }


        if (
          !requireGlobal(
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
          target &&
          !bannedUsers.some(
            item =>
              item.ip ===
              target.ip
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

        }


        saveJSON(
          "banned.json",
          bannedUsers
        );


        getUserSocket(
          target
        )?.emit(
          "banned",
          "🚫 تم حظرك"
        );


        getUserSocket(
          target
        )?.disconnect(
          true
        );


        addLog(
          `🚫 ${name} تم حظره`
        );

      }
    );


    /* =====================================================
       UNBAN
       ===================================================== */

    socket.on(
      "unban user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          targetName(
            data
          );


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


          if (
            !canRoom(
              admin,
              roomId,
              "unban"
            )
          ) {

            socket.emit(
              "admin error",
              "❌ غير مصرح لهذه الغرفة"
            );

            return;

          }


          removeModeration(
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


        if (
          !requireGlobal(
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
              String(
                item.name ||
                ""
              ).toLowerCase() !==
              String(
                name
              ).toLowerCase()
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
       MUTE
       ===================================================== */

    socket.on(
      "mute user",
      data => {

        const admin =
          getAdmin(socket);

        const name =
          targetName(
            data
          );

        const target =
          findUser(
            name
          );


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


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


          addModeration(
            roomId,
            "muted",
            name,
            admin.name
          );


          roomNotice(
            roomId,
            `🔇 تم كتم ${name}`,
            "mute"
          );


          io.to(
            `public:${roomId}`
          ).emit(
            "room users",
            getRoomUsers(
              roomId
            )
          );


          return;

        }


        if (
          !requireGlobal(
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
          target &&
          !mutedUsers.some(
            item =>
              item.id ===
              target.id
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


        getUserSocket(
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
          targetName(
            data
          );


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


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


          removeModeration(
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
          !requireGlobal(
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
              String(
                item.name ||
                ""
              ).toLowerCase() !==
              String(
                name
              ).toLowerCase()
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

        const name =
          targetName(
            data
          );

        const target =
          findUser(
            name
          );


        if (
          data?.roomId
        ) {

          const roomId =
            String(
              data.roomId
            );


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


          addModeration(
            roomId,
            "disconnected",
            name,
            admin.name
          );


          if (
            target &&
            String(
              target.roomId
            ) === roomId
          ) {

            const targetSocket =
              getUserSocket(
                target
              );

            targetSocket?.leave(
              `public:${roomId}`
            );

            target.roomId =
              null;

            targetSocket?.emit(
              "disconnected",
              "⛔ تم فصلك من الغرفة"
            );

          }


          roomNotice(
            roomId,
            `⛔ تم فصل ${name} من الغرفة`,
            "disconnect"
          );


          io.to(
            `public:${roomId}`
          ).emit(
            "room users",
            getRoomUsers(
              roomId
            )
          );


          return;

        }


        if (
          !requireGlobal(
            "disconnect"
          )
        ) {

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        getUserSocket(
          target
        )?.emit(
          "disconnected",
          "⛔ تم فصلك"
        );


        getUserSocket(
          target
        )?.disconnect(
          true
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
          String(
            data?.roomId ||
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
                String(
                  message.id
                ) !==
                String(
                  data?.messageId
                )
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

              messageId:
                data?.messageId

            }
          );


          return;

        }


        if (
          !requireGlobal(
            "deleteMessage"
          )
        ) {

          return;

        }


        io.emit(
          "message deleted",
          {
            messageId:
              data?.messageId
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
            "❌ غير مصرح بإنشاء الغرف"
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


        if (
          rooms.some(
            room =>
              room.name.toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "room error",
            "❌ اسم الغرفة موجود بالفعل"
          );

          return;

        }


        const room =
          normalizeRoom({

            id:
              createId(),

            name,

            description,

            enabled:
              true,

            settings: {}

          });


        rooms.push(
          room
        );


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
          `🏠 تم إنشاء الغرفة ${name}`
        );

      }
    );


    /* =====================================================
       ADD ROOM ALIAS
       ===================================================== */

    socket.on(
      "add room",
      data => {

        socket.emit(
          "room alias",
          {

            ok:
              true,

            event:
              "create room"

          }
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

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          data?.name
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
          room
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

          socket.emit(
            "room error",
            "❌ غير مصرح"
          );

          return;

        }


        if (
          data?.name
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
            );

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
          rooms
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


    /* =====================================================
       DELETE ROOM
       ===================================================== */

    socket.on(
      "delete room",
      data => {

        const admin =
          getAdmin(socket);

        const roomId =
          String(
            data?.roomId ||
            ""
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


        const room =
          getRoom(
            roomId
          );


        if (!room) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;

        }


        rooms =
          rooms.filter(
            item =>
              String(
                item.id
              ) !==
              roomId
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


        for (
          const user
          of users
        ) {

          if (
            String(
              user.roomId
            ) === roomId
          ) {

            getUserSocket(
              user
            )?.leave(
              `public:${roomId}`
            );

            user.roomId =
              null;

          }

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
          roomModerationData
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
          `🗑️ تم حذف الغرفة ${room.name}`
        );

      }
    );


    /* =====================================================
       TOGGLE ROOM
       ===================================================== */

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
            : room.enabled ===
              false;


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


        let permission =
          "roomSettings";


        if (
          key === "stars" ||
          key === "starsMode"
        ) {

          permission =
            "stars";

        } else if (
          key === "maintenance"
        ) {

          permission =
            "maintenance";

        } else if (
          key === "chatLock" ||
          key === "chatLocked"
        ) {

          permission =
            "chatLock";

        }


        if (
          !room ||
          !canRoom(
            admin,
            room.id,
            permission
          )
        ) {

          socket.emit(
            "room error",
            "❌ غير مصرح لهذا الإعداد"
          );

          return;

        }


        room.settings[
          key
        ] =
          !!data.value;


        if (
          key ===
          "chatLock"
        ) {

          room.settings.chatLocked =
            !!data.value;

        }


        if (
          key ===
          "starsMode"
        ) {

          room.settings.stars =
            !!data.value;

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

      }
    );


    /* =====================================================
       TOGGLE ROOM STARS
       ===================================================== */

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
                room.settings.stars ||
                room.settings.starsMode
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
          getRoom(
            roomId
          );


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
          !room.settings.stars &&
          !room.settings.starsMode
        ) {

          socket.emit(
            "room error",
            "⭐ النجوم غير مفعلة"
          );

          return;

        }


        if (
          String(
            user.roomId
          ) !== roomId
        ) {

          socket.emit(
            "room error",
            "❌ يجب أن تكون داخل الغرفة"
          );

          return;

        }


        const target =
          users.find(
            item =>
              item.name.toLowerCase() ===
                targetName.toLowerCase() &&
              String(
                item.roomId
              ) === roomId
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
              String(
                star.to
              ).toLowerCase() ===
                target.name.toLowerCase() &&
              String(
                star.from
              ).toLowerCase() ===
                user.name.toLowerCase()
          );


        if (exists) {

          socket.emit(
            "room error",
            "⭐ النجمة موجودة بالفعل"
          );

          return;

        }


        const star = {

          id:
            createId(),

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
        ].push(
          star
        );


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


    /* =====================================================
       REMOVE ROOM STAR
       ===================================================== */

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


        if (!user) {
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
            star =>
              !(
                String(
                  star.from
                ).toLowerCase() ===
                  user.name.toLowerCase() &&
                String(
                  star.to
                ).toLowerCase() ===
                  targetName.toLowerCase()
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


    /* =====================================================
       GET ROOM STARS
       ===================================================== */

    socket.on(
      "get room stars",
      data => {

        const roomId =
          String(
            data?.roomId ||
            ""
          );

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


    /* =====================================================
       ROOM STAR COUNT
       ===================================================== */

    socket.on(
      "get room star count",
      data => {

        const roomId =
          String(
            data?.roomId ||
            ""
          );

        const username =
          String(
            data?.username ||
            data?.name ||
            ""
          );


        ensureRoomData(
          roomId
        );


        const count =
          roomStars[
            roomId
          ].filter(
            star =>
              String(
                star.to
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
       SEND ROOM NOTICE
       ===================================================== */

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
          String(
            data?.roomId ||
            ""
          );

        const room =
          getRoom(
            roomId
          );


        if (!room) {
          return;
        }


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
       GET ROOM ADMINS
       ===================================================== */

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

          socket.emit(
            "admin error",
            "❌ غير مصرح"
          );

          return;

        }


        const list =
          admins.filter(
            item =>
              Array.isArray(
                item.assignedRooms
              ) &&
              item.assignedRooms
                .map(String)
                .includes(
                  roomId
                )
          );


        socket.emit(
          "room admins",
          list
        );

      }
    );


    /* =====================================================
       ASSIGN ROOM ADMIN
       ===================================================== */

    socket.on(
      "assign room admin",
      data => {

        const master =
          getAdmin(socket);

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
          );


        if (
          !isMaster(
            master
          )
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
          !getRoom(
            roomId
          )
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
                ...(
                  target.assignedRooms ||
                  []
                ).map(String),

                roomId

              ]
            )
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
       REMOVE ROOM ADMIN
       ===================================================== */

    socket.on(
      "remove room admin",
      data => {

        const master =
          getAdmin(socket);

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
          );


        if (
          !isMaster(
            master
          )
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
            room =>
              String(room) !==
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

        const master =
          getAdmin(socket);

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
          );


        if (
          !isMaster(
            master
          )
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
          !hasPermission(
            getAdmin(socket),
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

          socket.emit(
            "admin error",
            "❌ اكتب اسم الأدمن وكلمة المرور"
          );

          return;

        }


        if (
          admins.some(
            admin =>
              admin.name.toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "admin error",
            "❌ الأدمن موجود بالفعل"
          );

          return;

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
            [],

          roomPermissions:
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
          admins
        );


        socket.emit(
          "admin added",
          admin
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
          !hasPermission(
            getAdmin(socket),
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
          typeof data ===
          "string"
            ? data
            : data?.name;


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
          !hasPermission(
            getAdmin(socket),
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
          !hasPermission(
            getAdmin(socket),
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
       GLOBAL PRIVATE LOCK
       ===================================================== */

    socket.on(
      "toggle private lock",
      data => {

        if (
          !hasPermission(
            getAdmin(socket),
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
       STARS MODE
       ===================================================== */

    socket.on(
      "toggle stars mode",
      data => {

        if (
          data?.roomId
        ) {

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
                  room.settings.stars ||
                  room.settings.starsMode
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


          return;

        }


        if (
          !hasPermission(
            getAdmin(socket),
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
          !hasPermission(
            getAdmin(socket),
            "stars"
          )
        ) {

          return;

        }


        const name =
          targetName(
            data
          );


        if (
          !name
        ) {

          return;

        }


        if (
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
          !hasPermission(
            getAdmin(socket),
            "stars"
          )
        ) {

          return;

        }


        const name =
          targetName(
            data
          );


        stars =
          stars.filter(
            item =>
              String(
                item
              ).toLowerCase() !==
              String(
                name
              ).toLowerCase()
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


        if (
          user.roomId
        ) {

          const roomId =
            user.roomId;


          roomNotice(
            roomId,
            `🚪 غادر ${user.name} الغرفة`,
            "leave"
          );


          io.to(
            `public:${roomId}`
          ).emit(
            "room users",
            getRoomUsers(
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


/* =========================================================
   SAVE BEFORE SHUTDOWN
   ========================================================= */

function saveAll() {

  saveJSON(
    "rooms.json",
    rooms
  );

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

}


process.on(
  "SIGINT",
  () => {

    saveAll();

    process.exit(
      0
    );

  }
);


process.on(
  "SIGTERM",
  () => {

    saveAll();

    process.exit(
      0
    );

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
      `🚀 Mersal Chat running on port ${PORT}`
    );

    console.log(
      `🏠 Rooms: ${rooms.length}`
    );

  }
);
