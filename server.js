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
   DATA
========================================================= */

let users = [];

let chatLocked = false;
let privateLocked = false;
let maintenanceMode = false;
let starsMode = false;

let admins = [];
let bannedUsers = [];
let mutedUsers = [];
let deviceBannedUsers = [];
let stars = [];
let logs = [];

/*
   ROOMS
   كل غرفة تكون بهذا الشكل:

   {
       id: "room_xxxxx",
       name: "اسم الغرفة",
       description: "وصف الغرفة",
       enabled: true
   }
*/

let rooms = [];


/* =========================================================
   FILE SYSTEM
========================================================= */

function loadFile(file, def = []) {

    try {

        if (!fs.existsSync(file)) {

            fs.writeFileSync(
                file,
                JSON.stringify(
                    def,
                    null,
                    2
                )
            );

            return def;
        }

        return JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    } catch (error) {

        console.log(
            "File load error:",
            file,
            error
        );

        return def;
    }
}


function saveFile(file, data) {

    try {

        fs.writeFileSync(
            file,
            JSON.stringify(
                data,
                null,
                2
            )
        );

    } catch (error) {

        console.log(
            "File save error:",
            file,
            error
        );
    }
}


/* =========================================================
   LOAD DATA
========================================================= */

admins =
    loadFile(
        "admins.json"
    );

stars =
    loadFile(
        "stars.json"
    );

bannedUsers =
    loadFile(
        "banned.json"
    );

mutedUsers =
    loadFile(
        "muted.json"
    );

deviceBannedUsers =
    loadFile(
        "deviceBanned.json"
    );

logs =
    loadFile(
        "logs.json"
    );

rooms =
    loadFile(
        "rooms.json"
    );


/* =========================================================
   ROOM NORMALIZATION
========================================================= */

if (!Array.isArray(rooms)) {
    rooms = [];
}

rooms = rooms
    .filter(room => room && room.id)
    .map(room => {

        return {
            id: String(room.id),
            name: String(room.name || "غرفة"),
            description: String(
                room.description || ""
            ),
            enabled:
                room.enabled !== false
        };

    });

saveFile(
    "rooms.json",
    rooms
);


/* =========================================================
   LOG
========================================================= */

function addLog(message) {

    const log = {

        time:
            new Date()
                .toLocaleString(),

        message

    };

    logs.unshift(log);

    /*
       لا نخلي ملف السجلات يكبر إلى ما لا نهاية
    */

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


/* =========================================================
   ROOM HELPERS
========================================================= */

function getRoom(roomId) {

    return rooms.find(
        room =>
            room.id === String(roomId)
    );
}


function sendRooms(target) {

    const data =
        rooms.map(room => ({
            id: room.id,
            name: room.name,
            description: room.description,
            enabled: room.enabled
        }));

    target.emit(
        "rooms list",
        data
    );
}


function generateRoomId() {

    return (
        "room_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .substring(2, 8)
    );
}


/* =========================================================
   ADMIN API
========================================================= */

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


/* =========================================================
   SOCKET
========================================================= */

io.on(
    "connection",
    socket => {


        /* =================================================
           CHECK ADMIN
        ================================================= */

        socket.on(
            "check admin",
            name => {

                const isAdmin =
                    admins.some(
                        admin =>
                            admin.name
                                .toLowerCase() ===
                            String(name)
                                .toLowerCase()
                    );

                socket.emit(
                    "admin check result",
                    isAdmin
                );

            }
        );


        /* =================================================
           USER JOIN
        ================================================= */

        socket.on(
            "join",
            data => {

                const username =
                    data.username?.trim();

                if (!username) {
                    return;
                }

                socket.username =
                    username;


                /* PREVENT DUPLICATE */

                const exists =
                    users.find(
                        user =>
                            user.username
                                .toLowerCase() ===
                            username
                                .toLowerCase()
                    );

                if (exists) {

                    socket.emit(
                        "banned",
                        "⚠️ الاسم مستخدم"
                    );

                    return;
                }


                /* DEVICE */

                const device =
                    data.deviceToken ||
                    socket.handshake
                        .headers[
                            "user-agent"
                        ];


                /* IP */

                const ip =
                    socket.handshake.address;


                /* DEVICE BAN */

                const deviceBlocked =
                    deviceBannedUsers.find(
                        d =>
                            d.device ===
                            device
                    );

                if (deviceBlocked) {

                    socket.emit(
                        "banned",
                        "⛔ الجهاز محظور"
                    );

                    return;
                }


                /* NORMAL BAN */

                const banned =
                    bannedUsers.find(
                        b =>
                            b.ip === ip
                    );

                if (banned) {

                    socket.emit(
                        "banned",
                        "🚫 محظور"
                    );

                    return;
                }


                /* ADMIN CHECK */

                const admin =
                    admins.find(
                        a =>
                            a.name
                                .toLowerCase() ===
                            username
                                .toLowerCase()
                    );


                if (admin) {

                    if (
                        admin.password !==
                        data.adminPassword
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

                    username,

                    color:
                        data.color ||
                        "#ffd700",

                    ip,

                    device,

                    isAdmin:
                        !!admin

                };


                users.push(user);


                /*
                   نخزن قائمة الغرف المفتوحة
                   لهذا الاتصال.
                */

                socket.publicRooms =
                    new Set();


                socket.emit(
                    "login success"
                );


                io.emit(
                    "online users",
                    users
                );


                /*
                   بعد تسجيل الدخول
                   نرسل الغرف للمستخدم.
                */

                sendRooms(socket);


                addLog(
                    `👤 ${username} دخل`
                );

            }
        );


        /* =================================================
           GET ROOMS
        ================================================= */

        socket.on(
            "get rooms",
            () => {

                sendRooms(socket);

            }
        );


        /* =================================================
           JOIN ROOM
        ================================================= */

        socket.on(
            "join room",
            roomId => {

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
                    getRoom(roomId);


                if (!room) {

                    socket.emit(
                        "room error",
                        "❌ الغرفة غير موجودة"
                    );

                    return;
                }


                if (!room.enabled) {

                    socket.emit(
                        "room error",
                        "🚫 هذه الغرفة معطلة"
                    );

                    return;
                }


                /*
                   إذا كان داخل الغرفة
                   لا نعيد إضافتها.
                */

                if (
                    socket.publicRooms.has(
                        room.id
                    )
                ) {

                    socket.emit(
                        "room joined",
                        room
                    );

                    return;
                }


                /*
                   حد أقصى 3 غرف
                */

                if (
                    socket.publicRooms.size >= 3
                ) {

                    socket.emit(
                        "room limit",
                        {
                            max: 3,
                            message:
                                "⚠️ يمكنك فتح 3 غرف عامة كحد أقصى"
                        }
                    );

                    return;
                }


                /*
                   Socket.IO room
                */

                socket.join(
                    "public:" +
                    room.id
                );


                socket.publicRooms.add(
                    room.id
                );


                socket.emit(
                    "room joined",
                    room
                );


                /*
                   إعلام الموجودين
                */

                socket
                    .to(
                        "public:" +
                        room.id
                    )
                    .emit(
                        "room user joined",
                        {
                            id:
                                user.id,
                            username:
                                user.username
                        }
                    );


                addLog(
                    `🏠 ${user.username} دخل غرفة ${room.name}`
                );

            }
        );


        /* =================================================
           LEAVE ROOM
        ================================================= */

        socket.on(
            "leave room",
            roomId => {

                const room =
                    getRoom(roomId);

                if (!room) {
                    return;
                }


                socket.leave(
                    "public:" +
                    room.id
                );


                if (
                    socket.publicRooms
                ) {

                    socket.publicRooms.delete(
                        room.id
                    );

                }


                socket.emit(
                    "room left",
                    {
                        id:
                            room.id
                    }
                );


                addLog(
                    `🚪 ${socket.username || "مستخدم"} خرج من غرفة ${room.name}`
                );

            }
        );


        /* =================================================
           CHAT
        ================================================= */

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


                /* MAINTENANCE */

                if (
                    maintenanceMode &&
                    !socket.adminData
                ) {

                    return;
                }


                /* CHAT LOCK */

                if (
                    chatLocked &&
                    !socket.adminData
                ) {

                    return;
                }


                /* STARS MODE */

                if (starsMode) {

                    const hasStar =
                        stars.includes(
                            socket.username
                        );

                    if (!hasStar) {

                        socket.emit(
                            "banned",
                            "⭐ الكتابة لأصحاب النجمة فقط"
                        );

                        return;
                    }
                }


                /* MUTE */

                const muted =
                    mutedUsers.find(
                        m =>
                            m.id ===
                            socket.id
                    );

                if (muted) {

                    socket.emit(
                        "banned",
                        "🔇 أنت مكتوم"
                    );

                    return;
                }


                /*
                   ROOM MESSAGE
                */

                const roomId =
                    data?.roomId
                        ? String(
                            data.roomId
                        )
                        : null;


                if (roomId) {

                    const room =
                        getRoom(roomId);


                    if (!room) {
                        return;
                    }


                    if (!room.enabled) {
                        return;
                    }


                    /*
                       حماية إضافية:
                       المستخدم يجب أن يكون
                       داخل الغرفة فعليًا.
                    */

                    if (
                        !socket.publicRooms ||
                        !socket.publicRooms.has(
                            room.id
                        )
                    ) {

                        return;
                    }


                    io.to(
                        "public:" +
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
                                data.message,

                            color:
                                user.color,

                            reply:
                                data.reply,

                            roomId:
                                room.id

                        }
                    );


                    return;
                }


                /*
                   FALLBACK
                   للنسخة القديمة من التطبيق.

                   إذا app.js الحالي لم يرسل
                   roomId، يبقى الشات القديم
                   يعمل بدون أن ينكسر.
                */

                io.emit(
                    "chat message",
                    {

                        id:
                            user.id,

                        username:
                            user.username,

                        message:
                            data.message,

                        color:
                            user.color,

                        reply:
                            data.reply

                    }
                );

            }
        );


        /* =================================================
           PRIVATE MESSAGE
        ================================================= */

        socket.on(
            "private message",
            data => {

                if (
                    privateLocked &&
                    !socket.adminData
                ) {

                    return;
                }


                if (!data) {
                    return;
                }


                if (!data.to) {
                    return;
                }


                io.to(
                    data.to
                )
                .emit(
                    "private message",
                    data
                );

            }
        );


        /* =================================================
           ADMIN LOGIN
        ================================================= */

        socket.on(
            "admin panel login",
            data => {

                const admin =
                    admins.find(
                        a =>
                            a.name ===
                                data.name &&
                            a.password ===
                                data.password
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
                            admin.permissions
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
                            admins.length

                    }
                );


                /*
                   إرسال الغرف للأدمن
                */

                sendRooms(socket);

            }
        );


        /* =================================================
           ADMIN GET ROOMS
        ================================================= */

        socket.on(
            "admin get rooms",
            () => {

                if (!socket.adminData) {
                    return;
                }

                sendRooms(socket);

            }
        );


        /* =================================================
           CREATE ROOM
        ================================================= */

        socket.on(
            "create room",
            data => {

                if (!socket.adminData) {
                    return;
                }


                const name =
                    String(
                        data?.name || ""
                    ).trim();


                const description =
                    String(
                        data?.description || ""
                    ).trim();


                if (!name) {

                    socket.emit(
                        "room error",
                        "⚠️ اكتب اسم الغرفة"
                    );

                    return;
                }


                /*
                   منع اسم غرفة مكرر
                */

                const exists =
                    rooms.find(
                        room =>
                            room.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "room error",
                        "⚠️ هذه الغرفة موجودة بالفعل"
                    );

                    return;
                }


                const room = {

                    id:
                        generateRoomId(),

                    name,

                    description,

                    enabled:
                        true

                };


                rooms.push(room);


                saveFile(
                    "rooms.json",
                    rooms
                );


                /*
                   إرسال القائمة للجميع
                */

                io.emit(
                    "rooms list",
                    rooms
                );


                socket.emit(
                    "room created",
                    room
                );


                addLog(
                    `🏠 تم إنشاء غرفة ${name}`
                );

            }
        );


        /* =================================================
           EDIT ROOM
        ================================================= */

        socket.on(
            "edit room",
            data => {

                if (!socket.adminData) {
                    return;
                }


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


                const name =
                    String(
                        data?.name || ""
                    ).trim();


                const description =
                    String(
                        data?.description || ""
                    ).trim();


                if (!name) {

                    socket.emit(
                        "room error",
                        "⚠️ اسم الغرفة مطلوب"
                    );

                    return;
                }


                /*
                   منع اسم مكرر
                */

                const duplicate =
                    rooms.find(
                        r =>
                            r.id !==
                                room.id &&
                            r.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    );


                if (duplicate) {

                    socket.emit(
                        "room error",
                        "⚠️ اسم الغرفة مستخدم"
                    );

                    return;
                }


                room.name =
                    name;

                room.description =
                    description;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.emit(
                    "rooms list",
                    rooms
                );


                socket.emit(
                    "room edited",
                    room
                );


                addLog(
                    `✏️ تم تعديل غرفة ${name}`
                );

            }
        );


        /* =================================================
           TOGGLE ROOM
        ================================================= */

        socket.on(
            "toggle room",
            roomId => {

                if (!socket.adminData) {
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


                room.enabled =
                    !room.enabled;


                saveFile(
                    "rooms.json",
                    rooms
                );


                /*
                   إذا تم تعطيل الغرفة،
                   نخرج جميع المستخدمين
                   منها.
                */

                if (!room.enabled) {

                    io.in(
                        "public:" +
                        room.id
                    )
                    .socketsLeave(
                        "public:" +
                        room.id
                    );


                    io.sockets.sockets.forEach(
                        client => {

                            if (
                                client.publicRooms
                            ) {

                                client.publicRooms.delete(
                                    room.id
                                );

                            }

                        }
                    );

                }


                io.emit(
                    "rooms list",
                    rooms
                );


                socket.emit(
                    "room toggled",
                    room
                );


                addLog(
                    `🔄 غرفة ${room.name} أصبحت ${
                        room.enabled
                            ? "مفعلة"
                            : "معطلة"
                    }`
                );

            }
        );


        /* =================================================
           DELETE ROOM
        ================================================= */

        socket.on(
            "delete room",
            roomId => {

                if (!socket.adminData) {
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


                /*
                   إخراج المستخدمين
                */

                io.in(
                    "public:" +
                    room.id
                )
                .socketsLeave(
                    "public:" +
                    room.id
                );


                io.sockets.sockets.forEach(
                    client => {

                        if (
                            client.publicRooms
                        ) {

                            client.publicRooms.delete(
                                room.id
                            );

                        }

                    }
                );


                rooms =
                    rooms.filter(
                        r =>
                            r.id !==
                            room.id
                    );


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.emit(
                    "rooms list",
                    rooms
                );


                socket.emit(
                    "room deleted",
                    {
                        id:
                            room.id
                    }
                );


                addLog(
                    `🗑️ تم حذف غرفة ${room.name}`
                );

            }
        );


        /* =================================================
           USER INFO
        ================================================= */

        socket.on(
            "view user",
            id => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.viewUserInfo
                ) {

                    return;
                }


                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                socket.emit(
                    "user info",
                    user
                );

            }
        );


        /* =================================================
           ADD ADMIN
        ================================================= */

        socket.on(
            "add admin",
            data => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.addAdmin
                ) {

                    return;
                }


                const exists =
                    admins.find(
                        a =>
                            a.name
                                .toLowerCase() ===
                            data.name
                                .toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "admin exists"
                    );

                    return;
                }


                admins.push({

                    name:
                        data.name,

                    password:
                        data.password,

                    permissions:
                        data.permissions

                });


                saveFile(
                    "admins.json",
                    admins
                );


                io.emit(
                    "admins list",
                    admins
                );


                socket.emit(
                    "admin added"
                );


                addLog(
                    `👮 تمت إضافة ${data.name}`
                );

            }
        );


        /* =================================================
           REMOVE ADMIN
        ================================================= */

        socket.on(
            "remove admin",
            name => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.addAdmin
                ) {

                    return;
                }


                admins =
                    admins.filter(
                        a =>
                            a.name !==
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
                    `🗑️ تم حذف ${name}`
                );

            }
        );


        /* =================================================
           KICK
        ================================================= */

        socket.on(
            "kick user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                io.to(id)
                    .emit(
                        "banned",
                        "⚠️ تم طردك"
                    );


                io.sockets.sockets
                    .get(id)
                    ?.disconnect();

            }
        );


        /* =================================================
           BAN
        ================================================= */

        socket.on(
            "ban user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                bannedUsers.push({

                    ip:
                        user.ip

                });


                saveFile(
                    "banned.json",
                    bannedUsers
                );


                io.to(id)
                    .emit(
                        "banned",
                        "🚫 تم حظرك"
                    );


                io.sockets.sockets
                    .get(id)
                    ?.disconnect();

            }
        );


        /* =================================================
           MUTE
        ================================================= */

        socket.on(
            "mute user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                mutedUsers.push({

                    id:
                        user.id,

                    username:
                        user.username

                });


                saveFile(
                    "muted.json",
                    mutedUsers
                );

            }
        );


        /* =================================================
           GIVE STAR
        ================================================= */

        socket.on(
            "give star",
            username => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.stars
                ) {

                    return;
                }


                if (
                    !stars.includes(
                        username
                    )
                ) {

                    stars.push(
                        username
                    );


                    saveFile(
                        "stars.json",
                        stars
                    );


                    addLog(
                        `⭐ تم إعطاء نجمة لـ ${username}`
                    );

                }

            }
        );


        /* =================================================
           REMOVE STAR
        ================================================= */

        socket.on(
            "remove star",
            username => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.stars
                ) {

                    return;
                }


                stars =
                    stars.filter(
                        u =>
                            u !==
                            username
                    );


                saveFile(
                    "stars.json",
                    stars
                );


                addLog(
                    `⭐❌ تم سحب نجمة من ${username}`
                );

            }
        );


        /* =================================================
           DEVICE BAN
        ================================================= */

        socket.on(
            "disconnect user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                deviceBannedUsers.push({

                    device:
                        user.device,

                    username:
                        user.username

                });


                saveFile(
                    "deviceBanned.json",
                    deviceBannedUsers
                );

            }
        );


        /* =================================================
           UNBAN USER
        ================================================= */

        socket.on(
            "unban user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                bannedUsers =
                    bannedUsers.filter(
                        b =>
                            b.ip !==
                            user.ip
                    );


                saveFile(
                    "banned.json",
                    bannedUsers
                );


                addLog(
                    `🔓 تم فك حظر ${user.username}`
                );

            }
        );


        /* =================================================
           UNMUTE USER
        ================================================= */

        socket.on(
            "unmute user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                mutedUsers =
                    mutedUsers.filter(
                        m =>
                            m.id !==
                            user.id
                    );


                saveFile(
                    "muted.json",
                    mutedUsers
                );


                addLog(
                    `🔊 تم فك كتم ${user.username}`
                );

            }
        );


        /* =================================================
           STARS MODE
        ================================================= */

        socket.on(
            "toggle stars mode",
            () => {

                /*
                   حماية السيرفر:
                   فقط أدمن لديه صلاحية النجوم
                   يستطيع تغيير وضع النجوم.
                */

                if (
                    !socket.adminData
                        ?.permissions
                        ?.stars
                ) {

                    return;
                }


                starsMode =
                    !starsMode;


                addLog(
                    `⭐ وضع النجوم ${
                        starsMode
                            ? "ON"
                            : "OFF"
                    }`
                );

            }
        );


        /* =================================================
           UNDISCONNECT USER
        ================================================= */

        socket.on(
            "undisconnect user",
            id => {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                deviceBannedUsers =
                    deviceBannedUsers.filter(
                        d =>
                            d.device !==
                            user.device
                    );


                saveFile(
                    "deviceBanned.json",
                    deviceBannedUsers
                );


                addLog(
                    `⛔🔓 تم فك فصل ${user.username}`
                );

            }
        );


        /* =================================================
           UNDISCONNECT DEVICE
        ================================================= */

        socket.on(
            "undisconnect device",
            device => {

                deviceBannedUsers =
                    deviceBannedUsers.filter(
                        d =>
                            d.device !==
                            device
                    );


                saveFile(
                    "deviceBanned.json",
                    deviceBannedUsers
                );


                addLog(
                    "⛔🔓 تم فك فصل جهاز"
                );

            }
        );


        /* =================================================
           UNBAN IP
        ================================================= */

        socket.on(
            "unban ip",
            ip => {

                bannedUsers =
                    bannedUsers.filter(
                        b =>
                            b.ip !==
                            ip
                    );


                saveFile(
                    "banned.json",
                    bannedUsers
                );


                addLog(
                    `🔓 تم فك حظر ${ip}`
                );

            }
        );


        /* =================================================
           UNBAN ALL
        ================================================= */

        socket.on(
            "unban all",
            () => {

                bannedUsers = [];


                saveFile(
                    "banned.json",
                    bannedUsers
                );

            }
        );


        /* =================================================
           UNMUTE ALL
        ================================================= */

        socket.on(
            "unmute all",
            () => {

                mutedUsers = [];


                saveFile(
                    "muted.json",
                    mutedUsers
                );

            }
        );


        /* =================================================
           UNDISCONNECT ALL
        ================================================= */

        socket.on(
            "undisconnect all",
            () => {

                deviceBannedUsers = [];


                saveFile(
                    "deviceBanned.json",
                    deviceBannedUsers
                );

            }
        );


        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            () => {

                /*
                   إزالة المستخدم من الغرف
                   تتم تلقائيًا بواسطة Socket.IO.
                */

                users =
                    users.filter(
                        u =>
                            u.id !==
                            socket.id
                    );


                io.emit(
                    "online users",
                    users
                );


                if (socket.username) {

                    addLog(
                        `👋 ${socket.username} خرج`
                    );

                }

            }
        );

    }
);


/* =========================================================
   SERVER
========================================================= */

server.listen(
    process.env.PORT || 3000,
    () => {

        console.log(
            "🚀 Server Running"
        );

    }
);
