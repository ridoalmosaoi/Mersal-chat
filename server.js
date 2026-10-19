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

/* =========================
   DATA
========================= */

let users = [];
let admins = [];

let bannedUsers = [];
let mutedUsers = [];
let deviceBannedUsers = [];

let stars = [];
let logs = [];
let rooms = [];

/* =========================
   FILE SYSTEM
========================= */

function loadFile(file, def = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(def, null, 2)
      );

      return def;
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );

  } catch (error) {
    console.log("FILE LOAD ERROR:", file, error);
    return def;
  }
}

function saveFile(file, data) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.log("FILE SAVE ERROR:", file, error);
  }
}

/* =========================
   LOAD DATA
========================= */

admins = loadFile("admins.json", []);

bannedUsers = loadFile(
  "banned.json",
  []
);

mutedUsers = loadFile(
  "muted.json",
  []
);

deviceBannedUsers = loadFile(
  "deviceBanned.json",
  []
);

stars = loadFile(
  "stars.json",
  []
);

logs = loadFile(
  "logs.json",
  []
);

rooms = loadFile(
  "rooms.json",
  []
);

/* =========================
   NORMALIZE ROOMS
========================= */

rooms = rooms.map(room => {

  return {
    id: String(
      room.id ||
      Date.now() +
      Math.random()
    ),

    name: String(
      room.name ||
      "غرفة"
    ),

    description: String(
      room.description ||
      ""
    ),

    enabled:
      room.enabled !== false,

    settings: {

      starsMode: false,

      chatLocked: false,

      maintenance: false,

      protection: true,

      ...(room.settings || {})
    }
  };

});

saveFile(
  "rooms.json",
  rooms
);

/* =========================
   LOGS
========================= */

function addLog(message) {

  const log = {
    time: new Date().toLocaleString(),
    message
  };

  logs.unshift(log);

  if (logs.length > 1000) {
    logs = logs.slice(0, 1000);
  }

  saveFile(
    "logs.json",
    logs
  );

  io.emit(
    "new log",
    log
  );

  console.log(message);
}

/* =========================
   ROOM HELPERS
========================= */

function getRoom(roomId) {

  return rooms.find(
    room =>
      String(room.id) ===
      String(roomId)
  );
}


function publicRooms() {

  return rooms
    .filter(
      room =>
        room.enabled !== false
    )
    .map(room => ({

      id: room.id,

      name: room.name,

      description:
        room.description,

      enabled:
        room.enabled,

      settings:
        room.settings

    }));

}


function sendRooms(socket) {

  socket.emit(
    "rooms list",
    publicRooms()
  );

}


function sendAdminRooms(socket) {

  if (!socket.adminData) {
    return;
  }

  const admin =
    socket.adminData;

  let list;

  if (isMaster(socket)) {

    list = rooms;

  } else {

    const roomIds =
      adminRoomIds(admin);

    list =
      rooms.filter(room =>
        roomIds.includes(
          String(room.id)
        )
      );
  }

  socket.emit(
    "admin rooms",
    list
  );
}


/* =========================
   ROOM USERS
========================= */

function onlineInRoom(roomId) {

  return users.filter(
    user =>
      String(user.roomId) ===
      String(roomId)
  );

}


function broadcastRoomUsers(roomId) {

  io
    .to("room:" + roomId)
    .emit(
      "room users",
      onlineInRoom(roomId)
    );

}


/* =========================
   USERNAME
========================= */

function normalizeName(name) {

  return String(
    name || ""
  ).trim();

}


function validUsername(name) {

  if (!name) {
    return false;
  }

  if (name.length < 2) {
    return false;
  }

  if (name.length > 24) {
    return false;
  }

  /*
     ممنوع استخدام رموز
     رتب الإدارة
  */

  if (/[&@]/.test(name)) {
    return false;
  }

  return true;
}


/* =========================
   ADMIN
========================= */

function isMaster(socket) {

  if (!socket.adminData) {
    return false;
  }

  return (
    socket.adminData.master === true ||
    socket.adminData.role === "master"
  );
}


function adminRoomIds(admin) {

  if (
    !admin ||
    !Array.isArray(admin.rooms)
  ) {

    return [];
  }

  return admin.rooms.map(
    String
  );
}


function canRoom(
  socket,
  roomId
) {

  if (!socket.adminData) {
    return false;
  }

  if (isMaster(socket)) {
    return true;
  }

  return adminRoomIds(
    socket.adminData
  ).includes(
    String(roomId)
  );
}


function hasPermission(
  socket,
  permission
) {

  if (!socket.adminData) {
    return false;
  }

  if (isMaster(socket)) {
    return true;
  }

  return (
    socket.adminData.permissions &&
    socket.adminData.permissions[
      permission
    ] === true
  );
}


function canManage(
  socket,
  roomId,
  permission
) {

  return (
    canRoom(
      socket,
      roomId
    ) &&
    hasPermission(
      socket,
      permission
    )
  );

}


/* =========================
   STAR
========================= */

function hasRoomStar(
  roomId,
  username
) {

  return stars.some(
    star =>
      typeof star === "object" &&
      String(star.roomId) ===
        String(roomId) &&
      star.username === username
  );

}


/* =========================
   API
========================= */

app.get(
  "/banned.json",
  (req, res) => {

    res.json(
      bannedUsers
    );

  }
);


app.get(
  "/muted.json",
  (req, res) => {

    res.json(
      mutedUsers
    );

  }
);


app.get(
  "/deviceBanned.json",
  (req, res) => {

    res.json(
      deviceBannedUsers
    );

  }
);


app.get(
  "/rooms.json",
  (req, res) => {

    res.json(
      publicRooms()
    );

  }
);


/* =========================
   SOCKET CONNECTION
========================= */

io.on(
  "connection",
  socket => {

    console.log(
      "CONNECTED:",
      socket.id
    );


    /* =========================
       CHECK ADMIN
    ========================= */

    socket.on(
      "check admin",
      name => {

        const admin =
          admins.find(
            a =>
              a.name?.toLowerCase() ===
              String(name || "")
                .toLowerCase()
          );

        socket.emit(
          "admin check result",
          !!admin
        );

      }
    );


    /* =========================
       LOGIN
    ========================= */

    socket.on(
      "join",
      data => {

        const username =
          normalizeName(
            data?.username
          );


        /* USERNAME */

        if (
          !validUsername(
            username
          )
        ) {

          socket.emit(
            "banned",
            "❌ اسم المستخدم غير مسموح"
          );

          return;
        }


        /* DUPLICATE */

        if (
          users.some(
            user =>
              user.username
                .toLowerCase() ===
              username.toLowerCase()
          )
        ) {

          socket.emit(
            "banned",
            "⚠️ الاسم مستخدم بالفعل"
          );

          return;
        }


        /* DEVICE */

        const device =
          data?.deviceToken ||
          socket.handshake.headers[
            "user-agent"
          ] ||
          "";


        /* IP */

        const ip =
          socket.handshake.address;


        /* GLOBAL DEVICE BAN */

        if (
          deviceBannedUsers.some(
            item =>
              item.device ===
              device &&
              !item.roomId
          )
        ) {

          socket.emit(
            "banned",
            "⛔ الجهاز محظور"
          );

          return;
        }


        /* GLOBAL IP BAN */

        if (
          bannedUsers.some(
            item =>
              item.ip === ip &&
              !item.roomId
          )
        ) {

          socket.emit(
            "banned",
            "🚫 أنت محظور"
          );

          return;
        }


        /* ADMIN */

        const admin =
          admins.find(
            a =>
              a.name?.toLowerCase() ===
              username.toLowerCase()
          );


        if (
          admin &&
          admin.password !==
            data?.adminPassword
        ) {

          socket.emit(
            "banned",
            "🚫 كلمة سر الأدمن خاطئة"
          );

          return;
        }


        socket.username =
          username;

        socket.adminData =
          admin || null;


        const user = {

          id:
            socket.id,

          username:
            username,

          color:
            data?.color ||
            "#ffd700",

          ip:
            ip,

          device:
            device,

          isAdmin:
            !!admin,

          role:
            admin
              ? (
                  isMaster(socket)
                    ? "&"
                    : "@"
                )
              : "",

          roomId:
            null

        };


        users.push(
          user
        );


        socket.emit(
          "login success",
          {

            user:

              user,

            rooms:
              publicRooms(),

            isAdmin:
              !!admin

          }
        );


        io.emit(
          "online users",
          users
        );


        addLog(
          `👤 ${username} دخل`
        );


        if (admin) {

          socket.emit(
            "admin assigned rooms",
            admin.rooms || []
          );

        }

      }
    );


    /* =========================
       GET ROOMS
    ========================= */

    socket.on(
      "get rooms",
      () => {

        sendRooms(
          socket
        );

      }
    );


    /* =========================
       JOIN ROOM
    ========================= */

    socket.on(
      "join room",
      roomId => {

        const room =
          getRoom(roomId);

        const user =
          users.find(
            u =>
              u.id ===
              socket.id
          );


        if (
          !user ||
          !room ||
          room.enabled === false
        ) {

          socket.emit(
            "room error",
            "❌ الغرفة غير متاحة"
          );

          return;
        }


        /* ROOM BAN */

        const banned =
          bannedUsers.some(
            ban =>

              String(
                ban.roomId
              ) ===
              String(
                room.id
              ) &&

              (
                ban.username ===
                user.username ||

                ban.ip ===
                user.ip
              )
          );


        if (
          banned &&
          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "🚫 أنت محظور من هذه الغرفة"
          );

          return;
        }


        /* ROOM DEVICE BAN */

        const deviceBan =
          deviceBannedUsers.some(
            item =>

              String(
                item.roomId
              ) ===
              String(
                room.id
              ) &&

              (
                item.username ===
                user.username ||

                item.device ===
                user.device
              )
          );


        if (
          deviceBan &&
          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "⛔ جهازك مفصول من هذه الغرفة"
          );

          return;
        }


        /*
           إزالة الغرفة السابقة
        */

        if (user.roomId) {

          const oldRoom =
            user.roomId;

          socket.leave(
            "room:" + oldRoom
          );

          user.roomId =
            null;

          socket.roomId =
            null;

          broadcastRoomUsers(
            oldRoom
          );

        }


        /* JOIN */

        user.roomId =
          room.id;

        socket.roomId =
          room.id;


        socket.join(
          "room:" + room.id
        );


        socket.emit(
          "room joined",
          {

            room:
              room,

            user:
              {
                ...user,

                role:
                  socket.adminData
                    ? (
                        isMaster(socket)
                          ? "&"
                          : "@"
                      )
                    : ""
              }

          }
        );


        socket.emit(
          "room settings",
          room.settings
        );


        broadcastRoomUsers(
          room.id
        );


        io.emit(
          "online users",
          users
        );


        /*
           ADMIN INSIDE ASSIGNED ROOM
        */

        if (
          socket.adminData &&
          canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "room admin active",
            {

              roomId:
                room.id,

              role:
                isMaster(socket)
                  ? "&"
                  : "@",

              permissions:
                socket.adminData
                  .permissions || {}

            }
          );


          socket.emit(
            "room notice",
            `✨ تم توكيل ${socket.username}`
          );

        }

      }
    );


    /* =========================
       LEAVE ROOM
    ========================= */

    socket.on(
      "leave room",
      () => {

        if (
          !socket.roomId
        ) {

          return;
        }


        const oldRoom =
          socket.roomId;


        socket.leave(
          "room:" + oldRoom
        );


        socket.roomId =
          null;


        const user =
          users.find(
            u =>
              u.id ===
              socket.id
          );


        if (user) {

          user.roomId =
            null;

        }


        broadcastRoomUsers(
          oldRoom
        );

      }
    );


    /* =========================
       PUBLIC CHAT
    ========================= */

    socket.on(
      "chat message",
      data => {

        const user =
          users.find(
            u =>
              u.id ===
              socket.id
          );


        if (!user) {
          return;
        }


        const room =
          getRoom(
            user.roomId
          );


        if (!room) {
          return;
        }


        /* MAINTENANCE */

        if (
          room.settings
            .maintenance &&
          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "🛠️ الغرفة في وضع الصيانة"
          );

          return;
        }


        /* CHAT LOCK */

        if (
          room.settings
            .chatLocked &&
          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "🔒 الدردشة مقفلة"
          );

          return;
        }


        /* STARS MODE */

        if (
          room.settings
            .starsMode &&

          !hasRoomStar(
            room.id,
            user.username
          ) &&

          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "⭐ الكتابة متاحة لأصحاب النجمة فقط"
          );

          return;
        }


        /* MUTE */

        const muted =
          mutedUsers.some(
            item =>

              String(
                item.roomId
              ) ===
              String(
                room.id
              ) &&

              (
                item.username ===
                user.username
              )
          );


        if (
          muted &&
          !canRoom(
            socket,
            room.id
          )
        ) {

          socket.emit(
            "banned",
            "🔇 أنت مكتوم في هذه الغرفة"
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


        const role =
          user.isAdmin
            ? (
                isMaster(socket)
                  ? "&"
                  : "@"
              )
            : "";


        io
          .to(
            "room:" +
            room.id
          )
          .emit(
            "chat message",
            {

              id:
                user.id,

              username:
                user.username,

              message:
                message,

              color:
                user.color,

              reply:
                data?.reply ||
                null,

              roomId:
                room.id,

              role:
                role

            }
          );

      }
    );


    /* =========================
       PRIVATE MESSAGE
    ========================= */

    socket.on(
      "private message",
      data => {

        if (
          !data?.to ||
          !data?.message
        ) {

          return;
        }


        io
          .to(data.to)
          .emit(
            "private message",
            {

              from:
                socket.username,

              fromId:
                socket.id,

              to:
                data.to,

              message:
                String(
                  data.message
                )

            }
          );

      }
    );


    /* =========================
       ADMIN LOGIN
    ========================= */

    socket.on(
      "admin panel login",
      data => {

        const admin =
          admins.find(
            a =>
              a.name ===
              data?.name &&
              a.password ===
              data?.password
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

            master:
              isMaster(socket),

            rooms:
              admin.rooms ||
              []

          }
        );


        socket.emit(
          "admin online users",
          users
        );


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


        sendAdminRooms(
          socket
        );


        socket.emit(
          "admins list",
          admins
        );

      }
    );


    /* =========================
       GET ADMIN ROOMS
    ========================= */

    socket.on(
      "get admin rooms",
      () => {

        sendAdminRooms(
          socket
        );

      }
    );


    /* =========================
       GET ADMINS
    ========================= */

    socket.on(
      "get admins",
      () => {

        if (
          !socket.adminData
        ) {

          return;
        }


        socket.emit(
          "admins list",
          admins
        );

      }
    );


    /* =========================
       CREATE ROOM
    ========================= */

    socket.on(
      "create room",
      data => {

        if (
          !hasPermission(
            socket,
            "manageRooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ لا تملك صلاحية إدارة الغرف"
          );

          return;
        }


        const name =
          normalizeName(
            data?.name
          );


        if (!name) {

          socket.emit(
            "room error",
            "❌ اسم الغرفة مطلوب"
          );

          return;
        }


        const room = {

          id:
            Date.now()
              .toString(36) +

            Math.random()
              .toString(36)
              .slice(2, 7),

          name:
            name,

          description:
            normalizeName(
              data?.description
            ),

          enabled:
            true,

          settings: {

            starsMode:
              false,

            chatLocked:
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


        saveFile(
          "rooms.json",
          rooms
        );


        addLog(
          `🏠 تم إنشاء الغرفة ${name}`
        );


        sendAdminRooms(
          socket
        );


        io.emit(
          "rooms list",
          publicRooms()
        );

      }
    );


    /* =========================
       UPDATE ROOM
    ========================= */

    socket.on(
      "update room",
      data => {

        const room =
          getRoom(
            data?.id
          );


        if (!room) {

          socket.emit(
            "room error",
            "❌ الغرفة غير موجودة"
          );

          return;
        }


        if (
          !canManage(
            socket,
            room.id,
            "manageRooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ لا تملك صلاحية تعديل هذه الغرفة"
          );

          return;
        }


        if (
          data?.name
        ) {

          room.name =
            normalizeName(
              data.name
            );

        }


        room.description =
          normalizeName(
            data?.description
          );


        saveFile(
          "rooms.json",
          rooms
        );


        sendAdminRooms(
          socket
        );


        io.emit(
          "rooms list",
          publicRooms()
        );

      }
    );


    /* =========================
       TOGGLE ROOM
    ========================= */

    socket.on(
      "toggle room",
      roomId => {

        const room =
          getRoom(
            roomId
          );


        if (!room) {
          return;
        }


        if (
          !canManage(
            socket,
            roomId,
            "manageRooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ لا تملك صلاحية إدارة هذه الغرفة"
          );

          return;
        }


        room.enabled =
          !room.enabled;


        saveFile(
          "rooms.json",
          rooms
        );


        sendAdminRooms(
          socket
        );


        io.emit(
          "rooms list",
          publicRooms()
        );

      }
    );


    /* =========================
       DELETE ROOM
    ========================= */

    socket.on(
      "delete room",
      roomId => {

        const room =
          getRoom(
            roomId
          );


        if (!room) {
          return;
        }


        if (
          !canManage(
            socket,
            roomId,
            "manageRooms"
          )
        ) {

          socket.emit(
            "room error",
            "❌ لا تملك صلاحية حذف هذه الغرفة"
          );

          return;
        }


        /*
           إخراج الموجودين
        */

        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room deleted",
            roomId
          );


        rooms =
          rooms.filter(
            r =>
              String(r.id) !==
              String(roomId)
          );


        saveFile(
          "rooms.json",
          rooms
        );


        io.emit(
          "rooms list",
          publicRooms()
        );


        sendAdminRooms(
          socket
        );


        addLog(
          `🗑️ تم حذف غرفة ${room.name}`
        );

      }
    );


    /* =========================
       ROOM SETTINGS
    ========================= */

    socket.on(
      "update room setting",
      data => {

        const room =
          getRoom(
            data?.roomId
          );


        if (!room) {
          return;
        }


        if (
          !canRoom(
            socket,
            room.id
          )
        ) {

          return;
        }


        const permissionMap = {

          starsMode:
            "stars",

          chatLocked:
            "chatLock",

          maintenance:
            "maintenance",

          protection:
            "protection"

        };


        const permission =
          permissionMap[
            data?.key
          ];


        if (!permission) {
          return;
        }


        if (
          !hasPermission(
            socket,
            permission
          )
        ) {

          return;
        }


        room.settings[
          data.key
        ] = !!data.value;


        saveFile(
          "rooms.json",
          rooms
        );


        io
          .to(
            "room:" +
            room.id
          )
          .emit(
            "room settings",
            room.settings
          );


        addLog(
          `⚙️ ${data.key} في ${room.name}: ${
            data.value
              ? "ON"
              : "OFF"
          }`
        );

      }
    );


    /* =========================
       MODERATION
    ========================= */

    function moderate(
      targetId,
      action
    ) {

      const target =
        users.find(
          u =>
            u.id ===
            targetId
        );


      const roomId =
        socket.roomId;


      if (
        !target ||
        !roomId
      ) {

        return;
      }


      if (
        String(
          target.roomId
        ) !==
        String(roomId)
      ) {

        return;
      }


      if (
        !canManage(
          socket,
          roomId,
          action
        )
      ) {

        return;
      }


      const room =
        getRoom(
          roomId
        );


      /* KICK */

      if (
        action ===
        "kick"
      ) {

        io
          .to(target.id)
          .emit(
            "banned",
            "👢 تم طردك من الغرفة"
          );


        const targetSocket =
          io.sockets.sockets.get(
            target.id
          );


        if (targetSocket) {

          targetSocket.leave(
            "room:" +
            roomId
          );

          targetSocket.roomId =
            null;

        }


        target.roomId =
          null;


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "kick",

              username:
                target.username,

              message:
                `👢 تم طرد ${target.username} من الغرفة`

            }
          );


        broadcastRoomUsers(
          roomId
        );

      }


      /* BAN */

      if (
        action ===
        "ban"
      ) {

        if (
          !bannedUsers.some(
            item =>
              String(
                item.roomId
              ) ===
              String(roomId) &&

              item.username ===
              target.username
          )
        ) {

          bannedUsers.push({

            ip:
              target.ip,

            roomId:
              roomId,

            username:
              target.username

          });

        }


        saveFile(
          "banned.json",
          bannedUsers
        );


        io
          .to(target.id)
          .emit(
            "banned",
            "🚫 تم حظرك من الغرفة"
          );


        const targetSocket =
          io.sockets.sockets.get(
            target.id
          );


        if (targetSocket) {

          targetSocket.leave(
            "room:" +
            roomId
          );

          targetSocket.roomId =
            null;

        }


        target.roomId =
          null;


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "ban",

              username:
                target.username,

              message:
                `🚫 تم حظر ${target.username} من الغرفة`

            }
          );


        broadcastRoomUsers(
          roomId
        );

      }


      /* MUTE */

      if (
        action ===
        "mute"
      ) {

        if (
          !mutedUsers.some(
            item =>
              String(
                item.roomId
              ) ===
              String(roomId) &&

              item.username ===
              target.username
          )
        ) {

          mutedUsers.push({

            username:
              target.username,

            roomId:
              roomId

          });

        }


        saveFile(
          "muted.json",
          mutedUsers
        );


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "mute",

              username:
                target.username,

              message:
                `🔇 تم كتم ${target.username}`

            }
          );

      }


      /* DISCONNECT */

      if (
        action ===
        "disconnect"
      ) {

        if (
          !deviceBannedUsers.some(
            item =>
              String(
                item.roomId
              ) ===
              String(roomId) &&

              item.device ===
              target.device
          )
        ) {

          deviceBannedUsers.push({

            device:
              target.device,

            username:
              target.username,

            roomId:
              roomId

          });

        }


        saveFile(
          "deviceBanned.json",
          deviceBannedUsers
        );


        io
          .to(target.id)
          .emit(
            "banned",
            "⛔ تم فصلك من الغرفة"
          );


        const targetSocket =
          io.sockets.sockets.get(
            target.id
          );


        if (targetSocket) {

          targetSocket.leave(
            "room:" +
            roomId
          );

          targetSocket.roomId =
            null;

        }


        target.roomId =
          null;


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "disconnect",

              username:
                target.username,

              message:
                `⛔ تم فصل ${target.username} من الغرفة`

            }
          );


        broadcastRoomUsers(
          roomId
        );

      }

    }


    socket.on(
      "kick user",
      id =>
        moderate(
          id,
          "kick"
        )
    );


    socket.on(
      "ban user",
      id =>
        moderate(
          id,
          "ban"
        )
    );


    socket.on(
      "mute user",
      id =>
        moderate(
          id,
          "mute"
        )
    );


    socket.on(
      "disconnect user",
      id =>
        moderate(
          id,
          "disconnect"
        )
    );


    /* =========================
       GIVE STAR
    ========================= */

    socket.on(
      "give star",
      username => {

        const roomId =
          socket.roomId;


        if (
          !roomId ||
          !canManage(
            socket,
            roomId,
            "stars"
          )
        ) {

          return;
        }


        if (
          !hasRoomStar(
            roomId,
            username
          )
        ) {

          stars.push({

            username:
              username,

            roomId:
              roomId

          });


          saveFile(
            "stars.json",
            stars
          );


          io
            .to(
              "room:" +
              roomId
            )
            .emit(
              "star update",
              {

                username:
                  username,

                roomId:
                  roomId,

                hasStar:
                  true

              }
            );


          addLog(
            `⭐ تم إعطاء ${username} نجمة في الغرفة ${roomId}`
          );

        }

      }
    );


    /* =========================
       REMOVE STAR
    ========================= */

    socket.on(
      "remove star",
      username => {

        const roomId =
          socket.roomId;


        if (
          !roomId ||
          !canManage(
            socket,
            roomId,
            "stars"
          )
        ) {

          return;
        }


        stars =
          stars.filter(
            star =>
              !(
                star.username ===
                username &&

                String(
                  star.roomId
                ) ===
                String(roomId)
              )
          );


        saveFile(
          "stars.json",
          stars
        );


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "star update",
            {

              username:
                username,

              roomId:
                roomId,

              hasStar:
                false

            }
          );


        addLog(
          `⭐❌ تم سحب النجمة من ${username}`
        );

      }
    );


    /* =========================
       VIEW USER
    ========================= */

    socket.on(
      "view user",
      id => {

        if (
          !hasPermission(
            socket,
            "viewUserInfo"
          )
        ) {

          return;
        }


        const user =
          users.find(
            u =>
              u.id ===
              id
          );


        if (user) {

          socket.emit(
            "user info",
            user
          );

        }

      }
    );


    /* =========================
       ADD ADMIN
    ========================= */

    socket.on(
      "add admin",
      data => {

        if (
          !hasPermission(
            socket,
            "addAdmin"
          )
        ) {

          return;
        }


        const name =
          normalizeName(
            data?.name
          );


        if (
          admins.some(
            admin =>
              admin.name
                ?.toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          socket.emit(
            "admin exists"
          );

          return;
        }


        const admin = {

          name:
            name,

          password:
            String(
              data?.password ||
              ""
            ),

          permissions:
            data?.permissions ||
            {},

          rooms:
            Array.isArray(
              data?.rooms
            )
              ? data.rooms.map(
                  String
                )
              : [],

          master:
            data?.master === true

        };


        admins.push(
          admin
        );


        saveFile(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );


        addLog(
          `👮 تمت إضافة الأدمن ${name}`
        );

      }
    );


    /* =========================
       UPDATE ADMIN
    ========================= */

    socket.on(
      "update admin",
      data => {

        if (
          !hasPermission(
            socket,
            "addAdmin"
          )
        ) {

          return;
        }


        const admin =
          admins.find(
            a =>
              a.name ===
              data?.name
          );


        if (!admin) {
          return;
        }


        if (
          data.password !==
          undefined
        ) {

          admin.password =
            data.password;

        }


        if (
          data.permissions
        ) {

          admin.permissions =
            data.permissions;

        }


        if (
          Array.isArray(
            data.rooms
          )
        ) {

          admin.rooms =
            data.rooms.map(
              String
            );

        }


        if (
          data.master !==
          undefined
        ) {

          admin.master =
            !!data.master;

        }


        saveFile(
          "admins.json",
          admins
        );


        io.emit(
          "admins list",
          admins
        );


        addLog(
          `✏️ تم تحديث الأدمن ${admin.name}`
        );

      }
    );


    /* =========================
       REMOVE ADMIN
    ========================= */

    socket.on(
      "remove admin",
      name => {

        if (
          !hasPermission(
            socket,
            "addAdmin"
          )
        ) {

          return;
        }


        admins =
          admins.filter(
            admin =>
              admin.name !==
              name
          );


        saveFile(
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


    /* =========================
       UNBAN
    ========================= */

    socket.on(
      "unban user",
      id => {

        const user =
          users.find(
            u =>
              u.id ===
              id
          );


        const roomId =
          socket.roomId;


        if (
          !user ||
          !roomId
        ) {

          return;
        }


        if (
          !canManage(
            socket,
            roomId,
            "unban"
          )
        ) {

          return;
        }


        bannedUsers =
          bannedUsers.filter(
            ban =>
              !(
                String(
                  ban.roomId
                ) ===
                String(roomId) &&

                ban.username ===
                user.username
              )
          );


        saveFile(
          "banned.json",
          bannedUsers
        );


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "unban",

              username:
                user.username,

              message:
                `🔓 تم فك حظر ${user.username}`

            }
          );

      }
    );


    /* =========================
       UNMUTE
    ========================= */

    socket.on(
      "unmute user",
      id => {

        const user =
          users.find(
            u =>
              u.id ===
              id
          );


        const roomId =
          socket.roomId;


        if (
          !user ||
          !roomId
        ) {

          return;
        }


        if (
          !canManage(
            socket,
            roomId,
            "unmute"
          )
        ) {

          return;
        }


        mutedUsers =
          mutedUsers.filter(
            mute =>
              !(
                String(
                  mute.roomId
                ) ===
                String(roomId) &&

                mute.username ===
                user.username
              )
          );


        saveFile(
          "muted.json",
          mutedUsers
        );


        io
          .to(
            "room:" +
            roomId
          )
          .emit(
            "room moderation",
            {

              type:
                "unmute",

              username:
                user.username,

              message:
                `🔊 تم فك كتم ${user.username}`

            }
          );

      }
    );


    /* =========================
       UNDISCONNECT
    ========================= */

    socket.on(
      "undisconnect user",
      id => {

        const user =
          users.find(
            u =>
              u.id ===
              id
          );


        const roomId =
          socket.roomId;


        if (
          !user ||
          !roomId
        ) {

          return;
        }


        if (
          !canManage(
            socket,
            roomId,
            "undisconnect"
          )
        ) {

          return;
        }


        deviceBannedUsers =
          deviceBannedUsers.filter(
            item =>
              !(
                String(
                  item.roomId
                ) ===
                String(roomId) &&

                item.device ===
                user.device
              )
          );


        saveFile(
          "deviceBanned.json",
          deviceBannedUsers
        );

      }
    );


    /* =========================
       LEGACY GLOBAL ACTIONS
    ========================= */

    socket.on(
      "unban ip",
      ip => {

        if (
          !hasPermission(
            socket,
            "unban"
          )
        ) {

          return;
        }


        bannedUsers =
          bannedUsers.filter(
            ban =>
              ban.ip !== ip
          );


        saveFile(
          "banned.json",
          bannedUsers
        );

      }
    );


    socket.on(
      "undisconnect device",
      device => {

        if (
          !hasPermission(
            socket,
            "undisconnect"
          )
        ) {

          return;
        }


        deviceBannedUsers =
          deviceBannedUsers.filter(
            item =>
              item.device !==
              device
          );


        saveFile(
          "deviceBanned.json",
          deviceBannedUsers
        );

      }
    );


    socket.on(
      "unban all",
      () => {

        if (
          !hasPermission(
            socket,
            "unban"
          )
        ) {

          return;
        }


        bannedUsers =
          [];


        saveFile(
          "banned.json",
          bannedUsers
        );

      }
    );


    socket.on(
      "unmute all",
      () => {

        if (
          !hasPermission(
            socket,
            "unmute"
          )
        ) {

          return;
        }


        mutedUsers =
          [];


        saveFile(
          "muted.json",
          mutedUsers
        );

      }
    );


    socket.on(
      "undisconnect all",
      () => {

        if (
          !hasPermission(
            socket,
            "undisconnect"
          )
        ) {

          return;
        }


        deviceBannedUsers =
          [];


        saveFile(
          "deviceBanned.json",
          deviceBannedUsers
        );

      }
    );


    /* =========================
       DISCONNECT
    ========================= */

    socket.on(
      "disconnect",
      () => {

        const user =
          users.find(
            u =>
              u.id ===
              socket.id
          );


        const roomId =
          user?.roomId;


        users =
          users.filter(
            u =>
              u.id !==
              socket.id
          );


        if (roomId) {

          broadcastRoomUsers(
            roomId
          );

        }


        io.emit(
          "online users",
          users
        );


        addLog(
          `👋 ${socket.username || "مستخدم"} خرج`
        );

      }
    );

  }
);


/* =========================
   SERVER
========================= */

const PORT =
  process.env.PORT ||
  3000;


server.listen(
  PORT,
  () => {

    console.log(
      "🚀 Mersal Chat Server Running on port " +
      PORT
    );

  }
);
