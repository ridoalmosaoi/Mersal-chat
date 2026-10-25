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

/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* =========================================================
   DATA
   ========================================================= */

let users = [];

/*
|--------------------------------------------------------------------------
| OLD GLOBAL SETTINGS
|--------------------------------------------------------------------------
| نحتفظ بها حتى لا ينكسر الشات الحالي.
*/

let chatLocked = false;
let privateLocked = false;
let maintenanceMode = false;
let starsMode = false;

/*
|--------------------------------------------------------------------------
| ADMIN / MODERATION DATA
|--------------------------------------------------------------------------
*/

let admins = [];
let bannedUsers = [];
let mutedUsers = [];
let deviceBannedUsers = [];
let stars = [];
let logs = [];

/*
|--------------------------------------------------------------------------
| ROOMS
|--------------------------------------------------------------------------
*/

let rooms = [];

/*
|--------------------------------------------------------------------------
| ROOM MODERATION
|--------------------------------------------------------------------------
|
| {
|   roomId: {
|      banned: [],
|      muted: [],
|      disconnected: [],
|      stars: []
|   }
| }
|
*/

let roomModeration = {};

/*
|--------------------------------------------------------------------------
| ROOM MESSAGES
|--------------------------------------------------------------------------
|
| محفوظة في الذاكرة أثناء تشغيل السيرفر.
| سنضيف الحفظ لاحقًا إذا احتجناه.
|
*/

const roomMessages = new Map();

/*
|--------------------------------------------------------------------------
| MAX OPEN ROOMS
|--------------------------------------------------------------------------
*/

const MAX_OPEN_ROOMS = 3;

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

        console.error(
            `Error loading ${file}:`,
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

        console.error(
            `Error saving ${file}:`,
            error
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

roomModeration =
    loadFile(
        "roomModeration.json",
        {}
    );

/* =========================================================
   ROOM NORMALIZATION
   ========================================================= */

function normalizeRooms() {

    let changed = false;

    rooms = (Array.isArray(rooms) ? rooms : [])
        .map(room => {

            if (!room || typeof room !== "object") {
                changed = true;
                return null;
            }

            if (!room.id) {

                room.id =
                    "room_" +
                    Date.now() +
                    "_" +
                    Math.random()
                        .toString(36)
                        .slice(2, 8);

                changed = true;
            }

            if (!room.name) {

                room.name = "غرفة";

                changed = true;
            }

            if (
                typeof room.description !==
                "string"
            ) {

                room.description = "";

                changed = true;
            }

            if (
                typeof room.enabled !==
                "boolean"
            ) {

                room.enabled = true;

                changed = true;
            }

            if (
                !room.settings ||
                typeof room.settings !== "object"
            ) {

                room.settings = {};

                changed = true;
            }

            if (
                typeof room.settings.starsMode !==
                "boolean"
            ) {

                room.settings.starsMode = false;

                changed = true;
            }

            if (
                typeof room.settings.chatLocked !==
                "boolean"
            ) {

                room.settings.chatLocked = false;

                changed = true;
            }

            if (
                typeof room.settings.maintenance !==
                "boolean"
            ) {

                room.settings.maintenance = false;

                changed = true;
            }

            if (
                typeof room.settings.protection !==
                "boolean"
            ) {

                room.settings.protection = false;

                changed = true;
            }

            return room;

        })
        .filter(Boolean);

    if (changed) {

        saveFile(
            "rooms.json",
            rooms
        );
    }
}

normalizeRooms();

/* =========================================================
   ROOM MODERATION NORMALIZATION
   ========================================================= */

function ensureRoomModeration(roomId) {

    if (
        !roomModeration[roomId] ||
        typeof roomModeration[roomId] !== "object"
    ) {

        roomModeration[roomId] = {

            banned: [],

            muted: [],

            disconnected: [],

            stars: []

        };

        saveFile(
            "roomModeration.json",
            roomModeration
        );
    }

    if (
        !Array.isArray(
            roomModeration[roomId].banned
        )
    ) {

        roomModeration[roomId].banned = [];
    }

    if (
        !Array.isArray(
            roomModeration[roomId].muted
        )
    ) {

        roomModeration[roomId].muted = [];
    }

    if (
        !Array.isArray(
            roomModeration[roomId].disconnected
        )
    ) {

        roomModeration[roomId].disconnected = [];
    }

    if (
        !Array.isArray(
            roomModeration[roomId].stars
        )
    ) {

        roomModeration[roomId].stars = [];
    }

    return roomModeration[roomId];
}


/* Create moderation data for existing rooms */

rooms.forEach(
    room => ensureRoomModeration(room.id)
);

/* =========================================================
   LOGGING
   ========================================================= */

function addLog(message, roomId = null) {

    const log = {

        time:
            new Date()
                .toLocaleString(),

        message,

        roomId

    };

    logs.unshift(log);

    /*
       Prevent unlimited log growth.
    */

    if (logs.length > 1000) {

        logs =
            logs.slice(0, 1000);
    }

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
   BASIC HELPERS
   ========================================================= */

function getUserBySocket(socket) {

    return users.find(
        user =>
            user.id === socket.id
    );
}


function getUserById(id) {

    return users.find(
        user =>
            user.id === id
    );
}


function getRoom(roomId) {

    return rooms.find(
        room =>
            room.id === roomId
    );
}


function isMasterAdmin(admin) {

    if (!admin) {
        return false;
    }

    return (
        admin.master === true ||
        admin.role === "master" ||
        admin.role === "owner"
    );
}


/*
|--------------------------------------------------------------------------
| MASTER COMPATIBILITY
|--------------------------------------------------------------------------
|
| الأدمن الحالي عندك اسمه "a".
| إذا كان عنده addAdmin نعتبره إداريًا كامل الصلاحيات
| حتى لا نخسر النظام القديم.
|
*/

function isFullAdmin(admin) {

    if (!admin) {
        return false;
    }

    if (isMasterAdmin(admin)) {
        return true;
    }

    if (
        admin.permissions &&
        admin.permissions.addAdmin === true
    ) {

        return true;
    }

    return false;
}


/* =========================================================
   ROOM ADMIN PERMISSION
   ========================================================= */

function adminHasPermission(
    admin,
    roomId,
    permission
) {

    if (!admin) {
        return false;
    }

    /*
       Master / full admin:
       كل الغرف.
    */

    if (
        isMasterAdmin(admin) ||
        isFullAdmin(admin)
    ) {

        return true;
    }

    /*
       If admin has assigned rooms.
    */

    if (
        Array.isArray(admin.rooms) &&
        !admin.rooms.includes(roomId)
    ) {

        return false;
    }

    /*
       Room-specific permissions.
    */

    if (
        admin.roomPermissions &&
        admin.roomPermissions[roomId] &&
        typeof
            admin.roomPermissions[roomId][permission]
            === "boolean"
    ) {

        return (
            admin.roomPermissions[roomId][permission]
        );
    }

    /*
       Global permission fallback.
    */

    return !!(
        admin.permissions &&
        admin.permissions[permission]
    );
}


/* =========================================================
   USER ROLE
   ========================================================= */

function getUserRolePrefix(user) {

    if (!user) {
        return "";
    }

    if (
        user.adminRole === "master"
    ) {

        return "&";
    }

    if (
        user.adminRole === "moderator"
    ) {

        return "@";
    }

    return "";
}


/* =========================================================
   RESERVED USERNAME PROTECTION
   ========================================================= */

function isReservedUsername(username) {

    const value =
        String(username || "")
            .trim();

    if (!value) {
        return true;
    }

    /*
       لا نسمح للمستخدم العادي بتقليد
       رموز الإدارة.
    */

    if (
        value.startsWith("&") ||
        value.startsWith("@")
    ) {

        return true;
    }

    /*
       أيضًا نمنع بعض الصيغ الواضحة
       لتقليد الإدارة.
    */

    if (
        /^(&|@)?admin$/i.test(value) ||
        /^(&|@)?moderator$/i.test(value) ||
        /^(&|@)?owner$/i.test(value) ||
        /^(&|@)?master$/i.test(value)
    ) {

        return true;
    }

    return false;
}


/* =========================================================
   ROOM USERS
   ========================================================= */

function getRoomUsers(roomId) {

    return users
        .filter(
            user =>
                user.roomIds &&
                user.roomIds.includes(roomId)
        )
        .map(user => ({
            id: user.id,
            username: user.username,
            color: user.color,
            isAdmin: user.isAdmin,
            adminRole: user.adminRole,
            prefix:
                getUserRolePrefix(user)
        }));
}


/* =========================================================
   ROOM PUBLIC DATA
   ========================================================= */

function publicRoom(room) {

    if (!room) {
        return null;
    }

    return {

        id: room.id,

        name: room.name,

        description:
            room.description || "",

        enabled:
            room.enabled !== false,

        settings: {

            starsMode:
                !!room.settings?.starsMode,

            chatLocked:
                !!room.settings?.chatLocked,

            maintenance:
                !!room.settings?.maintenance,

            protection:
                !!room.settings?.protection

        }

    };
}


function getPublicRooms() {

    return rooms
        .filter(
            room =>
                room.enabled !== false
        )
        .map(publicRoom);
}


/* =========================================================
   ROOM MESSAGE STORAGE
   ========================================================= */

function getRoomMessages(roomId) {

    if (
        !roomMessages.has(roomId)
    ) {

        roomMessages.set(
            roomId,
            []
        );
    }

    return roomMessages.get(
        roomId
    );
}


function addRoomMessage(
    roomId,
    message
) {

    const messages =
        getRoomMessages(roomId);

    messages.push(message);

    /*
       Keep the latest 300 messages
       in memory.
    */

    if (messages.length > 300) {

        messages.splice(
            0,
            messages.length - 300
        );
    }
}


/* =========================================================
   ROOM ACCESS CHECKS
   ========================================================= */

function roomBanEntry(
    roomId,
    user
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    return moderation.banned.find(
        item =>
            (
                item.username &&
                item.username.toLowerCase() ===
                user.username.toLowerCase()
            )
            ||
            (
                item.ip &&
                item.ip === user.ip
            )
    );
}


function roomMuteEntry(
    roomId,
    user
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    return moderation.muted.find(
        item =>
            (
                item.username &&
                item.username.toLowerCase() ===
                user.username.toLowerCase()
            )
    );
}


function roomDisconnectEntry(
    roomId,
    user
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    return moderation.disconnected.find(
        item =>
            (
                item.username &&
                item.username.toLowerCase() ===
                user.username.toLowerCase()
            )
            ||
            (
                item.device &&
                item.device === user.device
            )
    );
}


function roomHasStar(
    roomId,
    username
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    return moderation.stars
        .some(
            name =>
                String(name).toLowerCase()
                ===
                String(username).toLowerCase()
        );
}


/* =========================================================
   ROOM JOIN / LEAVE
   ========================================================= */

function joinSocketRoom(
    socket,
    roomId
) {

    const room =
        getRoom(roomId);

    if (!room) {

        return {
            ok: false,
            error:
                "❌ الغرفة غير موجودة"
        };
    }

    if (
        room.enabled === false
    ) {

        return {
            ok: false,
            error:
                "🚫 هذه الغرفة غير متاحة حاليًا"
        };
    }

    const user =
        getUserBySocket(socket);

    if (!user) {

        return {
            ok: false,
            error:
                "❌ يجب تسجيل الدخول أولًا"
        };
    }

    if (!socket.openRooms) {

        socket.openRooms =
            new Set();
    }

    /*
       Already open.
    */

    if (
        socket.openRooms.has(roomId)
    ) {

        socket.join(roomId);

        if (!user.roomIds) {
            user.roomIds = [];
        }

        if (
            !user.roomIds.includes(roomId)
        ) {

            user.roomIds.push(roomId);
        }

        return {
            ok: true,
            room
        };
    }

    /*
       Maximum 3 rooms.
    */

    if (
        socket.openRooms.size >=
        MAX_OPEN_ROOMS
    ) {

        return {
            ok: false,
            error:
                "⚠️ يمكنك فتح 3 غرف فقط في نفس الوقت"
        };
    }

    /*
       Room ban.
    */

    const banned =
        roomBanEntry(
            roomId,
            user
        );

    if (banned) {

        return {
            ok: false,
            error:
                "🚫 أنت محظور من هذه الغرفة"
        };
    }

    /*
       Device disconnect.
    */

    const disconnected =
        roomDisconnectEntry(
            roomId,
            user
        );

    if (disconnected) {

        return {
            ok: false,
            error:
                "⛔ تم فصل جهازك من هذه الغرفة"
        };
    }

    socket.join(roomId);

    socket.openRooms.add(
        roomId
    );

    if (!user.roomIds) {

        user.roomIds = [];
    }

    if (
        !user.roomIds.includes(roomId)
    ) {

        user.roomIds.push(
            roomId
        );
    }

    return {
        ok: true,
        room
    };
}


function leaveSocketRoom(
    socket,
    roomId
) {

    const user =
        getUserBySocket(socket);

    socket.leave(roomId);

    if (
        socket.openRooms
    ) {

        socket.openRooms.delete(
            roomId
        );
    }

    if (
        user &&
        Array.isArray(user.roomIds)
    ) {

        user.roomIds =
            user.roomIds.filter(
                id =>
                    id !== roomId
            );
    }
}


/* =========================================================
   ADMIN ROOM ACCESS
   ========================================================= */

function canManageRoom(
    socket,
    roomId,
    permission = null
) {

    if (!socket.adminData) {
        return false;
    }

    if (!roomId) {

        return (
            isMasterAdmin(
                socket.adminData
            ) ||
            isFullAdmin(
                socket.adminData
            )
        );
    }

    if (!permission) {

        return (
            isMasterAdmin(
                socket.adminData
            ) ||
            isFullAdmin(
                socket.adminData
            ) ||
            (
                Array.isArray(
                    socket.adminData.rooms
                ) &&
                socket.adminData.rooms
                    .includes(roomId)
            )
        );
    }

    return adminHasPermission(
        socket.adminData,
        roomId,
        permission
    );
}


/* =========================================================
   API: OLD MODERATION FILES
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
   API: PUBLIC ROOMS
   ========================================================= */

app.get(
    "/rooms.json",
    (req, res) => {

        res.json(
            getPublicRooms()
        );

    }
);


/* =========================================================
   SOCKET.IO
   ========================================================= */

io.on(
    "connection",
    socket => {

        /*
         |--------------------------------------------------------------------------
         | INITIAL SOCKET STATE
         |--------------------------------------------------------------------------
         */

        socket.username = null;

        socket.adminData = null;

        socket.openRooms =
            new Set();


        /* =====================================================
           CHECK ADMIN
           ===================================================== */

        socket.on(
            "check admin",
            name => {

                const isAdmin =
                    admins.some(
                        admin =>
                            String(
                                admin.name
                            ).toLowerCase()
                            ===
                            String(
                                name || ""
                            ).toLowerCase()
                    );

                socket.emit(
                    "admin check result",
                    isAdmin
                );

            }
        );


        /* =====================================================
           USER JOIN
           ===================================================== */

        socket.on(
            "join",
            data => {

                const username =
                    String(
                        data?.username || ""
                    ).trim();

                if (!username) {
                    return;
                }

                /*
                   Reserved username protection.
                   Admins are allowed.
                */

                const possibleAdmin =
                    admins.find(
                        admin =>
                            String(
                                admin.name
                            ).toLowerCase()
                            ===
                            username.toLowerCase()
                    );

                if (
                    !possibleAdmin &&
                    isReservedUsername(
                        username
                    )
                ) {

                    socket.emit(
                        "banned",
                        "⚠️ هذا الاسم محجوز للإدارة"
                    );

                    return;
                }

                /*
                   Duplicate username.
                */

                const exists =
                    users.find(
                        user =>
                            user.username
                                .toLowerCase()
                            ===
                            username.toLowerCase()
                    );

                if (exists) {

                    socket.emit(
                        "banned",
                        "⚠️ الاسم مستخدم"
                    );

                    return;
                }

                /*
                   Device.
                */

                const device =
                    data?.deviceToken ||
                    socket.handshake
                        .headers[
                            "user-agent"
                        ] ||
                    "unknown";


                /*
                   IP.
                */

                const ip =
                    socket.handshake
                        .address;


                /*
                   Global device ban.
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
                   Global IP ban.
                */

                const banned =
                    bannedUsers.find(
                        item =>
                            item.ip === ip
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
                    possibleAdmin;


                if (admin) {

                    if (
                        String(
                            admin.password
                        ) !==
                        String(
                            data?.adminPassword ||
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


                /*
                   ADMIN ROLE
                */

                let adminRole = null;

                if (admin) {

                    if (
                        isMasterAdmin(admin) ||
                        isFullAdmin(admin)
                    ) {

                        adminRole =
                            "master";

                    } else {

                        adminRole =
                            "moderator";
                    }
                }


                /*
                   USER OBJECT
                */

                const user = {

                    id:
                        socket.id,

                    username,

                    color:
                        data?.color ||
                        "#ffd700",

                    ip,

                    device,

                    isAdmin:
                        !!admin,

                    adminRole,

                    prefix:
                        adminRole === "master"
                            ? "&"
                            :
                        adminRole === "moderator"
                            ? "@"
                            : "",

                    roomIds: []

                };


                users.push(user);

                socket.username =
                    username;


                /*
                   Login success.
                   نرسل بيانات إضافية مع الحفاظ
                   على اسم الحدث القديم.
                */

                socket.emit(
                    "login success",
                    {
                        username,
                        isAdmin: !!admin,
                        adminRole,
                        prefix:
                            user.prefix,
                        rooms:
                            getPublicRooms()
                    }
                );


                io.emit(
                    "online users",
                    users
                );


                addLog(
                    `👤 ${username} دخل`
                );

            }
        );


        /* =====================================================
           ADMIN PANEL LOGIN
           ===================================================== */

        function handleAdminLogin(data) {

            const name =
                String(
                    data?.name ||
                    data?.username ||
                    ""
                ).trim();

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
                        ).toLowerCase()
                        ===
                        name.toLowerCase()
                        &&
                        String(
                            item.password
                        ) ===
                        password
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

                    rooms:
                        admin.rooms ||
                        [],

                    role:
                        admin.role ||
                        (
                            isFullAdmin(admin)
                                ? "master"
                                : "moderator"
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


            socket.emit(
                "admin logs",
                logs
            );


            socket.emit(
                "admin rooms",
                rooms.map(
                    publicRoom
                )
            );

        }


        /*
         |--------------------------------------------------------------------------
         | دعم الحدث القديم والجديد
         |--------------------------------------------------------------------------
         */

        socket.on(
            "admin panel login",
            handleAdminLogin
        );

        socket.on(
            "admin.panel login",
            handleAdminLogin
        );


        /* =====================================================
           GET ADMIN ROOMS
           ===================================================== */

        socket.on(
            "get admin rooms",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }

                socket.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );

            }
        );


        /* =====================================================
           GET ONLINE USERS
           ===================================================== */

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
                    users
                );

            }
        );


        /* =====================================================
           GET STATS
           ===================================================== */

        socket.on(
            "get stats",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }

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
        );


        /* =====================================================
           GET LOGS
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
                    "admin logs",
                    logs
                );

            }
        );


        /* =====================================================
           CREATE ROOM
           ===================================================== */

        socket.on(
            "create room",
            data => {

                if (
                    !socket.adminData
                ) {
                    socket.emit(
                        "room error",
                        "❌ يجب تسجيل الدخول كأدمن"
                    );

                    return;
                }


                if (
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية إنشاء الغرف"
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
                        "❌ اكتب اسم الغرفة"
                    );

                    return;
                }


                const exists =
                    rooms.find(
                        room =>
                            room.name
                                .toLowerCase()
                            ===
                            name.toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "room error",
                        "⚠️ هذه الغرفة موجودة مسبقًا"
                    );

                    return;
                }


                const room = {

                    id:
                        "room_" +
                        Date.now() +
                        "_" +
                        Math.random()
                            .toString(36)
                            .slice(2, 8),

                    name,

                    description,

                    enabled: true,

                    settings: {

                        starsMode: false,

                        chatLocked: false,

                        maintenance: false,

                        protection: false

                    }

                };


                rooms.push(room);


                ensureRoomModeration(
                    room.id
                );


                saveFile(
                    "rooms.json",
                    rooms
                );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                socket.emit(
                    "room created",
                    room
                );


                io.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                addLog(
                    `🏠 تم إنشاء الغرفة ${name}`,
                    room.id
                );

            }
        );
                // =========================================================
        // ROOM JOIN
        // =========================================================

        socket.on(
            "join room",
            data => {

                if (!socket.username) {
                    socket.emit(
                        "room error",
                        "❌ يجب تسجيل الدخول أولاً"
                    );

                    return;
                }


                const roomId =
                    String(
                        data?.roomId || ""
                    );


                const room =
                    rooms.find(
                        r =>
                            r.id === roomId
                    );


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
                        "⛔ هذه الغرفة متوقفة حالياً"
                    );

                    return;
                }


                if (
                    isBannedFromRoom(
                        room.id,
                        socket.username,
                        getIP(socket)
                    )
                ) {

                    socket.emit(
                        "room error",
                        "🚫 أنت محظور من هذه الغرفة"
                    );

                    return;
                }


                if (
                    isDeviceBannedFromRoom(
                        room.id,
                        getDevice(socket)
                    )
                ) {

                    socket.emit(
                        "room error",
                        "🚫 جهازك محظور من هذه الغرفة"
                    );

                    return;
                }


                if (socket.currentRoom) {

                    socket.leave(
                        socket.currentRoom
                    );

                }


                socket.join(room.id);

                socket.currentRoom =
                    room.id;


                ensureRoomModeration(
                    room.id
                );


                const moderation =
                    roomModeration[
                        room.id
                    ];


                const roomAdmins =
                    moderation.admins || [];


                const isAssigned =
                    roomAdmins.includes(
                        socket.username
                    );


                socket.roomAdmin =
                    isAssigned;


                socket.emit(
                    "room joined",
                    {
                        room,
                        moderation,
                        isAdmin:
                            isAssigned ||
                            isFullAdmin(
                                socket.adminData
                            )
                    }
                );


                if (
                    isAssigned &&
                    socket.username
                ) {

                    socket.emit(
                        "room notice",
                        {
                            type:
                                "admin assigned",

                            message:
                                `✨ تم توكيل ${socket.username}`
                        }
                    );

                }


                io.to(room.id).emit(
                    "room users",
                    getRoomUsers(
                        room.id
                    )
                );


                addLog(
                    `🚪 ${socket.username} دخل الغرفة ${room.name}`,
                    room.id
                );

            }
        );


        // =========================================================
        // LEAVE ROOM
        // =========================================================

        socket.on(
            "leave room",
            () => {

                if (!socket.currentRoom) {
                    return;
                }


                const oldRoom =
                    socket.currentRoom;


                socket.leave(
                    oldRoom
                );


                socket.currentRoom =
                    null;


                socket.roomAdmin =
                    false;


                io.to(oldRoom).emit(
                    "room users",
                    getRoomUsers(
                        oldRoom
                    )
                );

            }
        );


        // =========================================================
        // GET ROOM USERS
        // =========================================================

        socket.on(
            "get room users",
            () => {

                if (!socket.currentRoom) {
                    return;
                }


                socket.emit(
                    "room users",
                    getRoomUsers(
                        socket.currentRoom
                    )
                );

            }
        );


        // =========================================================
        // PUBLIC CHAT MESSAGE
        // =========================================================

        socket.on(
            "chat message",
            data => {

                if (!socket.username) {
                    return;
                }


                const roomId =
                    socket.currentRoom;


                if (!roomId) {

                    socket.emit(
                        "chat error",
                        "❌ اختر غرفة أولاً"
                    );

                    return;
                }


                const room =
                    rooms.find(
                        r =>
                            r.id === roomId
                    );


                if (!room) {
                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                if (
                    moderation.bannedUsers
                    .some(
                        user =>
                            user.name ===
                            socket.username
                    )
                ) {

                    socket.emit(
                        "chat error",
                        "🚫 أنت محظور من هذه الغرفة"
                    );

                    return;
                }


                if (
                    moderation.mutedUsers
                    .some(
                        user =>
                            user.name ===
                            socket.username
                    )
                ) {

                    socket.emit(
                        "chat error",
                        "🔇 أنت مكتوم في هذه الغرفة"
                    );

                    return;
                }


                if (
                    room.settings &&
                    room.settings.chatLocked
                ) {

                    const allowed =
                        hasRoomPermission(
                            socket,
                            "chatLock"
                        );


                    if (!allowed) {

                        socket.emit(
                            "chat error",
                            "🔒 الدردشة مقفلة حالياً"
                        );

                        return;
                    }

                }


                if (
                    room.settings &&
                    room.settings.maintenance
                ) {

                    const allowed =
                        hasRoomPermission(
                            socket,
                            "maintenance"
                        );


                    if (!allowed) {

                        socket.emit(
                            "chat error",
                            "🛠️ الغرفة تحت الصيانة حالياً"
                        );

                        return;
                    }

                }


                const message =
                    String(
                        data?.message || ""
                    ).trim();


                if (!message) {
                    return;
                }


                if (message.length > 2000) {

                    socket.emit(
                        "chat error",
                        "❌ الرسالة طويلة جداً"
                    );

                    return;
                }


                const reply =
                    data?.reply || null;


                const messageData = {

                    id:
                        "msg_" +
                        Date.now() +
                        "_" +
                        Math.random()
                            .toString(36)
                            .slice(2, 8),

                    roomId,

                    name:
                        socket.username,

                    message,

                    reply,

                    time:
                        new Date()
                            .toLocaleTimeString(
                                "no-NO",
                                {
                                    hour:
                                        "2-digit",

                                    minute:
                                        "2-digit"
                                }
                            )

                };


                io.to(roomId).emit(
                    "chat message",
                    messageData
                );


                addLog(
                    `💬 ${socket.username}: ${message}`,
                    roomId
                );

            }
        );


        // =========================================================
        // PRIVATE MESSAGE
        // =========================================================

        socket.on(
            "private message",
            data => {

                if (!socket.username) {
                    return;
                }


                const target =
                    String(
                        data?.to || ""
                    ).trim();


                const message =
                    String(
                        data?.message || ""
                    ).trim();


                if (!target || !message) {
                    return;
                }


                if (
                    privateLocked &&
                    !socket.adminData
                ) {

                    socket.emit(
                        "private error",
                        "🔒 المحادثات الخاصة مقفلة"
                    );

                    return;
                }


                const targetSocket =
                    users
                        .map(
                            item =>
                                item.socket
                        )
                        .find(
                            s =>
                                s &&
                                s.username ===
                                target
                        );


                if (!targetSocket) {

                    socket.emit(
                        "private error",
                        "❌ المستخدم غير متصل"
                    );

                    return;
                }


                const privateData = {

                    id:
                        "pm_" +
                        Date.now() +
                        "_" +
                        Math.random()
                            .toString(36)
                            .slice(2, 8),

                    from:
                        socket.username,

                    to:
                        target,

                    message,

                    time:
                        new Date()
                            .toLocaleTimeString(
                                "no-NO",
                                {
                                    hour:
                                        "2-digit",

                                    minute:
                                        "2-digit"
                                }
                            )

                };


                socket.emit(
                    "private message",
                    privateData
                );


                targetSocket.emit(
                    "private message",
                    privateData
                );


                targetSocket.emit(
                    "private notification",
                    {
                        from:
                            socket.username,

                        message
                    }
                );

            }
        );


        // =========================================================
        // CREATE ROOM
        // =========================================================

        socket.on(
            "create room",
            data => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                if (
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية إنشاء الغرف"
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
                        "❌ اكتب اسم الغرفة"
                    );

                    return;
                }


                const exists =
                    rooms.find(
                        room =>
                            room.name
                                .toLowerCase()
                            ===
                            name.toLowerCase()
                    );


                if (exists) {

                    socket.emit(
                        "room error",
                        "⚠️ هذه الغرفة موجودة مسبقاً"
                    );

                    return;
                }


                const room = {

                    id:
                        "room_" +
                        Date.now() +
                        "_" +
                        Math.random()
                            .toString(36)
                            .slice(2, 8),

                    name,

                    description,

                    enabled: true,

                    settings: {

                        starsMode: false,

                        chatLocked: false,

                        maintenance: false,

                        protection: false

                    }

                };


                rooms.push(room);


                ensureRoomModeration(
                    room.id
                );


                saveFile(
                    "rooms.json",
                    rooms
                );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                socket.emit(
                    "room created",
                    room
                );


                io.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                addLog(
                    `🏠 تم إنشاء الغرفة ${name}`,
                    room.id
                );

            }
        );


        // =========================================================
        // DELETE ROOM
        // =========================================================

        socket.on(
            "delete room",
            roomId => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                if (
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية حذف الغرف"
                    );

                    return;
                }


                const room =
                    rooms.find(
                        r =>
                            r.id ===
                            roomId
                    );


                if (!room) {
                    return;
                }


                io.to(roomId).emit(
                    "room deleted"
                );


                rooms =
                    rooms.filter(
                        r =>
                            r.id !==
                            roomId
                    );


                delete roomModeration[
                    roomId
                ];


                saveFile(
                    "rooms.json",
                    rooms
                );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                addLog(
                    `🗑️ تم حذف الغرفة ${room.name}`,
                    roomId
                );

            }
        );


        // =========================================================
        // EDIT ROOM
        // =========================================================

        socket.on(
            "edit room",
            data => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                if (
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية تعديل الغرف"
                    );

                    return;
                }


                const room =
                    rooms.find(
                        r =>
                            r.id ===
                            data?.roomId
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
                        "❌ اسم الغرفة مطلوب"
                    );

                    return;
                }


                const duplicate =
                    rooms.find(
                        r =>
                            r.id !== room.id &&
                            r.name
                                .toLowerCase()
                            ===
                            name.toLowerCase()
                    );


                if (duplicate) {

                    socket.emit(
                        "room error",
                        "⚠️ يوجد غرفة بهذا الاسم"
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


                socket.emit(
                    "room updated",
                    room
                );


                io.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                io.to(room.id).emit(
                    "room information updated",
                    publicRoom(room)
                );

            }
        );


        // =========================================================
        // ENABLE / DISABLE ROOM
        // =========================================================

        socket.on(
            "toggle room",
            roomId => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                if (
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {
                    return;
                }


                const room =
                    rooms.find(
                        r =>
                            r.id ===
                            roomId
                    );


                if (!room) {
                    return;
                }


                room.enabled =
                    !room.enabled;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.emit(
                    "admin rooms",
                    rooms.map(
                        publicRoom
                    )
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                io.to(roomId).emit(
                    "room status",
                    {
                        enabled:
                            room.enabled
                    }
                );

            }
        );


        // =========================================================
        // ROOM SETTINGS
        // =========================================================

        socket.on(
            "room setting",
            data => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                const roomId =
                    String(
                        data?.roomId || ""
                    );


                const setting =
                    String(
                        data?.setting || ""
                    );


                const value =
                    Boolean(
                        data?.value
                    );


                const room =
                    rooms.find(
                        r =>
                            r.id ===
                            roomId
                    );


                if (!room) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        setting,
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك هذه الصلاحية في الغرفة"
                    );

                    return;
                }


                const allowedSettings = [

                    "starsMode",

                    "chatLocked",

                    "maintenance",

                    "protection"

                ];


                if (
                    !allowedSettings.includes(
                        setting
                    )
                ) {
                    return;
                }


                room.settings[
                    setting
                ] =
                    value;


                saveFile(
                    "rooms.json",
                    rooms
                );


                io.to(roomId).emit(
                    "room setting changed",
                    {
                        setting,
                        value
                    }
                );


                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );


                addLog(
                    `⚙️ ${setting} = ${value}`,
                    roomId
                );

            }
        );


        // =========================================================
        // ASSIGN ADMIN TO ROOM
        // =========================================================

        socket.on(
            "assign room admin",
            data => {

                if (
                    !socket.adminData ||
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية تعيين الأدمن"
                    );

                    return;
                }


                const roomId =
                    String(
                        data?.roomId || ""
                    );


                const adminName =
                    String(
                        data?.adminName || ""
                    ).trim();


                const room =
                    rooms.find(
                        r =>
                            r.id ===
                            roomId
                    );


                if (!room) {
                    return;
                }


                const admin =
                    admins.find(
                        a =>
                            a.name ===
                            adminName
                    );


                if (!admin) {

                    socket.emit(
                        "room error",
                        "❌ الأدمن غير موجود"
                    );

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                if (
                    !moderation.admins
                        .includes(
                            adminName
                        )
                ) {

                    moderation.admins.push(
                        adminName
                    );

                }


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.emit(
                    "room admins updated",
                    {
                        roomId,

                        admins:
                            moderation.admins
                    }
                );


                addLog(
                    `👑 تم تعيين ${adminName} في ${room.name}`,
                    roomId
                );

            }
        );


        // =========================================================
        // REMOVE ADMIN FROM ROOM
        // =========================================================

        socket.on(
            "remove room admin",
            data => {

                if (
                    !socket.adminData ||
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {
                    return;
                }


                const roomId =
                    String(
                        data?.roomId || ""
                    );


                const adminName =
                    String(
                        data?.adminName || ""
                    ).trim();


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                moderation.admins =
                    moderation.admins.filter(
                        name =>
                            name !==
                            adminName
                    );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.emit(
                    "room admins updated",
                    {
                        roomId,

                        admins:
                            moderation.admins
                    }
                );

            }
        );


        // =========================================================
        // GIVE STAR
        // =========================================================

        socket.on(
            "give star",
            data => {

                const roomId =
                    socket.currentRoom;


                if (!roomId) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "stars",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية النجوم في هذه الغرفة"
                    );

                    return;
                }


                const target =
                    String(
                        data?.username || ""
                    ).trim();


                if (!target) {
                    return;
                }


                const roomStars =
                    getRoomStars(
                        roomId
                    );


                if (
                    !roomStars.includes(
                        target
                    )
                ) {

                    roomStars.push(
                        target
                    );

                }


                saveFile(
                    "stars.json",
                    stars
                );


                io.to(roomId).emit(
                    "room stars updated",
                    roomStars
                );


                addLog(
                    `⭐ تم إعطاء نجمة لـ ${target}`,
                    roomId
                );

            }
        );


        // =========================================================
        // REMOVE STAR
        // =========================================================

        socket.on(
            "remove star",
            data => {

                const roomId =
                    socket.currentRoom;


                if (
                    !hasRoomPermission(
                        socket,
                        "stars",
                        roomId
                    )
                ) {
                    return;
                }


                const target =
                    String(
                        data?.username || ""
                    ).trim();


                const roomStars =
                    getRoomStars(
                        roomId
                    );


                stars[roomId] =
                    roomStars.filter(
                        name =>
                            name !==
                            target
                    );


                saveFile(
                    "stars.json",
                    stars
                );


                io.to(roomId).emit(
                    "room stars updated",
                    stars[roomId]
                );

            }
        );
                // =========================================================
        // KICK USER FROM ROOM
        // =========================================================

        socket.on(
            "kick user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "kick",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الطرد في هذه الغرفة"
                    );

                    return;
                }


                const targetSocket =
                    findUserSocketInRoom(
                        roomId,
                        targetName
                    );


                if (!targetSocket) {

                    socket.emit(
                        "room error",
                        "❌ المستخدم غير موجود في الغرفة"
                    );

                    return;
                }


                targetSocket.emit(
                    "room kicked",
                    {
                        roomId,
                        username:
                            targetName,

                        message:
                            "👢 تم طردك من الغرفة"
                    }
                );


                targetSocket.leave(
                    roomId
                );


                if (
                    targetSocket.currentRoom ===
                    roomId
                ) {

                    targetSocket.currentRoom =
                        null;

                    targetSocket.roomAdmin =
                        false;

                }


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "kick",

                        username:
                            targetName,

                        message:
                            `👢 تم طرد ${targetName} من الغرفة`
                    }
                );


                io.to(roomId).emit(
                    "room users",
                    getRoomUsers(roomId)
                );


                addLog(
                    `👢 تم طرد ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // BAN USER FROM ROOM
        // =========================================================

        socket.on(
            "ban user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "ban",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الحظر في هذه الغرفة"
                    );

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                const targetSocket =
                    findUserSocketInRoom(
                        roomId,
                        targetName
                    );


                let targetIP = "";
                let targetDevice = "";


                if (targetSocket) {

                    targetIP =
                        getIP(
                            targetSocket
                        );

                    targetDevice =
                        getDevice(
                            targetSocket
                        );

                }


                const alreadyBanned =
                    moderation.bannedUsers.some(
                        user =>
                            user.name ===
                            targetName
                    );


                if (!alreadyBanned) {

                    moderation.bannedUsers.push(
                        {
                            name:
                                targetName,

                            ip:
                                targetIP,

                            device:
                                targetDevice,

                            time:
                                new Date()
                                    .toISOString()
                        }
                    );

                }


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                if (targetSocket) {

                    targetSocket.emit(
                        "room banned",
                        {
                            roomId,

                            username:
                                targetName,

                            message:
                                "🚫 تم حظرك من الغرفة"
                        }
                    );


                    targetSocket.leave(
                        roomId
                    );


                    if (
                        targetSocket.currentRoom ===
                        roomId
                    ) {

                        targetSocket.currentRoom =
                            null;

                        targetSocket.roomAdmin =
                            false;

                    }

                }


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "ban",

                        username:
                            targetName,

                        message:
                            `🚫 تم حظر ${targetName} من الغرفة`
                    }
                );


                io.to(roomId).emit(
                    "room users",
                    getRoomUsers(roomId)
                );


                addLog(
                    `🚫 تم حظر ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // MUTE USER
        // =========================================================

        socket.on(
            "mute user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "mute",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الكتم في هذه الغرفة"
                    );

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                const exists =
                    moderation.mutedUsers.some(
                        user =>
                            user.name ===
                            targetName
                    );


                if (!exists) {

                    moderation.mutedUsers.push(
                        {
                            name:
                                targetName,

                            time:
                                new Date()
                                    .toISOString()
                        }
                    );

                }


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "mute",

                        username:
                            targetName,

                        message:
                            `🔇 تم كتم ${targetName}`
                    }
                );


                const targetSocket =
                    findUserSocketInRoom(
                        roomId,
                        targetName
                    );


                if (targetSocket) {

                    targetSocket.emit(
                        "room muted",
                        {
                            roomId,

                            username:
                                targetName
                        }
                    );

                }


                addLog(
                    `🔇 تم كتم ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // UNBAN USER
        // =========================================================

        socket.on(
            "unban user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "unban",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية فك الحظر"
                    );

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                moderation.bannedUsers =
                    moderation.bannedUsers.filter(
                        user =>
                            user.name !==
                            targetName
                    );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "unban",

                        username:
                            targetName,

                        message:
                            `🔓 تم فك حظر ${targetName}`
                    }
                );


                addLog(
                    `🔓 تم فك حظر ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // UNMUTE USER
        // =========================================================

        socket.on(
            "unmute user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "mute",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية فك الكتم"
                    );

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                moderation.mutedUsers =
                    moderation.mutedUsers.filter(
                        user =>
                            user.name !==
                            targetName
                    );


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "unmute",

                        username:
                            targetName,

                        message:
                            `🔊 تم فك كتم ${targetName}`
                    }
                );


                addLog(
                    `🔊 تم فك كتم ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // DISCONNECT USER FROM SERVER
        // =========================================================

        socket.on(
            "disconnect user",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const targetName =
                    String(
                        data?.username || ""
                    ).trim();


                if (!roomId || !targetName) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "disconnect",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الفصل"
                    );

                    return;
                }


                const targetSocket =
                    findUserSocketInRoom(
                        roomId,
                        targetName
                    );


                if (!targetSocket) {
                    return;
                }


                targetSocket.emit(
                    "room disconnected",
                    {
                        roomId,

                        message:
                            "⛔ تم فصلك من الغرفة"
                    }
                );


                targetSocket.disconnect(
                    true
                );


                io.to(roomId).emit(
                    "room moderation notice",
                    {
                        type:
                            "disconnect",

                        username:
                            targetName,

                        message:
                            `⛔ تم فصل ${targetName} من الغرفة`
                    }
                );


                addLog(
                    `⛔ تم فصل ${targetName}`,
                    roomId
                );

            }
        );


        // =========================================================
        // DELETE MESSAGE
        // =========================================================

        socket.on(
            "delete message",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                const messageId =
                    String(
                        data?.messageId || ""
                    );


                if (!roomId || !messageId) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "deleteMessage",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية حذف الرسائل"
                    );

                    return;
                }


                io.to(roomId).emit(
                    "message deleted",
                    {
                        roomId,

                        messageId
                    }
                );


                addLog(
                    `🗑️ تم حذف رسالة ${messageId}`,
                    roomId
                );

            }
        );


        // =========================================================
        // CLEAR ROOM CHAT
        // =========================================================

        socket.on(
            "clear room chat",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );


                if (!roomId) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "clear",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية مسح الدردشة"
                    );

                    return;
                }


                io.to(roomId).emit(
                    "room chat cleared",
                    {
                        roomId
                    }
                );


                addLog(
                    "🧹 تم مسح دردشة الغرفة",
                    roomId
                );

            }
        );


        // =========================================================
        // GET ROOM MODERATION DATA
        // =========================================================

        socket.on(
            "get room moderation",
            roomId => {

                roomId =
                    String(
                        roomId ||
                        socket.currentRoom ||
                        ""
                    );


                if (!roomId) {
                    return;
                }


                if (
                    !hasRoomPermission(
                        socket,
                        "viewUserInfo",
                        roomId
                    ) &&
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                socket.emit(
                    "room moderation data",
                    {
                        roomId,

                        moderation
                    }
                );

            }
        );


        // =========================================================
        // VIEW USER INFORMATION
        // =========================================================

        socket.on(
            "view user",
            data => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                if (
                    !socket.adminData.permissions
                        ?.viewUserInfo
                    &&
                    !socket.adminData.permissions
                        ?.viewIP
                ) {
                    return;
                }


                const username =
                    String(
                        data?.username || ""
                    ).trim();


                const target =
                    users.find(
                        user =>
                            user.username ===
                            username
                    );


                if (!target) {

                    socket.emit(
                        "user info",
                        null
                    );

                    return;
                }


                socket.emit(
                    "user info",
                    {
                        username:
                            target.username,

                        ip:
                            target.ip,

                        device:
                            target.device,

                        userAgent:
                            target.userAgent,

                        room:
                            target.socket
                                ?.currentRoom ||
                            null
                    }
                );

            }
        );


        // =========================================================
        // ADD ADMIN
        // =========================================================

        socket.on(
            "add admin",
            data => {

                if (
                    !socket.adminData ||
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية إضافة أدمن"
                    );

                    return;
                }


                const name =
                    String(
                        data?.name || ""
                    ).trim();


                const password =
                    String(
                        data?.password || ""
                    );


                if (!name || !password) {

                    socket.emit(
                        "admin error",
                        "❌ الاسم وكلمة المرور مطلوبان"
                    );

                    return;
                }


                if (
                    admins.some(
                        admin =>
                            admin.name ===
                            name
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⚠️ هذا الأدمن موجود مسبقاً"
                    );

                    return;
                }


                const newAdmin = {

                    name,

                    password,

                    permissions:
                        data?.permissions ||
                        {
                            kick: false,
                            ban: false,
                            disconnect: false,
                            unban: false,
                            mute: false,
                            clear: false,
                            maintenance: false,
                            chatLock: false,
                            privateLock: false,
                            deleteMessage: false,
                            addAdmin: false,
                            removeAdmin: false,
                            viewIP: false,
                            viewUserInfo: false,
                            stars: false
                        }

                };


                admins.push(
                    newAdmin
                );


                saveFile(
                    "admins.json",
                    admins
                );


                socket.emit(
                    "admin added",
                    newAdmin
                );


                io.emit(
                    "admins updated",
                    admins.map(
                        admin => ({
                            name:
                                admin.name,

                            permissions:
                                admin.permissions
                        })
                    )
                );


                addLog(
                    `👑 تمت إضافة الأدمن ${name}`
                );

            }
        );


        // =========================================================
        // REMOVE ADMIN
        // =========================================================

        socket.on(
            "remove admin",
            data => {

                if (
                    !socket.adminData ||
                    !isFullAdmin(
                        socket.adminData
                    )
                ) {
                    return;
                }


                const name =
                    String(
                        data?.name || ""
                    ).trim();


                if (!name) {
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


                for (
                    const roomId
                    in roomModeration
                ) {

                    const moderation =
                        roomModeration[
                            roomId
                        ];


                    if (
                        moderation &&
                        Array.isArray(
                            moderation.admins
                        )
                    ) {

                        moderation.admins =
                            moderation.admins.filter(
                                adminName =>
                                    adminName !==
                                    name
                            );

                    }

                }


                saveFile(
                    "roomModeration.json",
                    roomModeration
                );


                io.emit(
                    "admins updated",
                    admins.map(
                        admin => ({
                            name:
                                admin.name,

                            permissions:
                                admin.permissions
                        })
                    )
                );


                addLog(
                    `🗑️ تمت إزالة الأدمن ${name}`
                );

            }
        );


        // =========================================================
        // ROOM ADMIN LIST
        // =========================================================

        socket.on(
            "get room admins",
            roomId => {

                roomId =
                    String(
                        roomId || ""
                    );


                if (!roomId) {
                    return;
                }


                const moderation =
                    ensureRoomModeration(
                        roomId
                    );


                socket.emit(
                    "room admins updated",
                    {
                        roomId,

                        admins:
                            moderation.admins
                    }
                );

            }
        );


        // =========================================================
        // ADMIN LOGOUT
        // =========================================================

        socket.on(
            "admin logout",
            () => {

                socket.adminData =
                    null;

                socket.roomAdmin =
                    false;

            }
        );


        // =========================================================
        // USER DISCONNECT
        // =========================================================

        socket.on(
            "disconnect",
            reason => {

                const username =
                    socket.username;


                if (username) {

                    users =
                        users.filter(
                            user =>
                                user.socket !==
                                socket
                        );


                    io.emit(
                        "online users",
                        users.map(
                            user =>
                                user.username
                        )
                    );


                    if (
                        socket.currentRoom
                    ) {

                        io.to(
                            socket.currentRoom
                        ).emit(
                            "room users",
                            getRoomUsers(
                                socket.currentRoom
                            )
                        );

                    }


                    addLog(
                        `🔴 ${username} خرج من السيرفر`
                    );

                }

            }
        );

    }
);


// =============================================================
// SERVER START
// =============================================================

const PORT =
    process.env.PORT ||
    3000;


server.listen(
    PORT,
    () => {

        console.log(
            `🚀 Mersal Chat running on port ${PORT}`
        );

    }
);
