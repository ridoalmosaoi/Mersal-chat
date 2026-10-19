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
   GLOBAL STATE
========================================================= */

let users = [];

let chatLocked = false;
let privateLocked = false;
let maintenanceMode = false;

/* Legacy compatibility only */
let starsMode = false;

let admins = [];
let bannedUsers = [];
let mutedUsers = [];
let deviceBannedUsers = [];
let stars = [];
let logs = [];

/* =========================================================
   ROOMS
========================================================= */

let rooms = [];

/*
roomStars = {
    roomId: ["Ali", "Ahmed"]
}
*/
let roomStars = {};

/*
roomBans = {
    roomId: [
        {
            ip,
            username
        }
    ]
}
*/
let roomBans = {};

/*
roomMutes = {
    roomId: [
        {
            id,
            username
        }
    ]
}
*/
let roomMutes = {};

/*
roomDeviceBans = {
    roomId: [
        {
            device,
            username
        }
    ]
}
*/
let roomDeviceBans = {};

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
            "LOAD ERROR:",
            file,
            error.message
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
            "SAVE ERROR:",
            file,
            error.message
        );
    }
}


/* =========================================================
   LOAD DATA
========================================================= */

admins =
    loadFile(
        "admins.json",
        []
    );

stars =
    loadFile(
        "stars.json",
        []
    );

bannedUsers =
    loadFile(
        "banned.json",
        []
    );

mutedUsers =
    loadFile(
        "muted.json",
        []
    );

deviceBannedUsers =
    loadFile(
        "deviceBanned.json",
        []
    );

logs =
    loadFile(
        "logs.json",
        []
    );

rooms =
    loadFile(
        "rooms.json",
        []
    );

roomStars =
    loadFile(
        "roomStars.json",
        {}
    );

roomBans =
    loadFile(
        "roomBans.json",
        {}
    );

roomMutes =
    loadFile(
        "roomMutes.json",
        {}
    );

roomDeviceBans =
    loadFile(
        "roomDeviceBans.json",
        {}
    );


/* =========================================================
   NORMALIZE ROOMS
========================================================= */

rooms = rooms.map(room => {

    return {

        id:
            String(
                room.id ||
                Date.now() +
                Math.random()
                    .toString(36)
                    .slice(2)
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

    saveFile(
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
   API
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
   ROOM HELPERS
========================================================= */

function getRoom(roomId) {

    return rooms.find(
        room =>
            String(room.id) ===
            String(roomId)
    );

}


function getEnabledRoom(roomId) {

    return rooms.find(
        room =>
            String(room.id) ===
                String(roomId)
            &&
            room.enabled !== false
    );

}


function getRoomSettings(roomId) {

    const room =
        getRoom(roomId);

    if (!room) {
        return null;
    }

    if (!room.settings) {

        room.settings = {

            starsMode: false,

            chatLocked: false,

            maintenance: false,

            protection: true

        };

    }

    return room.settings;
}


/* =========================================================
   ADMIN HELPERS
========================================================= */

function isMasterAdmin(admin) {

    if (!admin) {
        return false;
    }

    return (

        admin.isMaster === true

        ||

        admin.permissions?.master === true

        ||

        admin.permissions?.addAdmin === true

    );
}


function getAssignedRooms(admin) {

    if (!admin) {
        return [];
    }

    if (
        isMasterAdmin(admin)
    ) {

        return rooms.map(
            room =>
                String(room.id)
        );

    }

    if (
        !Array.isArray(
            admin.assignedRooms
        )
    ) {

        return [];

    }

    return admin.assignedRooms.map(
        id =>
            String(id)
    );

}


function isRoomAssigned(
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

    return getAssignedRooms(
        admin
    ).includes(
        String(roomId)
    );

}


function hasRoomPermission(
    socket,
    roomId,
    permission
) {

    const admin =
        socket.adminData;

    if (!admin) {
        return false;
    }

    if (
        isMasterAdmin(admin)
    ) {

        return true;

    }

    if (
        !isRoomAssigned(
            admin,
            roomId
        )
    ) {

        return false;

    }

    if (!permission) {
        return true;
    }

    const globalPermission =
        admin.permissions &&
        admin.permissions[permission] === true;

    const roomPermission =
        admin.roomPermissions &&
        admin.roomPermissions[String(roomId)] &&
        admin.roomPermissions[String(roomId)][permission] === true;

    return (
        globalPermission ||
        roomPermission
    );

}


/* =========================================================
   ROOM MEMBERS
========================================================= */

function getUserRooms(
    socket
) {

    if (
        !socket.publicRooms
    ) {

        return [];

    }

    return [
        ...socket.publicRooms
    ];

}


function broadcastRoomUsers(
    roomId
) {

    const members = [];

    io.sockets.sockets.forEach(
        socket => {

            if (
                socket.publicRooms &&
                socket.publicRooms.has(
                    String(roomId)
                )
            ) {

                const user =
                    users.find(
                        u =>
                            u.id ===
                            socket.id
                    );

                if (user) {

                    members.push({

                        ...user,

                        role:
                            socket.adminData
                                ? "&"
                                : ""

                    });

                }

            }

        }
    );


    io.to(
        "public:" +
        String(roomId)
    ).emit(
        "room users",
        members
    );

}


/* =========================================================
   ROOM NOTICE
========================================================= */

function roomNotice(
    roomId,
    message
) {

    io.to(
        "public:" +
        String(roomId)
    ).emit(
        "room notice",
        {

            roomId:
                String(roomId),

            message,

            time:
                new Date()
                    .toLocaleTimeString()

        }
    );

}


/* =========================================================
   SEND ROOMS
========================================================= */

function sendRooms(
    socket
) {

    socket.emit(
        "rooms list",
        rooms.filter(
            room =>
                room.enabled !== false
        )
    );

}


function sendAdminRooms(
    socket
) {

    socket.emit(
        "admin rooms",
        rooms
    );

}


function sendAdminRoomPermissions(
    socket
) {

    if (!socket.adminData) {
        return;
    }

    socket.emit(
        "admin room permissions",
        {

            assignedRooms:
                getAssignedRooms(
                    socket.adminData
                ),

            roomPermissions:
                socket.adminData
                    .roomPermissions ||
                {},

            isMaster:
                isMasterAdmin(
                    socket.adminData
                )

        }
    );

}


function broadcastAdminRooms() {

    io.sockets.sockets.forEach(
        socket => {

            if (
                socket.adminData
            ) {

                sendAdminRooms(
                    socket
                );

                sendAdminRoomPermissions(
                    socket
                );

            }

        }
    );

}


function broadcastRoomsToUsers() {

    io.sockets.sockets.forEach(
        socket => {

            if (
                !socket.adminData
            ) {

                sendRooms(
                    socket
                );

            }

        }
    );

}


/* =========================================================
   ACTION ROOM RESOLUTION
========================================================= */

function resolveActionRoom(
    socket,
    targetId,
    data
) {

    if (
        data &&
        typeof data === "object" &&
        data.roomId
    ) {

        return String(
            data.roomId
        );

    }


    const target =
        users.find(
            user =>
                user.id ===
                targetId
        );

    if (!target) {
        return null;
    }


    /*
       If no roomId was supplied,
       use a room where both admin
       and target are currently present.
    */

    const targetSocket =
        io.sockets.sockets.get(
            target.id
        );

    if (!targetSocket) {
        return null;
    }


    for (
        const roomId of
        getUserRooms(socket)
    ) {

        if (
            targetSocket.publicRooms &&
            targetSocket.publicRooms.has(
                String(roomId)
            )
        ) {

            return String(
                roomId
            );

        }

    }

    return null;
}


/* =========================================================
   SOCKET
========================================================= */

io.on(
    "connection",
    socket => {

        socket.publicRooms =
            new Set();


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
           GET ROOMS
        ================================================= */

        socket.on(
            "get rooms",
            () => {

                sendRooms(
                    socket
                );

            }
        );


        /* =================================================
           JOIN
        ================================================= */

        socket.on(
            "join",
            data => {

                const username =
                    data.username
                        ?.trim();

                if (!username) {
                    return;
                }


                /*
                   RESERVED ROLE NAMES
                */

                if (
                    /^[&@]/.test(
                        username
                    )
                    ||
                    /^(admin|administrator|moderator|مشرف|ادمن)$/i.test(
                        username
                    )
                ) {

                    socket.emit(
                        "banned",
                        "🚫 هذا الاسم محجوز للإدارة"
                    );

                    return;

                }


                /*
                   DUPLICATE
                */

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


                /*
                   DEVICE
                */

                const device =
                    data.deviceToken
                    ||
                    socket.handshake
                        .headers[
                            "user-agent"
                        ];


                /*
                   IP
                */

                const ip =
                    socket.handshake
                        .address;


                /*
                   GLOBAL DEVICE BAN
                */

                const deviceBlocked =
                    deviceBannedUsers.find(
                        item =>
                            item.device ===
                            device
                    );

                if (deviceBlocked) {

                    socket.emit(
                        "banned",
                        "⛔ الجهاز محظور"
                    );

                    return;

                }


                /*
                   GLOBAL BAN
                */

                const banned =
                    bannedUsers.find(
                        item =>
                            item.ip ===
                            ip
                    );

                if (banned) {

                    socket.emit(
                        "banned",
                        "🚫 محظور"
                    );

                    return;

                }


                /*
                   ADMIN CHECK
                */

                const admin =
                    admins.find(
                        item =>
                            item.name
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


                /*
                   USER
                */

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


                users.push(
                    user
                );


                socket.username =
                    username;


                socket.emit(
                    "login success"
                );


                sendRooms(
                    socket
                );


                if (
                    socket.adminData
                ) {

                    sendAdminRoomPermissions(
                        socket
                    );

                }


                io.emit(
                    "online users",
                    users
                );


                addLog(
                    `👤 ${username} دخل`
                );

            }
        );


        /* =================================================
           JOIN ROOM
        ================================================= */

        socket.on(
            "join room",
            roomId => {

                const room =
                    getEnabledRoom(
                        roomId
                    );

                if (!room) {

                    socket.emit(
                        "room error",
                        "❌ الغرفة غير موجودة أو معطلة"
                    );

                    return;

                }


                const id =
                    String(
                        room.id
                    );


                if (
                    socket.publicRooms
                        .has(id)
                ) {

                    socket.emit(
                        "room joined",
                        room
                    );

                    return;

                }


                /*
                   MAX 3 ROOMS
                */

                if (
                    socket.publicRooms
                        .size >= 3
                ) {

                    socket.emit(
                        "room error",
                        "❌ يمكنك فتح 3 غرف كحد أقصى"
                    );

                    return;

                }


                socket.join(
                    "public:" +
                    id
                );


                socket.publicRooms.add(
                    id
                );


                socket.emit(
                    "room joined",
                    room
                );


                socket.emit(
                    "room settings",
                    {

                        roomId: id,

                        settings:
                            room.settings

                    }
                );


                socket.emit(
                    "room stars",
                    {

                        roomId: id,

                        stars:
                            roomStars[id] ||
                            []

                    }
                );


                /*
                   ADMIN ROOM NOTICE
                */

                if (
                    socket.adminData
                    &&
                    hasRoomPermission(
                        socket,
                        id
                    )
                ) {

                    roomNotice(
                        id,
                        `✨ تم توكيل ${socket.adminData.name}`
                    );

                }


                broadcastRoomUsers(
                    id
                );

            }
        );


        /* =================================================
           LEAVE ROOM
        ================================================= */

        socket.on(
            "leave room",
            roomId => {

                const id =
                    String(
                        roomId
                    );

                socket.leave(
                    "public:" +
                    id
                );

                socket.publicRooms.delete(
                    id
                );


                broadcastRoomUsers(
                    id
                );

            }
        );


        /* =================================================
           CHAT MESSAGE
        ================================================= */

        socket.on(
            "chat message",
            data => {

                const user =
                    users.find(
                        item =>
                            item.id ===
                            socket.id
                    );

                if (!user) {
                    return;
                }


                const roomId =
                    data &&
                    data.roomId
                        ? String(
                            data.roomId
                        )
                        : null;


                /*
                   ROOM CHAT
                */

                if (roomId) {

                    const room =
                        getEnabledRoom(
                            roomId
                        );

                    if (
                        !room ||
                        !socket.publicRooms
                            .has(roomId)
                    ) {

                        socket.emit(
                            "room error",
                            "❌ أنت لست داخل هذه الغرفة"
                        );

                        return;

                    }


                    const settings =
                        room.settings ||
                        {};


                    /*
                       MAINTENANCE
                    */

                    if (
                        settings.maintenance
                        &&
                        !hasRoomPermission(
                            socket,
                            roomId
                        )
                    ) {

                        return;

                    }


                    /*
                       CHAT LOCK
                    */

                    if (
                        settings.chatLocked
                        &&
                        !hasRoomPermission(
                            socket,
                            roomId,
                            "chatLock"
                        )
                    ) {

                        socket.emit(
                            "banned",
                            "🔒 الدردشة مقفلة"
                        );

                        return;

                    }


                    /*
                       STARS MODE
                    */

                    if (
                        settings.starsMode
                    ) {

                        const list =
                            roomStars[
                                roomId
                            ] ||
                            [];

                        if (
                            !list.includes(
                                socket.username
                            )
                            &&
                            !hasRoomPermission(
                                socket,
                                roomId,
                                "stars"
                            )
                        ) {

                            socket.emit(
                                "banned",
                                "⭐ الكتابة لأصحاب النجمة فقط"
                            );

                            return;

                        }

                    }


                    /*
                       ROOM MUTE
                    */

                    const muted =
                        (
                            roomMutes[
                                roomId
                            ] ||
                            []
                        ).find(
                            item =>
                                item.id ===
                                    socket.id
                                ||
                                item.username ===
                                    socket.username
                        );


                    if (
                        muted
                        &&
                        !hasRoomPermission(
                            socket,
                            roomId,
                            "mute"
                        )
                    ) {

                        socket.emit(
                            "banned",
                            "🔇 أنت مكتوم في هذه الغرفة"
                        );

                        return;

                    }


                    /*
                       SEND ROOM MESSAGE
                    */

                    io.to(
                        "public:" +
                        roomId
                    ).emit(
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

                            roomId,

                            role:
                                socket.adminData
                                    ? "&"
                                    : ""

                        }
                    );

                    return;

                }


                /*
                   LEGACY GLOBAL CHAT
                */

                if (
                    maintenanceMode
                    &&
                    !socket.adminData
                ) {

                    return;

                }


                if (
                    chatLocked
                    &&
                    !socket.adminData
                ) {

                    return;

                }


                if (starsMode) {

                    const hasStar =
                        stars.includes(
                            socket.username
                        );

                    if (
                        !hasStar
                    ) {

                        socket.emit(
                            "banned",
                            "⭐ الكتابة لأصحاب النجمة فقط"
                        );

                        return;

                    }

                }


                const muted =
                    mutedUsers.find(
                        item =>
                            item.id ===
                            socket.id
                    );


                if (muted) {

                    socket.emit(
                        "banned",
                        "🔇 أنت مكتوم"
                    );

                    return;

                }


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
                    privateLocked
                    &&
                    !socket.adminData
                ) {

                    return;

                }


                if (
                    !data ||
                    !data.to
                ) {

                    return;

                }


                io.to(
                    data.to
                ).emit(
                    "private message",
                    data
                );

            }
        );


        /* =================================================
           ADMIN PANEL LOGIN
        ================================================= */

        socket.on(
            "admin panel login",
            data => {

                const admin =
                    admins.find(
                        item =>
                            item.name ===
                                data.name
                            &&
                            item.password ===
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
                            admin.permissions ||
                            {},

                        assignedRooms:
                            getAssignedRooms(
                                admin
                            ),

                        roomPermissions:
                            admin.roomPermissions ||
                            {},

                        isMaster:
                            isMasterAdmin(
                                admin
                            )

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


                sendAdminRoomPermissions(
                    socket
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
                        item =>
                            item.id ===
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
                        admin =>
                            admin.name
                                .toLowerCase() ===
                            String(
                                data.name
                            ).toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "admin exists"
                    );

                    return;

                }


                const newAdmin = {

                    name:
                        data.name,

                    password:
                        data.password,

                    permissions:
                        data.permissions ||
                        {},

                    assignedRooms:
                        Array.isArray(
                            data.assignedRooms
                        )
                            ? data.assignedRooms.map(
                                id =>
                                    String(id)
                            )
                            : [],

                    roomPermissions:
                        data.roomPermissions ||
                        {},

                    isMaster:
                        data.isMaster === true

                };


                admins.push(
                    newAdmin
                );


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
           UPDATE ADMIN ROOMS
        ================================================= */

        socket.on(
            "update admin rooms",
            data => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.addAdmin
                ) {

                    return;

                }


                const admin =
                    admins.find(
                        item =>
                            item.name ===
                            data.name
                    );


                if (!admin) {
                    return;
                }


                admin.assignedRooms =
                    Array.isArray(
                        data.assignedRooms
                    )
                        ? data.assignedRooms.map(
                            id =>
                                String(id)
                        )
                        : [];


                admin.roomPermissions =
                    data.roomPermissions ||
                    {};


                saveFile(
                    "admins.json",
                    admins
                );


                io.emit(
                    "admins list",
                    admins
                );


                broadcastAdminRooms();


                addLog(
                    `🛡️ تم تحديث غرف وصلاحيات ${admin.name}`
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
                    `🗑️ تم حذف ${name}`
                );

            }
        );


        /* =================================================
           CREATE ROOM
        ================================================= */

        socket.on(
            "create room",
            data => {

                if (
                    !isMasterAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ ليس لديك صلاحية إنشاء الغرف"
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


                const exists =
                    rooms.some(
                        room =>
                            room.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "room error",
                        "❌ اسم الغرفة موجود"
                    );

                    return;

                }


                const room = {

                    id:
                        Date.now()
                            .toString(36) +
                        Math.random()
                            .toString(36)
                            .slice(2, 8),

                    name,

                    description,

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


                broadcastAdminRooms();
                broadcastRoomsToUsers();


                addLog(
                    `🏠 تم إنشاء الغرفة ${name}`
                );

            }
        );


        /* =================================================
           UPDATE ROOM
        ================================================= */

        socket.on(
            "update room",
            data => {

                if (
                    !isMasterAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ ليس لديك صلاحية تعديل الغرف"
                    );

                    return;

                }


                const room =
                    getRoom(
                        data.id
                    );


                if (!room) {
                    return;
                }


                const name =
                    String(
                        data.name ||
                        ""
                    ).trim();


                const description =
                    String(
                        data.description ||
                        ""
                    ).trim();


                if (!name) {

                    socket.emit(
                        "room error",
                        "❌ اكتب اسم الغرفة"
                    );

                    return;

                }


                const duplicate =
                    rooms.some(
                        item =>
                            item.id !==
                                room.id
                            &&
                            item.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    );


                if (duplicate) {

                    socket.emit(
                        "room error",
                        "❌ اسم الغرفة موجود"
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


                broadcastAdminRooms();
                broadcastRoomsToUsers();


                addLog(
                    `✏️ تم تعديل الغرفة ${name}`
                );

            }
        );


        /* =================================================
           TOGGLE ROOM
        ================================================= */

        socket.on(
            "toggle room",
            roomId => {

                if (
                    !isMasterAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ ليس لديك صلاحية تغيير حالة الغرفة"
                    );

                    return;

                }


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                room.enabled =
                    room.enabled === false;


                saveFile(
                    "rooms.json",
                    rooms
                );


                broadcastAdminRooms();
                broadcastRoomsToUsers();


                addLog(
                    `🏠 الغرفة ${room.name} ${
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

                if (
                    !isMasterAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ ليس لديك صلاحية حذف الغرف"
                    );

                    return;

                }


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                rooms =
                    rooms.filter(
                        item =>
                            item.id !==
                            room.id
                    );


                delete roomStars[
                    room.id
                ];

                delete roomBans[
                    room.id
                ];

                delete roomMutes[
                    room.id
                ];

                delete roomDeviceBans[
                    room.id
                ];


                saveFile(
                    "rooms.json",
                    rooms
                );

                saveFile(
                    "roomStars.json",
                    roomStars
                );

                saveFile(
                    "roomBans.json",
                    roomBans
                );

                saveFile(
                    "roomMutes.json",
                    roomMutes
                );

                saveFile(
                    "roomDeviceBans.json",
                    roomDeviceBans
                );


                broadcastAdminRooms();
                broadcastRoomsToUsers();


                addLog(
                    `🗑️ تم حذف الغرفة ${room.name}`
                );

            }
        );


        /* =================================================
           ROOM SETTINGS
        ================================================= */

        socket.on(
            "toggle room stars",
            roomId => {

                if (
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "stars"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ لا تملك صلاحية النجوم في هذه الغرفة"
                    );

                    return;

                }


                const settings =
                    getRoomSettings(
                        roomId
                    );


                settings.starsMode =
                    !settings.starsMode;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.to(
                    "public:" +
                    String(roomId)
                ).emit(
                    "room settings",
                    {

                        roomId:
                            String(roomId),

                        settings

                    }
                );


                roomNotice(
                    roomId,
                    settings.starsMode
                        ? "⭐ تم تفعيل وضع النجوم"
                        : "⭐ تم إيقاف وضع النجوم"
                );

            }
        );


        socket.on(
            "toggle room chat lock",
            roomId => {

                if (
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "chatLock"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ لا تملك صلاحية قفل الدردشة"
                    );

                    return;

                }


                const settings =
                    getRoomSettings(
                        roomId
                    );


                settings.chatLocked =
                    !settings.chatLocked;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.to(
                    "public:" +
                    String(roomId)
                ).emit(
                    "room settings",
                    {

                        roomId:
                            String(roomId),

                        settings

                    }
                );


                roomNotice(
                    roomId,
                    settings.chatLocked
                        ? "🔒 تم قفل الدردشة"
                        : "🔓 تم فتح الدردشة"
                );

            }
        );


        socket.on(
            "toggle room maintenance",
            roomId => {

                if (
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "maintenance"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ لا تملك صلاحية الصيانة"
                    );

                    return;

                }


                const settings =
                    getRoomSettings(
                        roomId
                    );


                settings.maintenance =
                    !settings.maintenance;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.to(
                    "public:" +
                    String(roomId)
                ).emit(
                    "room settings",
                    {

                        roomId:
                            String(roomId),

                        settings

                    }
                );


                roomNotice(
                    roomId,
                    settings.maintenance
                        ? "🛠️ الغرفة في وضع الصيانة"
                        : "🟢 انتهت الصيانة"
                );

            }
        );


        socket.on(
            "toggle room protection",
            roomId => {

                if (
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "protection"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "❌ لا تملك صلاحية الحماية"
                    );

                    return;

                }


                const settings =
                    getRoomSettings(
                        roomId
                    );


                settings.protection =
                    settings.protection === false;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.to(
                    "public:" +
                    String(roomId)
                ).emit(
                    "room settings",
                    {

                        roomId:
                            String(roomId),

                        settings

                    }
                );


                roomNotice(
                    roomId,
                    settings.protection
                        ? "🛡️ الحماية مفعلة"
                        : "⚠️ الحماية متوقفة"
                );

            }
        );


        /* =================================================
           GIVE STAR
        ================================================= */

        socket.on(
            "give star",
            data => {

                const username =
                    typeof data ===
                    "string"
                        ? data
                        : data?.username;


                const roomId =
                    typeof data ===
                    "object"
                        ? String(
                            data?.roomId ||
                            ""
                        )
                        : "";


                if (roomId) {

                    if (
                        !hasRoomPermission(
                            socket,
                            roomId,
                            "stars"
                        )
                    ) {

                        return;

                    }


                    if (
                        !roomStars[
                            roomId
                        ]
                    ) {

                        roomStars[
                            roomId
                        ] = [];

                    }


                    if (
                        !roomStars[
                            roomId
                        ].includes(
                            username
                        )
                    ) {

                        roomStars[
                            roomId
                        ].push(
                            username
                        );

                    }


                    saveFile(
                        "roomStars.json",
                        roomStars
                    );


                    io.to(
                        "public:" +
                        roomId
                    ).emit(
                        "room stars",
                        {

                            roomId,

                            stars:
                                roomStars[
                                    roomId
                                ]

                        }
                    );


                    roomNotice(
                        roomId,
                        `⭐ تم إعطاء نجمة لـ ${username}`
                    );


                    return;

                }


                /*
                   Legacy star
                */

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

                }

            }
        );


        /* =================================================
           REMOVE STAR
        ================================================= */

        socket.on(
            "remove star",
            data => {

                const username =
                    typeof data ===
                    "string"
                        ? data
                        : data?.username;


                const roomId =
                    typeof data ===
                    "object"
                        ? String(
                            data?.roomId ||
                            ""
                        )
                        : "";


                if (roomId) {

                    if (
                        !hasRoomPermission(
                            socket,
                            roomId,
                            "stars"
                        )
                    ) {

                        return;

                    }


                    roomStars[
                        roomId
                    ] =
                        (
                            roomStars[
                                roomId
                            ] ||
                            []
                        ).filter(
                            name =>
                                name !==
                                username
                        );


                    saveFile(
                        "roomStars.json",
                        roomStars
                    );


                    io.to(
                        "public:" +
                        roomId
                    ).emit(
                        "room stars",
                        {

                            roomId,

                            stars:
                                roomStars[
                                    roomId
                                ]

                        }
                    );


                    roomNotice(
                        roomId,
                        `⭐❌ تم سحب النجمة من ${username}`
                    );


                    return;

                }


                if (
                    !socket.adminData
                        ?.permissions
                        ?.stars
                ) {

                    return;

                }


                stars =
                    stars.filter(
                        name =>
                            name !==
                            username
                    );


                saveFile(
                    "stars.json",
                    stars
                );

            }
        );


        /* =================================================
           KICK
        ================================================= */

        socket.on(
            "kick user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "kick"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                io.to(id).emit(
                    "room action",
                    {

                        type:
                            "kick",

                        roomId,

                        message:
                            "⚠️ تم طردك من الغرفة"

                    }
                );


                const targetSocket =
                    io.sockets.sockets.get(
                        id
                    );


                if (
                    targetSocket
                ) {

                    targetSocket.leave(
                        "public:" +
                        roomId
                    );

                    targetSocket.publicRooms.delete(
                        String(roomId)
                    );

                    broadcastRoomUsers(
                        roomId
                    );

                }


                roomNotice(
                    roomId,
                    `👢 تم طرد ${user.username} من الغرفة`
                );

            }
        );


        /* =================================================
           BAN
        ================================================= */

        socket.on(
            "ban user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "ban"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                if (
                    !roomBans[
                        roomId
                    ]
                ) {

                    roomBans[
                        roomId
                    ] = [];

                }


                const exists =
                    roomBans[
                        roomId
                    ].some(
                        item =>
                            item.ip ===
                            user.ip
                    );


                if (!exists) {

                    roomBans[
                        roomId
                    ].push({

                        ip:
                            user.ip,

                        username:
                            user.username

                    });

                }


                saveFile(
                    "roomBans.json",
                    roomBans
                );


                const targetSocket =
                    io.sockets.sockets.get(
                        id
                    );


                if (
                    targetSocket
                ) {

                    targetSocket.leave(
                        "public:" +
                        roomId
                    );

                    targetSocket.publicRooms.delete(
                        String(roomId)
                    );

                }


                io.to(id).emit(
                    "room action",
                    {

                        type:
                            "ban",

                        roomId,

                        message:
                            "🚫 تم حظرك من هذه الغرفة"

                    }
                );


                roomNotice(
                    roomId,
                    `🚫 تم حظر ${user.username} من الغرفة`
                );


                broadcastRoomUsers(
                    roomId
                );

            }
        );


        /* =================================================
           MUTE
        ================================================= */

        socket.on(
            "mute user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "mute"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                if (
                    !roomMutes[
                        roomId
                    ]
                ) {

                    roomMutes[
                        roomId
                    ] = [];

                }


                const exists =
                    roomMutes[
                        roomId
                    ].some(
                        item =>
                            item.username ===
                            user.username
                    );


                if (!exists) {

                    roomMutes[
                        roomId
                    ].push({

                        id:
                            user.id,

                        username:
                            user.username

                    });

                }


                saveFile(
                    "roomMutes.json",
                    roomMutes
                );


                roomNotice(
                    roomId,
                    `🔇 تم كتم ${user.username}`
                );

            }
        );


        /* =================================================
           UNMUTE
        ================================================= */

        socket.on(
            "unmute user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "unmute"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                roomMutes[
                    roomId
                ] =
                    (
                        roomMutes[
                            roomId
                        ] ||
                        []
                    ).filter(
                        item =>
                            item.username !==
                            user.username
                    );


                saveFile(
                    "roomMutes.json",
                    roomMutes
                );


                roomNotice(
                    roomId,
                    `🔊 تم فك كتم ${user.username}`
                );

            }
        );


        /* =================================================
           DISCONNECT DEVICE FROM ROOM
        ================================================= */

        socket.on(
            "disconnect user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "disconnect"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                if (
                    !roomDeviceBans[
                        roomId
                    ]
                ) {

                    roomDeviceBans[
                        roomId
                    ] = [];

                }


                roomDeviceBans[
                    roomId
                ].push({

                    device:
                        user.device,

                    username:
                        user.username

                });


                saveFile(
                    "roomDeviceBans.json",
                    roomDeviceBans
                );


                const targetSocket =
                    io.sockets.sockets.get(
                        id
                    );


                if (
                    targetSocket
                ) {

                    targetSocket.leave(
                        "public:" +
                        roomId
                    );

                    targetSocket.publicRooms.delete(
                        String(roomId)
                    );

                }


                io.to(id).emit(
                    "room action",
                    {

                        type:
                            "disconnect",

                        roomId,

                        message:
                            "⛔ تم فصلك من هذه الغرفة"

                    }
                );


                roomNotice(
                    roomId,
                    `⛔ تم فصل ${user.username} من الغرفة`
                );


                broadcastRoomUsers(
                    roomId
                );

            }
        );


        /* =================================================
           UNBAN ROOM
        ================================================= */

        socket.on(
            "unban user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "unban"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                roomBans[
                    roomId
                ] =
                    (
                        roomBans[
                            roomId
                        ] ||
                        []
                    ).filter(
                        item =>
                            item.ip !==
                            user.ip
                    );


                saveFile(
                    "roomBans.json",
                    roomBans
                );


                roomNotice(
                    roomId,
                    `🔓 تم فك حظر ${user.username}`
                );

            }
        );


        /* =================================================
           UNDISCONNECT ROOM
        ================================================= */

        socket.on(
            "undisconnect user",
            data => {

                const id =
                    typeof data ===
                    "string"
                        ? data
                        : data?.id;


                const roomId =
                    resolveActionRoom(
                        socket,
                        id,
                        data
                    );


                if (
                    !roomId ||
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "undisconnect"
                    )
                ) {

                    return;

                }


                const user =
                    users.find(
                        item =>
                            item.id ===
                            id
                    );


                if (!user) {
                    return;
                }


                roomDeviceBans[
                    roomId
                ] =
                    (
                        roomDeviceBans[
                            roomId
                        ] ||
                        []
                    ).filter(
                        item =>
                            item.device !==
                            user.device
                    );


                saveFile(
                    "roomDeviceBans.json",
                    roomDeviceBans
                );


                roomNotice(
                    roomId,
                    `⛔🔓 تم فك فصل ${user.username}`
                );

            }
        );


        /* =================================================
           OLD GLOBAL CONTROLS
           Kept for compatibility with current admin panel.
        ================================================= */

        socket.on(
            "toggle stars mode",
            () => {

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


        socket.on(
            "toggle chat lock",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }

                chatLocked =
                    !chatLocked;

                addLog(
                    `🔒 قفل الدردشة ${
                        chatLocked
                            ? "ON"
                            : "OFF"
                    }`
                );

            }
        );


        socket.on(
            "toggle private lock",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }

                privateLocked =
                    !privateLocked;

                addLog(
                    `🔒 الخاص ${
                        privateLocked
                            ? "ON"
                            : "OFF"
                    }`
                );

            }
        );


        socket.on(
            "maintenance mode",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }

                maintenanceMode =
                    !maintenanceMode;

                addLog(
                    `🛠️ الصيانة ${
                        maintenanceMode
                            ? "ON"
                            : "OFF"
                    }`
                );

            }
        );


        /* =================================================
           GLOBAL UNBAN ALL
        ================================================= */

        socket.on(
            "unban all",
            () => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.unban
                ) {

                    return;

                }


                bannedUsers = [];

                saveFile(
                    "banned.json",
                    bannedUsers
                );

            }
        );


        /* =================================================
           GLOBAL UNMUTE ALL
        ================================================= */

        socket.on(
            "unmute all",
            () => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.unmute
                ) {

                    return;

                }


                mutedUsers = [];

                saveFile(
                    "muted.json",
                    mutedUsers
                );

            }
        );


        /* =================================================
           GLOBAL UNDISCONNECT ALL
        ================================================= */

        socket.on(
            "undisconnect all",
            () => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.undisconnect
                ) {

                    return;

                }


                deviceBannedUsers = [];

                saveFile(
                    "deviceBanned.json",
                    deviceBannedUsers
                );

            }
        );


        /* =================================================
           LEGACY GLOBAL UNBAN IP
        ================================================= */

        socket.on(
            "unban ip",
            ip => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.unban
                ) {

                    return;

                }


                bannedUsers =
                    bannedUsers.filter(
                        item =>
                            item.ip !==
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
           LEGACY GLOBAL UNMUTE
        ================================================= */

        socket.on(
            "unmute device",
            id => {

                if (
                    !socket.adminData
                        ?.permissions
                        ?.unmute
                ) {

                    return;

                }


                mutedUsers =
                    mutedUsers.filter(
                        item =>
                            item.id !==
                            id
                    );


                saveFile(
                    "muted.json",
                    mutedUsers
                );

            }
        );


        /* =================================================
           CLEAR CHAT
        ================================================= */

        socket.on(
            "clear chat",
            data => {

                let roomId = null;

                if (
                    data &&
                    typeof data ===
                    "object"
                ) {

                    roomId =
                        data.roomId
                            ? String(
                                data.roomId
                            )
                            : null;

                }


                if (roomId) {

                    if (
                        !hasRoomPermission(
                            socket,
                            roomId,
                            "deleteMessage"
                        )
                    ) {

                        return;

                    }


                    io.to(
                        "public:" +
                        roomId
                    ).emit(
                        "clear room chat"
                    );


                    roomNotice(
                        roomId,
                        "🗑️ تم مسح رسائل الغرفة"
                    );


                    return;

                }


                if (
                    !socket.adminData
                ) {
                    return;
                }


                io.emit(
                    "clear chat"
                );

            }
        );


        /* =================================================
           DELETE MESSAGE
        ================================================= */

        socket.on(
            "delete message",
            data => {

                if (
                    !data ||
                    !data.messageId
                ) {

                    return;

                }


                const roomId =
                    data.roomId
                        ? String(
                            data.roomId
                        )
                        : null;


                if (!roomId) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        roomId,
                        "deleteMessage"
                    )
                ) {

                    return;

                }


                io.to(
                    "public:" +
                    roomId
                ).emit(
                    "message deleted",
                    {

                        messageId:
                            data.messageId,

                        roomId

                    }
                );


                roomNotice(
                    roomId,
                    "🗑️ تم حذف رسالة"
                );

            }
        );


        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            () => {

                const joinedRooms =
                    [
                        ...(
                            socket.publicRooms ||
                            []
                        )
                    ];


                joinedRooms.forEach(
                    roomId => {

                        socket.leave(
                            "public:" +
                            roomId
                        );

                        broadcastRoomUsers(
                            roomId
                        );

                    }
                );


                users =
                    users.filter(
                        user =>
                            user.id !==
                            socket.id
                    );


                io.emit(
                    "online users",
                    users
                );

            }
        );

    }
);


/* =========================================================
   START
========================================================= */

server.listen(
    process.env.PORT || 3000,
    () => {

        console.log(
            "🚀 Mersal Chat Server Running"
        );

    }
);
