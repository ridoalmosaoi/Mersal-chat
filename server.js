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
app.use(express.urlencoded({ extended: true }));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/* =========================================================
   DATA
   ========================================================= */

const DATA_DIR = __dirname;

function dataFile(name) {
    return path.join(DATA_DIR, name);
}

function loadJSON(name, fallback) {

    try {

        const file = dataFile(name);

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

        const raw =
            fs.readFileSync(
                file,
                "utf8"
            );

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);

    } catch (error) {

        console.error(
            "❌ LOAD ERROR:",
            name,
            error
        );

        return fallback;
    }
}


function saveJSON(name, data) {

    try {

        fs.writeFileSync(
            dataFile(name),
            JSON.stringify(
                data,
                null,
                2
            )
        );

    } catch (error) {

        console.error(
            "❌ SAVE ERROR:",
            name,
            error
        );
    }
}


/* =========================================================
   DATABASE
   ========================================================= */

let users =
    [];

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

let roomMessages =
    loadJSON(
        "roomMessages.json",
        {}
    );

let roomStars =
    loadJSON(
        "roomStars.json",
        {}
    );

let roomModeration =
    loadJSON(
        "roomModeration.json",
        {}
    );


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let globalState =
    loadJSON(
        "globalState.json",
        {
            chatLocked: false,
            privateLocked: false,
            maintenance: false,
            starsMode: false,
            disconnect: false
        }
    );


let globalChatLocked =
    globalState.chatLocked === true;

let globalPrivateLocked =
    globalState.privateLocked === true;

let globalMaintenance =
    globalState.maintenance === true;

let globalStarsMode =
    globalState.starsMode === true;

let globalDisconnect =
    globalState.disconnect === true;


const GLOBAL_CONTROL_PASSWORD =
    process.env.GLOBAL_CONTROL_PASSWORD ||
    "MersalGlobal2026";


const GLOBAL_CONTROL_PATH =
    process.env.GLOBAL_CONTROL_PATH ||
    "/global-control-7xK9";


function saveGlobalState() {

    globalState = {
        chatLocked:
            globalChatLocked,

        privateLocked:
            globalPrivateLocked,

        maintenance:
            globalMaintenance,

        starsMode:
            globalStarsMode,

        disconnect:
            globalDisconnect
    };

    saveJSON(
        "globalState.json",
        globalState
    );
}


/* =========================================================
   HELPERS
   ========================================================= */

function makeId(prefix = "id") {

    return (
        prefix +
        "_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );
}


function cleanName(value) {

    return String(
        value || ""
    )
        .trim()
        .replace(/\s+/g, " ");
}


function sameName(a, b) {

    return (
        cleanName(a).toLowerCase() ===
        cleanName(b).toLowerCase()
    );
}


function getIP(socket) {

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

    return String(
        socket.handshake.address ||
        "unknown"
    );
}


function getDevice(socket, data = {}) {

    return String(
        data.deviceToken ||
        socket.handshake.headers[
            "user-agent"
        ] ||
        "unknown"
    );
}


function getUser(socket) {

    return users.find(
        user =>
            user.socketId ===
            socket.id
    );
}


function getUserByName(name) {

    return users.find(
        user =>
            sameName(
                user.name,
                name
            )
    );
}


function getAdminByName(name) {

    return admins.find(
        admin =>
            sameName(
                admin.name,
                name
            )
    );
}


function isMasterAdmin(admin) {

    if (!admin) {
        return false;
    }

    if (
        String(
            admin.role || ""
        ).toLowerCase() ===
        "master"
    ) {
        return true;
    }

    /*
       إذا كان ملف admins.json القديم
       لا يحتوي role، فإن أول أدمن
       يعتبر Master.
    */

    if (
        admins.length > 0 &&
        admins[0] === admin
    ) {
        return true;
    }

    return false;
}


function isAdmin(socket) {

    return !!(
        socket &&
        socket.adminData
    );
}


function hasPermission(
    socket,
    permission
) {

    if (!socket?.adminData) {
        return false;
    }

    if (
        isMasterAdmin(
            socket.adminData
        )
    ) {
        return true;
    }

    return (
        socket.adminData.permissions &&
        socket.adminData.permissions[
            permission
        ] === true
    );
}


/* =========================================================
   ROOM HELPERS
   ========================================================= */

function normalizeRoom(room) {

    return {

        id:
            String(
                room?.id ||
                makeId("room")
            ),

        name:
            cleanName(
                room?.name ||
                "غرفة"
            ),

        description:
            String(
                room?.description ||
                ""
            ).trim(),

        enabled:
            room?.enabled !== false,

        settings: {

            chatLock:
                room?.settings?.chatLock === true,

            maintenance:
                room?.settings?.maintenance === true,

            starsMode:
                room?.settings?.starsMode === true,

            protection:
                room?.settings?.protection !== false
        },

        createdAt:
            room?.createdAt ||
            new Date().toISOString()
    };
}


rooms =
    rooms.map(
        normalizeRoom
    );


function getRoom(roomId) {

    return rooms.find(
        room =>
            String(room.id) ===
            String(roomId)
    );
}


function ensureRoom(roomId) {

    if (
        !roomModeration[roomId]
    ) {

        roomModeration[roomId] = {

            admins: [],

            banned: [],

            muted: [],

            disconnected: [],

            kicked: []
        };
    }

    return roomModeration[
        roomId
    ];
}


function ensureRoomMessages(
    roomId
) {

    if (
        !Array.isArray(
            roomMessages[roomId]
        )
    ) {

        roomMessages[roomId] = [];
    }

    return roomMessages[
        roomId
    ];
}


function ensureRoomStars(
    roomId
) {

    if (
        !Array.isArray(
            roomStars[roomId]
        )
    ) {

        roomStars[roomId] = [];
    }

    return roomStars[
        roomId
    ];
}


function roomUserList(
    roomId
) {

    return users
        .filter(
            user =>
                String(
                    user.roomId
                ) ===
                String(roomId)
        )
        .map(
            user => ({
                name:
                    user.name,

                username:
                    user.name,

                color:
                    user.color ||
                    "#ffd700",

                isAdmin:
                    !!user.isAdmin
            })
        );
}


function roomModerationList(
    roomId,
    type
) {

    const moderation =
        ensureRoom(
            roomId
        );

    if (
        !Array.isArray(
            moderation[type]
        )
    ) {

        moderation[type] = [];
    }

    return moderation[
        type
    ];
}


function roomHasUser(
    roomId,
    listName,
    username
) {

    const list =
        roomModerationList(
            roomId,
            listName
        );

    return list.some(
        item => {

            const name =
                typeof item ===
                "string"
                    ? item
                    : item?.name;

            return sameName(
                name,
                username
            );
        }
    );
}


function roomIsBanned(
    roomId,
    username
) {

    return roomHasUser(
        roomId,
        "banned",
        username
    );
}


function roomIsMuted(
    roomId,
    username
) {

    return roomHasUser(
        roomId,
        "muted",
        username
    );
}


function roomIsDisconnected(
    roomId,
    username
) {

    return roomHasUser(
        roomId,
        "disconnected",
        username
    );
}


function roomIsKicked(
    roomId,
    username
) {

    return roomHasUser(
        roomId,
        "kicked",
        username
    );
}


/* =========================================================
   ROOM ADMIN PERMISSION
   ========================================================= */

function isRoomAdmin(
    socket,
    roomId
) {

    if (!socket?.adminData) {
        return false;
    }

    if (
        isMasterAdmin(
            socket.adminData
        )
    ) {
        return true;
    }

    const moderation =
        ensureRoom(
            roomId
        );

    return moderation.admins.some(
        name =>
            sameName(
                name,
                socket.adminData.name
            )
    );
}


function canManageRoom(
    socket,
    roomId,
    permission
) {

    if (!socket?.adminData) {
        return false;
    }

    if (
        isMasterAdmin(
            socket.adminData
        )
    ) {
        return true;
    }

    if (
        !isRoomAdmin(
            socket,
            roomId
        )
    ) {
        return false;
    }

    return hasPermission(
        socket,
        permission
    );
}


/* =========================================================
   PUBLIC USER DATA
   ========================================================= */

function publicUser(
    user
) {

    return {

        name:
            user.name,

        username:
            user.name,

        color:
            user.color ||
            "#ffd700",

        roomId:
            user.roomId ||
            null,

        isAdmin:
            !!user.isAdmin
    };
}


function adminUserData(
    user
) {

    return {

        name:
            user.name,

        username:
            user.name,

        color:
            user.color ||
            "#ffd700",

        roomId:
            user.roomId ||
            null,

        ip:
            user.ip ||
            "",

        device:
            user.device ||
            "",

        userAgent:
            user.userAgent ||
            "",

        isAdmin:
            !!user.isAdmin,

        admin:
            !!user.admin
    };
}


/* =========================================================
   ONLINE USERS
   ========================================================= */

function emitOnlineUsers() {

    io.emit(
        "online users",
        users.map(
            publicUser
        )
    );
}


function emitAdminUsers() {

    io.emit(
        "admin online users",
        users.map(
            adminUserData
        )
    );
}


/* =========================================================
   LOGS
   ========================================================= */

function addLog(
    message,
    roomId = null
) {

    logs.push({

        id:
            makeId("log"),

        message,

        roomId,

        time:
            new Date().toISOString()
    });

    if (
        logs.length > 5000
    ) {

        logs =
            logs.slice(-5000);
    }

    saveJSON(
        "logs.json",
        logs
    );
}


/* =========================================================
   ROOM NOTICE
   ========================================================= */

function roomNotice(
    roomId,
    type,
    message,
    username = ""
) {

    io.to(
        `room:${roomId}`
    ).emit(
        "room moderation notice",
        {
            roomId,
            type,
            username,
            message
        }
    );
}


/* =========================================================
   ROOM USER UPDATE
   ========================================================= */

function emitRoomUsers(
    roomId
) {

    io.to(
        `room:${roomId}`
    ).emit(
        "room users",
        roomUserList(
            roomId
        )
    );
}


/* =========================================================
   SAVE ALL
   ========================================================= */

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
        "roomMessages.json",
        roomMessages
    );

    saveJSON(
        "roomStars.json",
        roomStars
    );

    saveJSON(
        "roomModeration.json",
        roomModeration
    );

    saveGlobalState();
}


/* =========================================================
   BASIC ROUTES
   ========================================================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);


app.get(
    "/health",
    (req, res) => {

        res.json({
            ok: true,
            service: "Mersal Chat",
            rooms: rooms.length,
            users: users.length
        });
    }
);


/* =========================================================
   ROOM LIST API
   ========================================================= */

app.get(
    "/api/rooms",
    (req, res) => {

        res.json(
            rooms
        );
    }
);


/* =========================================================
   STARTUP
   ========================================================= */

console.log(
    "================================="
);

console.log(
    "🚀 MERSAL CHAT SERVER"
);

console.log(
    "🏠 Rooms:",
    rooms.length
);

console.log(
    "👑 Admins:",
    admins.length
);

console.log(
    "================================="
);
/* =========================================================
   SOCKET.IO
   USER LOGIN
   ========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "🔌 New connection:",
            socket.id
        );


        /* =====================================================
           CHECK ADMIN NAME
           ===================================================== */

        socket.on(
            "check admin",
            name => {

                const admin =
                    getAdminByName(
                        name
                    );

                socket.emit(
                    "admin check result",
                    !!admin
                );
            }
        );


        /* =====================================================
           USER LOGIN
           ===================================================== */

        socket.on(
            "join",
            data => {

                try {

                    const username =
                        cleanName(
                            data?.username
                        );


                    if (!username) {

                        socket.emit(
                            "login error",
                            "❌ اكتب اسم المستخدم"
                        );

                        return;
                    }


                    /* =========================================
                       PREVENT IMPERSONATION
                       ========================================= */

                    if (
                        username.includes("&") ||
                        username.includes("@")
                    ) {

                        socket.emit(
                            "login error",
                            "❌ لا يمكنك استخدام رموز الإدارة في الاسم"
                        );

                        return;
                    }


                    /* =========================================
                       RESERVED ADMIN NAMES
                       ========================================= */

                    const adminAccount =
                        getAdminByName(
                            username
                        );


                    if (adminAccount) {

                        const password =
                            String(
                                data?.adminPassword ||
                                ""
                            );


                        if (
                            password !==
                            String(
                                adminAccount.password ||
                                ""
                            )
                        ) {

                            socket.emit(
                                "login error",
                                "🔐 هذا الاسم خاص بالإدارة ويحتاج كلمة مرور صحيحة"
                            );

                            return;
                        }
                    }


                    /* =========================================
                       DUPLICATE USERNAME
                       ========================================= */

                    const alreadyOnline =
                        getUserByName(
                            username
                        );


                    if (alreadyOnline) {

                        socket.emit(
                            "login error",
                            "⚠️ هذا الاسم مستخدم حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       IP
                       ========================================= */

                    const ip =
                        getIP(
                            socket
                        );


                    /* =========================================
                       DEVICE
                       ========================================= */

                    const device =
                        getDevice(
                            socket,
                            data
                        );


                    const userAgent =
                        String(
                            socket.handshake
                                ?.headers
                                ?.["user-agent"] ||
                            ""
                        );


                    /* =========================================
                       GLOBAL BAN
                       ========================================= */

                    const globalBanned =
                        bannedUsers.some(
                            item => {

                                if (
                                    typeof item ===
                                    "string"
                                ) {

                                    return sameName(
                                        item,
                                        username
                                    );
                                }


                                if (
                                    item?.name &&
                                    sameName(
                                        item.name,
                                        username
                                    )
                                ) {

                                    return true;
                                }


                                if (
                                    item?.ip &&
                                    String(
                                        item.ip
                                    ) ===
                                    String(ip)
                                ) {

                                    return true;
                                }


                                return false;
                            }
                        );


                    if (globalBanned) {

                        socket.emit(
                            "banned",
                            "🚫 أنت محظور من الدردشة العامة"
                        );

                        return;
                    }


                    /* =========================================
                       DEVICE BAN
                       ========================================= */

                    const deviceBanned =
                        deviceBannedUsers.some(
                            item => {

                                if (
                                    typeof item ===
                                    "string"
                                ) {

                                    return (
                                        item ===
                                        device
                                    );
                                }


                                return (
                                    String(
                                        item?.device ||
                                        ""
                                    ) ===
                                    device
                                );
                            }
                        );


                    if (deviceBanned) {

                        socket.emit(
                            "banned",
                            "⛔ جهازك محظور من الدردشة"
                        );

                        return;
                    }


                    /* =========================================
                       CREATE USER
                       ========================================= */

                    const user = {

                        id:
                            socket.id,

                        socketId:
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

                        userAgent,

                        roomId:
                            null,

                        currentRoom:
                            null,

                        isAdmin:
                            !!adminAccount,

                        admin:
                            !!adminAccount
                    };


                    users.push(
                        user
                    );


                    /* =========================================
                       SOCKET DATA
                       ========================================= */

                    socket.username =
                        username;

                    socket.userId =
                        socket.id;

                    socket.adminData =
                        adminAccount ||
                        null;

                    socket.currentRoom =
                        null;

                    socket.roomAdmin =
                        false;


                    /* =========================================
                       LOGIN SUCCESS
                       ========================================= */

                    socket.emit(
                        "login success",
                        {
                            username,
                            name:
                                username,

                            isAdmin:
                                !!adminAccount,

                            admin:
                                !!adminAccount,

                            globalDisconnect:
                                globalDisconnect
                        }
                    );


                    /* =========================================
                       GLOBAL DISCONNECT NOTICE
                       ========================================= */

                    if (
                        globalDisconnect
                    ) {

                        socket.emit(
                            "global disconnected",
                            {
                                message:
                                    "⛔ أنت مفصول عن الدردشة العامة"
                            }
                        );
                    }


                    /* =========================================
                       ONLINE USERS
                       ========================================= */

                    emitOnlineUsers();

                    emitAdminUsers();


                    /* =========================================
                       LOG
                       ========================================= */

                    addLog(
                        `👤 ${username} دخل إلى الدردشة`
                    );


                    console.log(
                        `👤 ${username} joined`
                    );

                } catch (error) {

                    console.error(
                        "❌ LOGIN ERROR",
                        error
                    );

                    socket.emit(
                        "login error",
                        "❌ حدث خطأ أثناء تسجيل الدخول"
                    );
                }
            }
        );


        /* =====================================================
           GET ONLINE USERS
           ===================================================== */

        socket.on(
            "get online users",
            () => {

                socket.emit(
                    "online users",
                    users.map(
                        publicUser
                    )
                );
            }
        );


        /* =====================================================
           GET ADMIN ONLINE USERS
           ===================================================== */

        socket.on(
            "get admin users",
            () => {

                if (
                    !isAdmin(socket)
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ ليس لديك صلاحية"
                    );

                    return;
                }


                socket.emit(
                    "admin online users",
                    users.map(
                        adminUserData
                    )
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
            }
        );


        /* =====================================================
           ADMIN PANEL LOGIN
           ===================================================== */

        socket.on(
            "admin panel login",
            data => {

                try {

                    const name =
                        cleanName(
                            data?.name
                        );

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
                            "admin login failed"
                        );

                        return;
                    }


                    const admin =
                        admins.find(
                            item =>
                                sameName(
                                    item.name,
                                    name
                                ) &&
                                String(
                                    item.password ||
                                    ""
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
                            name:
                                admin.name,

                            role:
                                isMasterAdmin(
                                    admin
                                )
                                    ? "master"
                                    : (
                                        admin.role ||
                                        "moderator"
                                    ),

                            permissions:
                                admin.permissions ||
                                {}
                        }
                    );


                    socket.emit(
                        "admin online users",
                        users.map(
                            adminUserData
                        )
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


                    socket.emit(
                        "admins updated",
                        admins.map(
                            item => ({
                                name:
                                    item.name,

                                role:
                                    isMasterAdmin(
                                        item
                                    )
                                        ? "master"
                                        : (
                                            item.role ||
                                            "moderator"
                                        ),

                                permissions:
                                    item.permissions ||
                                    {}
                            })
                        )
                    );


                    socket.emit(
                        "admin rooms",
                        rooms
                    );


                    addLog(
                        `👑 ${admin.name} دخل لوحة الإدارة`
                    );

                } catch (error) {

                    console.error(
                        "❌ ADMIN LOGIN ERROR",
                        error
                    );

                    socket.emit(
                        "admin login failed"
                    );
                }
            }
        );


        /* =====================================================
           ADMIN LOGOUT
           ===================================================== */

        socket.on(
            "admin logout",
            () => {

                socket.adminData =
                    null;

                socket.roomAdmin =
                    false;
            }
        );


        /* =====================================================
           GET ROOMS
           ===================================================== */

        socket.on(
            "get rooms",
            () => {

                socket.emit(
                    "admin rooms",
                    rooms
                );

                socket.emit(
                    "rooms list",
                    rooms
                );
            }
        );


        /* =====================================================
           GET PUBLIC ROOMS
           ===================================================== */

        socket.on(
            "get public rooms",
            () => {

                const publicRooms =
                    rooms
                        .filter(
                            room =>
                                room.enabled !==
                                false
                        )
                        .map(
                            room => ({
                                id:
                                    room.id,

                                name:
                                    room.name,

                                description:
                                    room.description,

                                enabled:
                                    room.enabled,

                                settings:
                                    room.settings
                            })
                        );


                socket.emit(
                    "rooms list",
                    publicRooms
                );
            }
        );


        /* =====================================================
           CREATE ROOM
           ===================================================== */

        socket.on(
            "create room",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ يجب تسجيل الدخول كأدمن"
                        );

                        return;
                    }


                    if (
                        !(
                            isMasterAdmin(
                                socket.adminData
                            ) ||
                            hasPermission(
                                socket,
                                "rooms"
                            ) ||
                            hasPermission(
                                socket,
                                "addAdmin"
                            )
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية إنشاء الغرف"
                        );

                        return;
                    }


                    const name =
                        cleanName(
                            data?.name
                        );


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


                    const duplicate =
                        rooms.some(
                            room =>
                                sameName(
                                    room.name,
                                    name
                                )
                        );


                    if (duplicate) {

                        socket.emit(
                            "room error",
                            "⚠️ توجد غرفة بهذا الاسم"
                        );

                        return;
                    }


                    const room =
                        normalizeRoom({

                            id:
                                makeId(
                                    "room"
                                ),

                            name,

                            description,

                            enabled:
                                true,

                            settings: {

                                chatLock:
                                    false,

                                maintenance:
                                    false,

                                starsMode:
                                    false,

                                protection:
                                    true
                            },

                            createdAt:
                                new Date()
                                    .toISOString()
                        });


                    rooms.push(
                        room
                    );


                    ensureRoom(
                        room.id
                    );

                    ensureRoomMessages(
                        room.id
                    );

                    ensureRoomStars(
                        room.id
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

                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );


                    socket.emit(
                        "room created",
                        room
                    );


                    io.emit(
                        "rooms list",
                        rooms
                    );


                    io.emit(
                        "rooms updated",
                        rooms
                    );


                    io.emit(
                        "admin rooms",
                        rooms
                    );


                    addLog(
                        `🏠 تم إنشاء الغرفة ${room.name}`
                    );


                    console.log(
                        `🏠 Room created: ${room.name}`
                    );

                } catch (error) {

                    console.error(
                        "❌ CREATE ROOM ERROR",
                        error
                    );

                    socket.emit(
                        "room error",
                        "❌ فشل إنشاء الغرفة"
                    );
                }
            }
        );


        /* =====================================================
           DELETE ROOM
           ===================================================== */

        socket.on(
            "delete room",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {
                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    if (!roomId) {
                        return;
                    }


                    if (
                        !(
                            isMasterAdmin(
                                socket.adminData
                            ) ||
                            hasPermission(
                                socket,
                                "rooms"
                            ) ||
                            hasPermission(
                                socket,
                                "addAdmin"
                            )
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية حذف الغرف"
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


                    users.forEach(
                        user => {

                            if (
                                String(
                                    user.roomId
                                ) ===
                                roomId
                            ) {

                                const targetSocket =
                                    io.sockets.sockets.get(
                                        user.socketId
                                    );

                                if (
                                    targetSocket
                                ) {

                                    targetSocket.leave(
                                        `room:${roomId}`
                                    );

                                    targetSocket.currentRoom =
                                        null;
                                }

                                user.roomId =
                                    null;

                                user.currentRoom =
                                    null;
                            }
                        }
                    );


                    rooms =
                        rooms.filter(
                            item =>
                                String(
                                    item.id
                                ) !==
                                roomId
                        );


                    delete roomMessages[
                        roomId
                    ];

                    delete roomStars[
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
                        "roomMessages.json",
                        roomMessages
                    );

                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );

                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    socket.emit(
                        "room deleted",
                        {
                            roomId
                        }
                    );


                    io.emit(
                        "rooms list",
                        rooms
                    );


                    io.emit(
                        "rooms updated",
                        rooms
                    );


                    io.emit(
                        "admin rooms",
                        rooms
                    );


                    emitOnlineUsers();
                    emitAdminUsers();


                    addLog(
                        `🗑️ تم حذف الغرفة ${room.name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ DELETE ROOM ERROR",
                        error
                    );

                    socket.emit(
                        "room error",
                        "❌ فشل حذف الغرفة"
                    );
                }
            }
        );


        /* =====================================================
           EDIT ROOM
           ===================================================== */

        socket.on(
            "edit room",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {
                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    const room =
                        getRoom(
                            roomId
                        );


                    if (!room) {
                        return;
                    }


                    if (
                        !(
                            isMasterAdmin(
                                socket.adminData
                            ) ||
                            hasPermission(
                                socket,
                                "rooms"
                            ) ||
                            hasPermission(
                                socket,
                                "roomSettings"
                            )
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية تعديل الغرفة"
                        );

                        return;
                    }


                    const newName =
                        cleanName(
                            data?.name ||
                            room.name
                        );


                    const newDescription =
                        String(
                            data?.description ??
                            room.description
                        ).trim();


                    const duplicate =
                        rooms.some(
                            item =>
                                item.id !==
                                room.id &&
                                sameName(
                                    item.name,
                                    newName
                                )
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

                    room.description =
                        newDescription;


                    saveJSON(
                        "rooms.json",
                        rooms
                    );


                    io.emit(
                        "rooms list",
                        rooms
                    );

                    io.emit(
                        "rooms updated",
                        rooms
                    );

                    io.emit(
                        "admin rooms",
                        rooms
                    );


                    socket.emit(
                        "room updated",
                        room
                    );


                    addLog(
                        `✏️ تم تعديل الغرفة ${room.name}`
                    );

                } catch (error) {

                    console.error(
                        "❌ EDIT ROOM ERROR",
                        error
                    );
                }
            }
        );


        /* =====================================================
           TOGGLE ROOM ENABLED
           ===================================================== */

        socket.on(
            "toggle room",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (
                    !room ||
                    !isAdmin(socket)
                ) {
                    return;
                }


                if (
                    !(
                        isMasterAdmin(
                            socket.adminData
                        ) ||
                        hasPermission(
                            socket,
                            "rooms"
                        ) ||
                        hasPermission(
                            socket,
                            "roomSettings"
                        )
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية التحكم بالغرفة"
                    );

                    return;
                }


                room.enabled =
                    data?.enabled !== undefined
                        ? !!data.enabled
                        : !room.enabled;


                saveJSON(
                    "rooms.json",
                    rooms
                );


                io.emit(
                    "rooms list",
                    rooms
                );

                io.emit(
                    "rooms updated",
                    rooms
                );

                io.emit(
                    "admin rooms",
                    rooms
                );
            }
        );
      /* =========================================================
   JOIN ROOM
   ========================================================= */

        socket.on(
            "join room",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    if (!roomId) {

                        socket.emit(
                            "room error",
                            "❌ لم يتم تحديد الغرفة"
                        );

                        return;
                    }


                    const user =
                        getUser(
                            socket
                        );


                    if (!user) {

                        socket.emit(
                            "room error",
                            "❌ يجب تسجيل الدخول أولًا"
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


                    /* =========================================
                       ROOM ENABLED
                       ========================================= */

                    if (
                        room.enabled === false
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ هذه الغرفة متوقفة حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM BAN
                       ========================================= */

                    if (
                        roomIsBanned(
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


                    /* =========================================
                       ROOM DISCONNECT
                       ========================================= */

                    if (
                        roomIsDisconnected(
                            roomId,
                            user.name
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ تم فصلك ومنعك من دخول هذه الغرفة"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM MAINTENANCE
                       ========================================= */

                    if (
                        room.settings?.maintenance ===
                        true
                    ) {

                        if (
                            !isRoomAdmin(
                                socket,
                                roomId
                            )
                        ) {

                            socket.emit(
                                "room error",
                                "🛠️ الغرفة تحت الصيانة حاليًا"
                            );

                            return;
                        }
                    }


                    /* =========================================
                       LEAVE OLD ROOM
                       ========================================= */

                    if (
                        user.roomId &&
                        String(
                            user.roomId
                        ) !== roomId
                    ) {

                        const oldRoomId =
                            String(
                                user.roomId
                            );


                        socket.leave(
                            `room:${oldRoomId}`
                        );


                        roomNotice(
                            oldRoomId,
                            "leave",
                            `🚪 غادر ${user.name} الغرفة`,
                            user.name
                        );


                        emitRoomUsers(
                            oldRoomId
                        );
                    }


                    /* =========================================
                       JOIN NEW ROOM
                       ========================================= */

                    socket.join(
                        `room:${roomId}`
                    );


                    user.roomId =
                        roomId;

                    user.currentRoom =
                        roomId;

                    socket.currentRoom =
                        roomId;


                    /* =========================================
                       ROOM ADMIN
                       ========================================= */

                    socket.roomAdmin =
                        isRoomAdmin(
                            socket,
                            roomId
                        );


                    /* =========================================
                       ENSURE DATA
                       ========================================= */

                    const moderation =
                        ensureRoom(
                            roomId
                        );

                    const messages =
                        ensureRoomMessages(
                            roomId
                        );

                    const starsInRoom =
                        ensureRoomStars(
                            roomId
                        );


                    /* =========================================
                       SAVE USER ROOM
                       ========================================= */

                    emitOnlineUsers();
                    emitAdminUsers();


                    /* =========================================
                       ROOM JOINED
                       ========================================= */

                    socket.emit(
                        "room joined",
                        {

                            room,

                            roomId,

                            username:
                                user.name,

                            muted:
                                roomIsMuted(
                                    roomId,
                                    user.name
                                ),

                            isAdmin:
                                socket.roomAdmin ||
                                isMasterAdmin(
                                    socket.adminData
                                ),

                            moderation,

                            stars:
                                starsInRoom
                        }
                    );


                    /* =========================================
                       ROOM HISTORY
                       ========================================= */

                    socket.emit(
                        "room history",
                        {
                            roomId,

                            messages:
                                messages
                        }
                    );


                    /* =========================================
                       ROOM USERS
                       ========================================= */

                    socket.emit(
                        "room users",
                        roomUserList(
                            roomId
                        )
                    );


                    io.to(
                        `room:${roomId}`
                    ).emit(
                        "room users",
                        roomUserList(
                            roomId
                        )
                    );


                    /* =========================================
                       ADMIN ASSIGNED NOTICE
                       ========================================= */

                    if (
                        socket.roomAdmin &&
                        socket.username
                    ) {

                        socket.emit(
                            "room admin notice",
                            {
                                roomId,

                                type:
                                    "admin assigned",

                                message:
                                    `✨ تم توكيل ${socket.username}`
                            }
                        );
                    }


                    /* =========================================
                       JOIN NOTICE
                       ========================================= */

                    roomNotice(
                        roomId,
                        "join",
                        `🚪 دخل ${user.name} الغرفة`,
                        user.name
                    );


                    addLog(
                        `🚪 ${user.name} دخل الغرفة ${room.name}`,
                        roomId
                    );


                    console.log(
                        `🏠 ${user.name} joined ${room.name}`
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
            }
        );


/* =========================================================
   LEAVE ROOM
   ========================================================= */

        socket.on(
            "leave room",
            data => {

                try {

                    const user =
                        getUser(
                            socket
                        );


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
                        `room:${roomId}`
                    );


                    user.roomId =
                        null;

                    user.currentRoom =
                        null;

                    socket.currentRoom =
                        null;

                    socket.roomAdmin =
                        false;


                    emitOnlineUsers();
                    emitAdminUsers();


                    roomNotice(
                        roomId,
                        "leave",
                        `🚪 غادر ${user.name} الغرفة`,
                        user.name
                    );


                    emitRoomUsers(
                        roomId
                    );


                    socket.emit(
                        "room left",
                        {
                            roomId
                        }
                    );


                    addLog(
                        `🚪 ${user.name} خرج من الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ LEAVE ROOM ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GET ROOM USERS
   ========================================================= */

        socket.on(
            "get room users",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                if (!roomId) {
                    return;
                }


                socket.emit(
                    "room users",
                    roomUserList(
                        roomId
                    )
                );
            }
        );


/* =========================================================
   CHECK ROOM ACCESS
   ========================================================= */

        socket.on(
            "check room access",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    ).trim();


                const user =
                    getUser(
                        socket
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
                    getRoom(
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
                    room.enabled ===
                    false
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
                    roomIsBanned(
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
                                "banned",

                            message:
                                "🚫 أنت محظور من هذه الغرفة"
                        }
                    );

                    return;
                }


                if (
                    roomIsDisconnected(
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
                                "disconnected",

                            message:
                                "⛔ تم فصلك من هذه الغرفة"
                        }
                    );

                    return;
                }


                if (
                    room.settings?.maintenance ===
                    true &&
                    !isRoomAdmin(
                        socket,
                        roomId
                    )
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
            }
        );


/* =========================================================
   PUBLIC ROOM CHAT
   ========================================================= */

        socket.on(
            "chat message",
            data => {

                try {

                    const user =
                        getUser(
                            socket
                        );


                    if (!user) {

                        socket.emit(
                            "chat error",
                            "❌ يجب تسجيل الدخول أولًا"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            user.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    if (!roomId) {

                        socket.emit(
                            "chat error",
                            "❌ اختر غرفة أولًا"
                        );

                        return;
                    }


                    const room =
                        getRoom(
                            roomId
                        );


                    if (!room) {

                        socket.emit(
                            "chat error",
                            "❌ الغرفة غير موجودة"
                        );

                        return;
                    }


                    /* =========================================
                       MAKE SURE USER REALLY IS IN THIS ROOM
                       ========================================= */

                    if (
                        String(
                            user.roomId
                        ) !== roomId
                    ) {

                        socket.emit(
                            "chat error",
                            "❌ أنت لست داخل هذه الغرفة"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM BAN
                       ========================================= */

                    if (
                        roomIsBanned(
                            roomId,
                            user.name
                        )
                    ) {

                        socket.emit(
                            "chat error",
                            "🚫 أنت محظور من هذه الغرفة"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM MUTE
                       ========================================= */

                    if (
                        roomIsMuted(
                            roomId,
                            user.name
                        )
                    ) {

                        socket.emit(
                            "chat error",
                            "🔇 أنت مكتوم في هذه الغرفة"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM MAINTENANCE
                       ========================================= */

                    if (
                        room.settings?.maintenance ===
                        true &&
                        !isRoomAdmin(
                            socket,
                            roomId
                        )
                    ) {

                        socket.emit(
                            "chat error",
                            "🛠️ الغرفة تحت الصيانة حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM CHAT LOCK
                       ========================================= */

                    if (
                        room.settings?.chatLock ===
                        true &&
                        !isRoomAdmin(
                            socket,
                            roomId
                        )
                    ) {

                        socket.emit(
                            "chat error",
                            "🔒 الدردشة مقفلة حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       ROOM STARS MODE
                       ========================================= */

                    if (
                        room.settings?.starsMode ===
                        true &&
                        !isRoomAdmin(
                            socket,
                            roomId
                        )
                    ) {

                        const roomStarList =
                            ensureRoomStars(
                                roomId
                            );


                        const hasStar =
                            roomStarList.some(
                                name =>
                                    sameName(
                                        name,
                                        user.name
                                    )
                            );


                        if (!hasStar) {

                            socket.emit(
                                "chat error",
                                "⭐ الكتابة في هذه الغرفة متاحة لأصحاب النجمة فقط"
                            );

                            return;
                        }
                    }


                    /* =========================================
                       GLOBAL DISCONNECT
                       ========================================= */

                    /*
                       مهم:
                       الفصل العام لا يمنع دخول الغرف.
                       هو يمنع الدردشة العامة فقط.
                    */

                    if (
                        globalDisconnect
                    ) {

                        socket.emit(
                            "global disconnected",
                            {
                                message:
                                    "⛔ أنت مفصول عن الدردشة العامة"
                            }
                        );

                        return;
                    }


                    /* =========================================
                       GLOBAL MAINTENANCE
                       ========================================= */

                    if (
                        globalMaintenance &&
                        !isAdmin(socket)
                    ) {

                        socket.emit(
                            "chat error",
                            "🛠️ الدردشة العامة تحت الصيانة"
                        );

                        return;
                    }


                    /* =========================================
                       GLOBAL CHAT LOCK
                       ========================================= */

                    if (
                        globalChatLocked &&
                        !isAdmin(socket)
                    ) {

                        socket.emit(
                            "chat error",
                            "🔒 الدردشة مقفلة حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       MESSAGE
                       ========================================= */

                    const message =
                        String(
                            data?.message ||
                            ""
                        ).trim();


                    if (!message) {
                        return;
                    }


                    if (
                        message.length >
                        2000
                    ) {

                        socket.emit(
                            "chat error",
                            "❌ الرسالة طويلة جدًا"
                        );

                        return;
                    }


                    /* =========================================
                       REPLY
                       ========================================= */

                    let reply =
                        null;


                    if (
                        data?.reply
                    ) {

                        reply = {

                            id:
                                String(
                                    data.reply.id ||
                                    ""
                                ),

                            name:
                                String(
                                    data.reply.name ||
                                    ""
                                ),

                            message:
                                String(
                                    data.reply.message ||
                                    ""
                                ).slice(
                                    0,
                                    300
                                )
                        };
                    }


                    /* =========================================
                       CREATE MESSAGE
                       ========================================= */

                    const messageData = {

                        id:
                            makeId(
                                "msg"
                            ),

                        roomId,

                        name:
                            user.name,

                        username:
                            user.name,

                        message,

                        color:
                            user.color ||
                            "#ffd700",

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
                                ),

                        timestamp:
                            Date.now()
                    };


                    /* =========================================
                       SAVE MESSAGE
                       ========================================= */

                    const history =
                        ensureRoomMessages(
                            roomId
                        );


                    history.push(
                        messageData
                    );


                    if (
                        history.length >
                        500
                    ) {

                        roomMessages[
                            roomId
                        ] =
                            history.slice(
                                -500
                            );
                    }


                    saveJSON(
                        "roomMessages.json",
                        roomMessages
                    );


                    /* =========================================
                       SEND TO ROOM
                       ========================================= */

                    io.to(
                        `room:${roomId}`
                    ).emit(
                        "chat message",
                        messageData
                    );


                    addLog(
                        `💬 ${user.name}: ${message}`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ CHAT ERROR",
                        error
                    );

                    socket.emit(
                        "chat error",
                        "❌ حدث خطأ أثناء إرسال الرسالة"
                    );
                }
            }
        );


/* =========================================================
   DELETE MESSAGE FROM ROOM
   ========================================================= */

        socket.on(
            "delete message",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const messageId =
                        String(
                            data?.messageId ||
                            ""
                        ).trim();


                    if (
                        !roomId ||
                        !messageId
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "deleteMessage"
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية حذف الرسائل"
                        );

                        return;
                    }


                    const history =
                        ensureRoomMessages(
                            roomId
                        );


                    roomMessages[
                        roomId
                    ] =
                        history.filter(
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
                        `room:${roomId}`
                    ).emit(
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

                } catch (error) {

                    console.error(
                        "❌ DELETE MESSAGE ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   CLEAR ROOM CHAT
   ========================================================= */

        socket.on(
            "clear room chat",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                if (!roomId) {
                    return;
                }


                if (
                    !canManageRoom(
                        socket,
                        roomId,
                        "clear"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية مسح الدردشة"
                    );

                    return;
                }


                roomMessages[
                    roomId
                ] = [];


                saveJSON(
                    "roomMessages.json",
                    roomMessages
                );


                io.to(
                    `room:${roomId}`
                ).emit(
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


/* =========================================================
   PRIVATE MESSAGE
   ========================================================= */

        socket.on(
            "private message",
            data => {

                try {

                    const sender =
                        getUser(
                            socket
                        );


                    if (!sender) {
                        return;
                    }


                    if (
                        globalPrivateLocked &&
                        !isAdmin(socket)
                    ) {

                        socket.emit(
                            "private error",
                            "🔒 الرسائل الخاصة مقفلة حاليًا"
                        );

                        return;
                    }


                    const targetName =
                        cleanName(
                            data?.toName ||
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    const message =
                        String(
                            data?.message ||
                            ""
                        ).trim();


                    if (
                        !targetName ||
                        !message
                    ) {
                        return;
                    }


                    if (
                        message.length >
                        2000
                    ) {

                        socket.emit(
                            "private error",
                            "❌ الرسالة طويلة جدًا"
                        );

                        return;
                    }


                    const target =
                        getUserByName(
                            targetName
                        );


                    if (!target) {

                        socket.emit(
                            "private error",
                            "❌ المستخدم غير متصل"
                        );

                        return;
                    }


                    const targetSocket =
                        io.sockets.sockets.get(
                            target.socketId
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
                            makeId(
                                "private"
                            ),

                        from:
                            sender.name,

                        to:
                            target.name,

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
                                ),

                        timestamp:
                            Date.now()
                    };


                    /* =========================================
                       SEND TO RECEIVER
                       ========================================= */

                    targetSocket.emit(
                        "private message",
                        privateData
                    );


                    /* =========================================
                       SEND BACK TO SENDER
                       ========================================= */

                    socket.emit(
                        "private message",
                        privateData
                    );


                    addLog(
                        `💌 رسالة خاصة من ${sender.name} إلى ${target.name}`
                    );

                } catch (error) {

                    console.error(
                        "❌ PRIVATE MESSAGE ERROR",
                        error
                    );

                    socket.emit(
                        "private error",
                        "❌ فشل إرسال الرسالة الخاصة"
                    );
                }
            }
        );


/* =========================================================
   PRIVATE MESSAGE ALIAS
   ========================================================= */

        socket.on(
            "send private message",
            data => {

                socket.emit(
                    "private message request",
                    data
                );
            }
        );
      /* =========================================================
   ROOM MODERATION
   BAN / UNBAN / MUTE / UNMUTE / KICK / DISCONNECT
   ========================================================= */


/* =========================================================
   FIND SOCKET BY USERNAME
   ========================================================= */

        function findUserSocketByName(
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
                user.socketId
            ) || null;
        }


/* =========================================================
   BAN USER FROM CURRENT ROOM
   ========================================================= */

        socket.on(
            "ban room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {

                        socket.emit(
                            "room moderation error",
                            "❌ لم يتم تحديد الغرفة أو المستخدم"
                        );

                        return;
                    }


                    /* =========================================
                       PERMISSION
                       ========================================= */

                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "ban"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية الحظر في هذه الغرفة"
                        );

                        return;
                    }


                    const room =
                        getRoom(
                            roomId
                        );


                    if (!room) {

                        socket.emit(
                            "room moderation error",
                            "❌ الغرفة غير موجودة"
                        );

                        return;
                    }


                    const target =
                        getUserByName(
                            targetName
                        );


                    const bannedList =
                        roomModerationList(
                            roomId,
                            "banned"
                        );


                    /* =========================================
                       ALREADY BANNED
                       ========================================= */

                    if (
                        roomIsBanned(
                            roomId,
                            targetName
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم محظور أصلًا من هذه الغرفة"
                        );

                        return;
                    }


                    /* =========================================
                       DO NOT ALLOW BAN MASTER
                       ========================================= */

                    if (
                        target &&
                        target.admin
                    ) {

                        const targetAdmin =
                            getAdminByName(
                                target.name
                            );


                        if (
                            targetAdmin &&
                            isMasterAdmin(
                                targetAdmin
                            )
                        ) {

                            socket.emit(
                                "room moderation error",
                                "⛔ لا يمكن حظر المدير الرئيسي"
                            );

                            return;
                        }
                    }


                    /* =========================================
                       ADD ROOM BAN
                       ========================================= */

                    bannedList.push({

                        name:
                            targetName,

                        by:
                            socket.adminData?.name ||
                            "admin",

                        time:
                            new Date()
                                .toISOString()
                    });


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    /* =========================================
                       REMOVE USER FROM ROOM
                       ========================================= */

                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.leave(
                                `room:${roomId}`
                            );


                            if (
                                String(
                                    target.roomId
                                ) ===
                                roomId
                            ) {

                                target.roomId =
                                    null;

                                target.currentRoom =
                                    null;

                                targetSocket.currentRoom =
                                    null;

                                targetSocket.roomAdmin =
                                    false;
                            }


                            targetSocket.emit(
                                "room banned",
                                {
                                    roomId,

                                    message:
                                        `🚫 تم حظرك من غرفة ${room.name}`
                                }
                            );
                        }
                    }


                    /* =========================================
                       ROOM NOTICE
                       ========================================= */

                    roomNotice(
                        roomId,
                        "ban",
                        `🚫 تم حظر ${targetName} من الغرفة`,
                        targetName
                    );


                    emitRoomUsers(
                        roomId
                    );


                    emitOnlineUsers();
                    emitAdminUsers();


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "ban",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `🚫 ${targetName} تم حظره من الغرفة ${room.name} بواسطة ${socket.adminData?.name || "admin"}`,
                        roomId
                    );


                } catch (error) {

                    console.error(
                        "❌ ROOM BAN ERROR",
                        error
                    );

                    socket.emit(
                        "room moderation error",
                        "❌ فشل حظر المستخدم من الغرفة"
                    );
                }
            }
        );


/* =========================================================
   UNBAN USER FROM ROOM
   ========================================================= */

        socket.on(
            "unban room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "unban"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية فك الحظر"
                        );

                        return;
                    }


                    const list =
                        roomModerationList(
                            roomId,
                            "banned"
                        );


                    const oldLength =
                        list.length;


                    roomModeration[
                        roomId
                    ].banned =
                        list.filter(
                            item => {

                                const name =
                                    typeof item ===
                                    "string"
                                        ? item
                                        : item?.name;

                                return !sameName(
                                    name,
                                    targetName
                                );
                            }
                        );


                    if (
                        oldLength ===
                        roomModeration[
                            roomId
                        ].banned.length
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم غير موجود في قائمة الحظر"
                        );

                        return;
                    }


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    roomNotice(
                        roomId,
                        "unban",
                        `🔓 تم فك حظر ${targetName}`,
                        targetName
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "unban",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `🔓 تم فك حظر ${targetName} من الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ROOM UNBAN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   MUTE USER IN ROOM
   ========================================================= */

        socket.on(
            "mute room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "mute"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية الكتم"
                        );

                        return;
                    }


                    const target =
                        getUserByName(
                            targetName
                        );


                    if (
                        target &&
                        target.admin
                    ) {

                        const targetAdmin =
                            getAdminByName(
                                target.name
                            );


                        if (
                            targetAdmin &&
                            isMasterAdmin(
                                targetAdmin
                            )
                        ) {

                            socket.emit(
                                "room moderation error",
                                "⛔ لا يمكن كتم المدير الرئيسي"
                            );

                            return;
                        }
                    }


                    if (
                        roomIsMuted(
                            roomId,
                            targetName
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم مكتوم أصلًا"
                        );

                        return;
                    }


                    const list =
                        roomModerationList(
                            roomId,
                            "muted"
                        );


                    list.push({

                        name:
                            targetName,

                        by:
                            socket.adminData?.name ||
                            "admin",

                        time:
                            new Date()
                                .toISOString()
                    });


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room muted",
                                {
                                    roomId,

                                    message:
                                        `🔇 تم كتمك في غرفة ${getRoom(roomId)?.name || ""}`
                                }
                            );
                        }
                    }


                    roomNotice(
                        roomId,
                        "mute",
                        `🔇 تم كتم ${targetName}`,
                        targetName
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "mute",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `🔇 تم كتم ${targetName} في الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ROOM MUTE ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   UNMUTE USER IN ROOM
   ========================================================= */

        socket.on(
            "unmute room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "unmute"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية فك الكتم"
                        );

                        return;
                    }


                    const list =
                        roomModerationList(
                            roomId,
                            "muted"
                        );


                    const newList =
                        list.filter(
                            item => {

                                const name =
                                    typeof item ===
                                    "string"
                                        ? item
                                        : item?.name;

                                return !sameName(
                                    name,
                                    targetName
                                );
                            }
                        );


                    if (
                        newList.length ===
                        list.length
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم غير مكتوم أصلًا"
                        );

                        return;
                    }


                    roomModeration[
                        roomId
                    ].muted =
                        newList;


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    const target =
                        getUserByName(
                            targetName
                        );


                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room unmuted",
                                {
                                    roomId,

                                    message:
                                        "🔊 تم فك كتمك"
                                }
                            );
                        }
                    }


                    roomNotice(
                        roomId,
                        "unmute",
                        `🔊 تم فك كتم ${targetName}`,
                        targetName
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "unmute",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `🔊 تم فك كتم ${targetName}`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ROOM UNMUTE ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   KICK USER FROM ROOM
   ========================================================= */

        socket.on(
            "kick room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "kick"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية الطرد"
                        );

                        return;
                    }


                    const target =
                        getUserByName(
                            targetName
                        );


                    if (!target) {

                        socket.emit(
                            "room moderation error",
                            "❌ المستخدم غير متصل"
                        );

                        return;
                    }


                    if (
                        String(
                            target.roomId
                        ) !== roomId
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم ليس داخل هذه الغرفة"
                        );

                        return;
                    }


                    const targetSocket =
                        io.sockets.sockets.get(
                            target.socketId
                        );


                    if (
                        targetSocket
                    ) {

                        targetSocket.leave(
                            `room:${roomId}`
                        );


                        targetSocket.currentRoom =
                            null;

                        targetSocket.roomAdmin =
                            false;
                    }


                    target.roomId =
                        null;

                    target.currentRoom =
                        null;


                    roomNotice(
                        roomId,
                        "kick",
                        `👢 تم طرد ${targetName} من الغرفة`,
                        targetName
                    );


                    if (
                        targetSocket
                    ) {

                        targetSocket.emit(
                            "room kicked",
                            {
                                roomId,

                                message:
                                    "👢 تم طردك من هذه الغرفة"
                            }
                        );
                    }


                    emitRoomUsers(
                        roomId
                    );


                    emitOnlineUsers();
                    emitAdminUsers();


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "kick",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `👢 تم طرد ${targetName} من الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ROOM KICK ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   DISCONNECT USER FROM ROOM
   ========================================================= */

        socket.on(
            "disconnect room user",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "disconnect"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية الفصل"
                        );

                        return;
                    }


                    const target =
                        getUserByName(
                            targetName
                        );


                    const disconnectedList =
                        roomModerationList(
                            roomId,
                            "disconnected"
                        );


                    if (
                        !roomIsDisconnected(
                            roomId,
                            targetName
                        )
                    ) {

                        disconnectedList.push({

                            name:
                                targetName,

                            by:
                                socket.adminData?.name ||
                                "admin",

                            time:
                                new Date()
                                    .toISOString()
                        });
                    }


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket &&
                            String(
                                target.roomId
                            ) === roomId
                        ) {

                            targetSocket.leave(
                                `room:${roomId}`
                            );


                            targetSocket.currentRoom =
                                null;

                            targetSocket.roomAdmin =
                                false;


                            target.roomId =
                                null;

                            target.currentRoom =
                                null;


                            targetSocket.emit(
                                "room disconnected",
                                {
                                    roomId,

                                    message:
                                        "⛔ تم فصلك من هذه الغرفة"
                                }
                            );
                        }
                    }


                    roomNotice(
                        roomId,
                        "disconnect",
                        `⛔ تم فصل ${targetName} من الغرفة`,
                        targetName
                    );


                    emitRoomUsers(
                        roomId
                    );


                    emitOnlineUsers();
                    emitAdminUsers();


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "disconnect",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `⛔ تم فصل ${targetName} من الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ROOM DISCONNECT ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   CLEAR ROOM BAN LIST
   ========================================================= */

        socket.on(
            "clear room bans",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    if (!roomId) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "unban"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية إدارة الحظر"
                        );

                        return;
                    }


                    roomModeration[
                        roomId
                    ].banned =
                        [];


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "clearBans",

                            roomId
                        }
                    );


                    roomNotice(
                        roomId,
                        "unban",
                        "🔓 تم فك جميع حالات الحظر في الغرفة"
                    );


                } catch (error) {

                    console.error(
                        "❌ CLEAR ROOM BANS ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   CLEAR ROOM MUTES
   ========================================================= */

        socket.on(
            "clear room mutes",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    if (!roomId) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "unmute"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية إدارة الكتم"
                        );

                        return;
                    }


                    roomModeration[
                        roomId
                    ].muted =
                        [];


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "clearMutes",

                            roomId
                        }
                    );


                    roomNotice(
                        roomId,
                        "unmute",
                        "🔊 تم فك جميع حالات الكتم في الغرفة"
                    );


                } catch (error) {

                    console.error(
                        "❌ CLEAR ROOM MUTES ERROR",
                        error
                    );
                }
            }
        );
      /* =========================================================
   ROOM STARS
   ========================================================= */


/* =========================================================
   GIVE STAR TO USER IN ROOM
   ========================================================= */

        socket.on(
            "give room star",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();

                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "stars"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية إدارة النجوم"
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


                    const target =
                        getUserByName(
                            targetName
                        );


                    const starList =
                        ensureRoomStars(
                            roomId
                        );


                    const exists =
                        starList.some(
                            name =>
                                sameName(
                                    name,
                                    targetName
                                )
                        );


                    if (exists) {

                        socket.emit(
                            "room moderation error",
                            "⭐ المستخدم لديه نجمة أصلًا"
                        );

                        return;
                    }


                    starList.push(
                        targetName
                    );


                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );


                    /* =========================================
                       SEND TO TARGET
                       ========================================= */

                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room star added",
                                {
                                    roomId,

                                    username:
                                        targetName,

                                    message:
                                        "⭐ تم إعطاؤك نجمة في هذه الغرفة"
                                }
                            );
                        }
                    }


                    /* =========================================
                       NOTICE
                       ========================================= */

                    roomNotice(
                        roomId,
                        "star",
                        `⭐ تم إعطاء ${targetName} نجمة`,
                        targetName
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "giveStar",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `⭐ تم إعطاء ${targetName} نجمة في ${room.name}`,
                        roomId
                    );


                } catch (error) {

                    console.error(
                        "❌ GIVE ROOM STAR ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   REMOVE STAR FROM USER
   ========================================================= */

        socket.on(
            "remove room star",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();

                    const targetName =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !targetName
                    ) {
                        return;
                    }


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "stars"
                        )
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⛔ لا تملك صلاحية إدارة النجوم"
                        );

                        return;
                    }


                    const list =
                        ensureRoomStars(
                            roomId
                        );


                    const newList =
                        list.filter(
                            name =>
                                !sameName(
                                    name,
                                    targetName
                                )
                        );


                    if (
                        newList.length ===
                        list.length
                    ) {

                        socket.emit(
                            "room moderation error",
                            "⚠️ المستخدم لا يملك نجمة"
                        );

                        return;
                    }


                    roomStars[
                        roomId
                    ] =
                        newList;


                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );


                    const target =
                        getUserByName(
                            targetName
                        );


                    if (target) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room star removed",
                                {
                                    roomId,

                                    username:
                                        targetName,

                                    message:
                                        "⭐ تم سحب النجمة منك"
                                }
                            );
                        }
                    }


                    roomNotice(
                        roomId,
                        "star removed",
                        `⭐ تم سحب النجمة من ${targetName}`,
                        targetName
                    );


                    socket.emit(
                        "room moderation success",
                        {
                            action:
                                "removeStar",

                            roomId,

                            username:
                                targetName
                        }
                    );


                    addLog(
                        `⭐ تم سحب نجمة ${targetName}`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ REMOVE ROOM STAR ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GET ROOM STARS
   ========================================================= */

        socket.on(
            "get room stars",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                if (!roomId) {
                    return;
                }


                socket.emit(
                    "room stars",
                    {
                        roomId,

                        stars:
                            ensureRoomStars(
                                roomId
                            )
                    }
                );
            }
        );


/* =========================================================
   ROOM SETTINGS
   ========================================================= */


/* =========================================================
   UPDATE ROOM SETTING
   ========================================================= */

        socket.on(
            "room setting",
            data => {

                try {

                    const roomId =
                        String(
                            data?.roomId ||
                            socket.currentRoom ||
                            ""
                        ).trim();


                    const setting =
                        String(
                            data?.setting ||
                            ""
                        ).trim();


                    if (
                        !roomId ||
                        !setting
                    ) {
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


                    if (
                        !canManageRoom(
                            socket,
                            roomId,
                            "roomSettings"
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية إعدادات الغرفة"
                        );

                        return;
                    }


                    const allowedSettings = [

                        "chatLock",

                        "maintenance",

                        "starsMode",

                        "protection"

                    ];


                    if (
                        !allowedSettings.includes(
                            setting
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "❌ إعداد غير معروف"
                        );

                        return;
                    }


                    const value =
                        data?.value !== undefined
                            ? !!data.value
                            : !room.settings[
                                setting
                            ];


                    room.settings[
                        setting
                    ] =
                        value;


                    saveJSON(
                        "rooms.json",
                        rooms
                    );


                    /* =========================================
                       SEND UPDATED SETTINGS
                       ========================================= */

                    io.to(
                        `room:${roomId}`
                    ).emit(
                        "room settings updated",
                        {
                            roomId,

                            settings:
                                room.settings
                        }
                    );


                    socket.emit(
                        "room setting updated",
                        {
                            roomId,

                            setting,

                            value,

                            settings:
                                room.settings
                        }
                    );


                    addLog(
                        `⚙️ تغيير إعداد ${setting} في ${room.name}: ${value}`,
                        roomId
                    );


                } catch (error) {

                    console.error(
                        "❌ ROOM SETTING ERROR",
                        error
                    );

                    socket.emit(
                        "room error",
                        "❌ فشل تغيير إعداد الغرفة"
                    );
                }
            }
        );


/* =========================================================
   TOGGLE ROOM CHAT LOCK
   ========================================================= */

        socket.on(
            "toggle room chat lock",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                if (
                    !canManageRoom(
                        socket,
                        roomId,
                        "chatLock"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية قفل الدردشة"
                    );

                    return;
                }


                room.settings.chatLock =
                    data?.value !== undefined
                        ? !!data.value
                        : !room.settings.chatLock;


                saveJSON(
                    "rooms.json",
                    rooms
                );


                io.to(
                    `room:${roomId}`
                ).emit(
                    "room settings updated",
                    {
                        roomId,

                        settings:
                            room.settings
                    }
                );


                roomNotice(
                    roomId,
                    "setting",
                    room.settings.chatLock
                        ? "🔒 تم قفل الدردشة في الغرفة"
                        : "🔓 تم فتح الدردشة في الغرفة"
                );
            }
        );


/* =========================================================
   TOGGLE ROOM MAINTENANCE
   ========================================================= */

        socket.on(
            "toggle room maintenance",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                if (
                    !canManageRoom(
                        socket,
                        roomId,
                        "maintenance"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الصيانة"
                    );

                    return;
                }


                room.settings.maintenance =
                    data?.value !== undefined
                        ? !!data.value
                        : !room.settings.maintenance;


                saveJSON(
                    "rooms.json",
                    rooms
                );


                io.to(
                    `room:${roomId}`
                ).emit(
                    "room settings updated",
                    {
                        roomId,

                        settings:
                            room.settings
                    }
                );


                roomNotice(
                    roomId,
                    "setting",
                    room.settings.maintenance
                        ? "🛠️ تم تشغيل وضع الصيانة"
                        : "✅ تم إيقاف وضع الصيانة"
                );
            }
        );


/* =========================================================
   TOGGLE ROOM STARS MODE
   ========================================================= */

        socket.on(
            "toggle room stars",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                if (
                    !canManageRoom(
                        socket,
                        roomId,
                        "stars"
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية نظام النجوم"
                    );

                    return;
                }


                room.settings.starsMode =
                    data?.value !== undefined
                        ? !!data.value
                        : !room.settings.starsMode;


                saveJSON(
                    "rooms.json",
                    rooms
                );


                io.to(
                    `room:${roomId}`
                ).emit(
                    "room settings updated",
                    {
                        roomId,

                        settings:
                            room.settings
                    }
                );


                roomNotice(
                    roomId,
                    "setting",
                    room.settings.starsMode
                        ? "⭐ تم تشغيل نظام النجوم"
                        : "⭐ تم إيقاف نظام النجوم"
                );
            }
        );


/* =========================================================
   TOGGLE ROOM PROTECTION
   ========================================================= */

        socket.on(
            "toggle room protection",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                if (
                    !(
                        isMasterAdmin(
                            socket.adminData
                        ) ||
                        isRoomAdmin(
                            socket,
                            roomId
                        )
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الحماية"
                    );

                    return;
                }


                room.settings.protection =
                    data?.value !== undefined
                        ? !!data.value
                        : !room.settings.protection;


                saveJSON(
                    "rooms.json",
                    rooms
                );


                io.to(
                    `room:${roomId}`
                ).emit(
                    "room settings updated",
                    {
                        roomId,

                        settings:
                            room.settings
                    }
                );
            }
        );


/* =========================================================
   GET ROOM SETTINGS
   ========================================================= */

        socket.on(
            "get room settings",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                const room =
                    getRoom(
                        roomId
                    );


                if (!room) {
                    return;
                }


                socket.emit(
                    "room settings",
                    {
                        roomId,

                        settings:
                            room.settings
                    }
                );
            }
        );


/* =========================================================
   ROOM ADMINS
   ========================================================= */


/* =========================================================
   GET ROOM ADMINS
   ========================================================= */

        socket.on(
            "get room admins",
            data => {

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    ).trim();


                if (!roomId) {
                    return;
                }


                const moderation =
                    ensureRoom(
                        roomId
                    );


                socket.emit(
                    "room admins",
                    {
                        roomId,

                        admins:
                            moderation.admins
                    }
                );
            }
        );


/* =========================================================
   ASSIGN ADMIN TO ROOM
   ========================================================= */

        socket.on(
            "assign room admin",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {
                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    const adminName =
                        cleanName(
                            data?.adminName ||
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !adminName
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ المدير الرئيسي فقط يستطيع توكيل مشرف للغرفة"
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


                    const targetAdmin =
                        getAdminByName(
                            adminName
                        );


                    if (!targetAdmin) {

                        socket.emit(
                            "room error",
                            "❌ الأدمن غير موجود"
                        );

                        return;
                    }


                    const moderation =
                        ensureRoom(
                            roomId
                        );


                    const exists =
                        moderation.admins.some(
                            name =>
                                sameName(
                                    name,
                                    adminName
                                )
                        );


                    if (!exists) {

                        moderation.admins.push(
                            adminName
                        );
                    }


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    socket.emit(
                        "room admin assigned",
                        {
                            roomId,

                            adminName
                        }
                    );


                    io.emit(
                        "room admins updated",
                        {
                            roomId,

                            admins:
                                moderation.admins
                        }
                    );


                    /* =========================================
                       NOTIFY TARGET ADMIN IF ONLINE
                       ========================================= */

                    const targetUser =
                        getUserByName(
                            adminName
                        );


                    if (targetUser) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                targetUser.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room admin assigned",
                                {
                                    roomId,

                                    adminName,

                                    roomName:
                                        room.name,

                                    message:
                                        `✨ تم توكيلك مشرفًا في غرفة ${room.name}`
                                }
                            );
                        }
                    }


                    addLog(
                        `👑 تم توكيل ${adminName} لإدارة ${room.name}`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ ASSIGN ROOM ADMIN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   REMOVE ADMIN FROM ROOM
   ========================================================= */

        socket.on(
            "remove room admin",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ المدير الرئيسي فقط يستطيع إزالة مشرف الغرفة"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    const adminName =
                        cleanName(
                            data?.adminName ||
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (
                        !roomId ||
                        !adminName
                    ) {
                        return;
                    }


                    const moderation =
                        ensureRoom(
                            roomId
                        );


                    moderation.admins =
                        moderation.admins.filter(
                            name =>
                                !sameName(
                                    name,
                                    adminName
                                )
                        );


                    saveJSON(
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


                    const targetUser =
                        getUserByName(
                            adminName
                        );


                    if (targetUser) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                targetUser.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "room admin removed",
                                {
                                    roomId,

                                    message:
                                        "ℹ️ تمت إزالة صلاحية الإشراف عنك في هذه الغرفة"
                                }
                            );


                            if (
                                String(
                                    targetUser.roomId
                                ) === roomId
                            ) {

                                targetSocket.roomAdmin =
                                    false;
                            }
                        }
                    }


                    addLog(
                        `👑 تمت إزالة ${adminName} من مشرفي الغرفة`,
                        roomId
                    );

                } catch (error) {

                    console.error(
                        "❌ REMOVE ROOM ADMIN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   ROOM ADMIN PERMISSIONS
   ========================================================= */

        socket.on(
            "update room admin permissions",
            data => {

                try {

                    if (
                        !isAdmin(socket)
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ المدير الرئيسي فقط يستطيع تعديل صلاحيات المشرفين"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    const adminName =
                        cleanName(
                            data?.adminName ||
                            ""
                        );


                    if (
                        !roomId ||
                        !adminName
                    ) {
                        return;
                    }


                    const targetAdmin =
                        getAdminByName(
                            adminName
                        );


                    if (!targetAdmin) {
                        return;
                    }


                    if (
                        !targetAdmin.roomPermissions
                    ) {

                        targetAdmin.roomPermissions =
                            {};
                    }


                    if (
                        !targetAdmin.roomPermissions[
                            roomId
                        ]
                    ) {

                        targetAdmin.roomPermissions[
                            roomId
                        ] = {};
                    }


                    const incoming =
                        data?.permissions ||
                        {};


                    targetAdmin.roomPermissions[
                        roomId
                    ] =
                        {
                            ...targetAdmin
                                .roomPermissions[
                                    roomId
                                ],

                            ...incoming
                        };


                    saveJSON(
                        "admins.json",
                        admins
                    );


                    io.emit(
                        "room admin permissions updated",
                        {
                            roomId,

                            adminName,

                            permissions:
                                targetAdmin
                                    .roomPermissions[
                                        roomId
                                    ]
                        }
                    );


                } catch (error) {

                    console.error(
                        "❌ ROOM ADMIN PERMISSIONS ERROR",
                        error
                    );
                }
            }
        );
      /* =========================================================
   USER LOGIN
   ========================================================= */

        socket.on(
            "login",
            data => {

                try {

                    /* =========================================
                       USERNAME
                       ========================================= */

                    const username =
                        cleanName(
                            data?.username ||
                            data?.name ||
                            ""
                        );


                    if (!username) {

                        socket.emit(
                            "login error",
                            "❌ اكتب اسم المستخدم"
                        );

                        return;
                    }


                    /* =========================================
                       NAME LENGTH
                       ========================================= */

                    if (
                        username.length < 2 ||
                        username.length > 30
                    ) {

                        socket.emit(
                            "login error",
                            "❌ اسم المستخدم يجب أن يكون بين 2 و30 حرفًا"
                        );

                        return;
                    }


                    /* =========================================
                       RESERVED PREFIX
                       ========================================= */

                    if (
                        username.startsWith("&") ||
                        username.startsWith("@")
                    ) {

                        socket.emit(
                            "login error",
                            "❌ لا يمكنك استخدام رموز الإدارة في اسمك"
                        );

                        return;
                    }


                    /* =========================================
                       RESERVED ADMIN NAME
                       ========================================= */

                    const reservedAdmin =
                        admins.find(
                            admin =>
                                sameName(
                                    admin.name,
                                    username
                                )
                        );


                    let admin =
                        null;


                    if (
                        reservedAdmin
                    ) {

                        const password =
                            String(
                                data?.adminPassword ||
                                data?.password ||
                                ""
                            );


                        if (
                            password !==
                            String(
                                reservedAdmin.password
                            )
                        ) {

                            socket.emit(
                                "login error",
                                "❌ هذا الاسم محجوز للأدمن"
                            );

                            return;
                        }


                        admin =
                            reservedAdmin;

                        socket.adminData =
                            admin;
                    }


                    /* =========================================
                       DUPLICATE USER
                       ========================================= */

                    const existingUser =
                        getUserByName(
                            username
                        );


                    if (
                        existingUser
                    ) {

                        socket.emit(
                            "login error",
                            "⚠️ هذا الاسم مستخدم حاليًا"
                        );

                        return;
                    }


                    /* =========================================
                       IP
                       ========================================= */

                    const ip =
                        getIP(
                            socket
                        );


                    /* =========================================
                       GLOBAL BAN
                       ========================================= */

                    const globalBan =
                        bannedUsers.some(
                            item => {

                                const name =
                                    typeof item ===
                                    "string"
                                        ? item
                                        : item?.name;

                                const itemIP =
                                    typeof item ===
                                    "object"
                                        ? item?.ip
                                        : null;


                                return (
                                    sameName(
                                        name,
                                        username
                                    ) ||
                                    (
                                        itemIP &&
                                        String(
                                            itemIP
                                        ) ===
                                        String(
                                            ip
                                        )
                                    )
                                );
                            }
                        );


                    if (
                        globalBan
                    ) {

                        socket.emit(
                            "banned",
                            "🚫 أنت محظور من الدردشة"
                        );

                        return;
                    }


                    /* =========================================
                       DEVICE BAN
                       ========================================= */

                    const device =
                        getDevice(
                            socket
                        );


                    const deviceBan =
                        deviceBannedUsers.some(
                            item => {

                                if (
                                    typeof item ===
                                    "string"
                                ) {
                                    return item ===
                                        device;
                                }

                                return (
                                    item?.device ===
                                    device
                                );
                            }
                        );


                    if (
                        deviceBan
                    ) {

                        socket.emit(
                            "banned",
                            "🚫 جهازك محظور من الدردشة"
                        );

                        return;
                    }


                    /* =========================================
                       ADMIN ROLE
                       ========================================= */

                    let adminRole =
                        null;


                    if (
                        admin
                    ) {

                        adminRole =
                            isMasterAdmin(
                                admin
                            )
                                ? "master"
                                : "moderator";
                    }


                    /* =========================================
                       USER OBJECT
                       ========================================= */

                    const user = {

                        id:
                            socket.id,

                        socketId:
                            socket.id,

                        name:
                            username,

                        username,

                        color:
                            data?.color ||
                            "#ffd700",

                        ip,

                        device,

                        userAgent:
                            socket.handshake
                                ?.headers
                                ?.["user-agent"] ||
                            "",

                        admin:
                            !!admin,

                        isAdmin:
                            !!admin,

                        adminRole,

                        prefix:
                            adminRole ===
                            "master"
                                ? "&"
                                : adminRole ===
                                  "moderator"
                                    ? "@"
                                    : "",

                        roomId:
                            null,

                        currentRoom:
                            null
                    };


                    users.push(
                        user
                    );


                    socket.username =
                        username;


                    socket.user =
                        user;


                    /* =========================================
                       LOGIN SUCCESS
                       ========================================= */

                    socket.emit(
                        "login success",
                        {

                            username,

                            name:
                                username,

                            isAdmin:
                                !!admin,

                            adminRole,

                            prefix:
                                user.prefix,

                            rooms:
                                getPublicRooms(),

                            globalDisconnect:
                                !!globalDisconnect
                        }
                    );


                    /* =========================================
                       GLOBAL DISCONNECT NOTICE
                       ========================================= */

                    if (
                        globalDisconnect
                    ) {

                        socket.emit(
                            "global disconnected",
                            {
                                message:
                                    "⛔ أنت مفصول عن الدردشة العامة"
                            }
                        );
                    }


                    /* =========================================
                       ONLINE USERS
                       ========================================= */

                    emitOnlineUsers();

                    emitAdminUsers();


                    /* =========================================
                       LOG
                       ========================================= */

                    addLog(
                        `👤 ${username} دخل`
                    );


                    console.log(
                        `👤 LOGIN: ${username}`
                    );


                } catch (error) {

                    console.error(
                        "❌ LOGIN ERROR",
                        error
                    );

                    socket.emit(
                        "login error",
                        "❌ حدث خطأ أثناء تسجيل الدخول"
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
                        cleanName(
                            data?.name ||
                            data?.username ||
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
                                sameName(
                                    item.name,
                                    name
                                ) &&
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


                    /* =========================================
                       ADMIN SUCCESS
                       ========================================= */

                    socket.emit(
                        "admin login success",
                        {

                            permissions:
                                admin.permissions ||
                                {},

                            rooms:
                                admin.rooms ||
                                admin.assignedRooms ||
                                [],

                            roomPermissions:
                                admin.roomPermissions ||
                                {},

                            role:
                                isMasterAdmin(
                                    admin
                                )
                                    ? "master"
                                    : "moderator",

                            isMaster:
                                isMasterAdmin(
                                    admin
                                )
                        }
                    );


                    /* =========================================
                       ADMIN USERS
                       ========================================= */

                    emitAdminUsers(
                        socket
                    );


                    /* =========================================
                       STATS
                       ========================================= */

                    emitStats(
                        socket
                    );


                    /* =========================================
                       LOGS
                       ========================================= */

                    socket.emit(
                        "admin logs",
                        logs
                    );


                    socket.emit(
                        "logs",
                        logs
                    );


                    /* =========================================
                       ROOMS
                       ========================================= */

                    socket.emit(
                        "admin rooms",
                        rooms.map(
                            publicRoom
                        )
                    );


                    /* =========================================
                       ADMINS
                       ========================================= */

                    socket.emit(
                        "admins list",
                        admins.map(
                            adminItem => ({

                                name:
                                    adminItem.name,

                                role:
                                    isMasterAdmin(
                                        adminItem
                                    )
                                        ? "master"
                                        : "moderator",

                                permissions:
                                    adminItem.permissions ||
                                    {},

                                rooms:
                                    adminItem.rooms ||
                                    adminItem.assignedRooms ||
                                    [],

                                roomPermissions:
                                    adminItem.roomPermissions ||
                                    {}
                            })
                        )
                    );


                    addLog(
                        `👑 دخول لوحة الإدارة: ${name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ ADMIN LOGIN ERROR",
                        error
                    );

                    socket.emit(
                        "admin login failed"
                    );
                }
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


                emitAdminUsers(
                    socket
                );


                emitStats(
                    socket
                );
            }
        );


/* =========================================================
   GET STATS
   ========================================================= */

        socket.on(
            "get stats",
            () => {

                if (
                    !socket.adminData
                ) {
                    return;
                }


                emitStats(
                    socket
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
                    "admin logs",
                    logs
                );


                socket.emit(
                    "logs",
                    logs
                );
            }
        );


/* =========================================================
   GET ROOMS
   ========================================================= */

        socket.on(
            "get rooms",
            () => {

                socket.emit(
                    "rooms",
                    getPublicRooms()
                );


                if (
                    socket.adminData
                ) {

                    socket.emit(
                        "admin rooms",
                        rooms.map(
                            publicRoom
                        )
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


/* =========================================================
   CREATE ROOM
   ========================================================= */

        socket.on(
            "create room",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {

                        socket.emit(
                            "room error",
                            "❌ يجب تسجيل الدخول كأدمن"
                        );

                        return;
                    }


                    const allowed =
                        isMasterAdmin(
                            socket.adminData
                        ) ||
                        !!socket.adminData
                            ?.permissions
                            ?.rooms ||
                        !!socket.adminData
                            ?.permissions
                            ?.addAdmin;


                    if (
                        !allowed
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية إنشاء الغرف"
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
                        name.length >
                        50
                    ) {

                        socket.emit(
                            "room error",
                            "❌ اسم الغرفة طويل جدًا"
                        );

                        return;
                    }


                    const exists =
                        rooms.some(
                            room =>
                                sameName(
                                    room.name,
                                    name
                                )
                        );


                    if (
                        exists
                    ) {

                        socket.emit(
                            "room error",
                            "⚠️ هذه الغرفة موجودة مسبقًا"
                        );

                        return;
                    }


                    const room = {

                        id:
                            makeId(
                                "room"
                            ),

                        name,

                        description,

                        enabled:
                            true,

                        createdAt:
                            Date.now(),

                        settings: {

                            chatLock:
                                false,

                            maintenance:
                                false,

                            starsMode:
                                false,

                            protection:
                                true
                        }
                    };


                    rooms.push(
                        room
                    );


                    ensureRoom(
                        room.id
                    );

                    ensureRoomMessages(
                        room.id
                    );

                    ensureRoomStars(
                        room.id
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

                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );


                    socket.emit(
                        "room created",
                        publicRoom(
                            room
                        )
                    );


                    io.emit(
                        "rooms updated",
                        getPublicRooms()
                    );


                    io.emit(
                        "rooms",
                        getPublicRooms()
                    );


                    socket.emit(
                        "admin rooms",
                        rooms.map(
                            publicRoom
                        )
                    );


                    addLog(
                        `🏠 تم إنشاء الغرفة ${name}`
                    );


                    console.log(
                        `🏠 ROOM CREATED: ${name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ CREATE ROOM ERROR",
                        error
                    );

                    socket.emit(
                        "room error",
                        "❌ فشل إنشاء الغرفة"
                    );
                }
            }
        );


/* =========================================================
   DELETE ROOM
   ========================================================= */

        socket.on(
            "delete room",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ المدير الرئيسي فقط يستطيع حذف الغرف"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


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


                    /* =========================================
                       REMOVE USERS FROM ROOM
                       ========================================= */

                    users.forEach(
                        user => {

                            if (
                                String(
                                    user.roomId
                                ) ===
                                roomId
                            ) {

                                const targetSocket =
                                    io.sockets.sockets.get(
                                        user.socketId
                                    );


                                if (
                                    targetSocket
                                ) {

                                    targetSocket.leave(
                                        `room:${roomId}`
                                    );


                                    targetSocket.currentRoom =
                                        null;

                                    targetSocket.roomAdmin =
                                        false;


                                    targetSocket.emit(
                                        "room deleted",
                                        {
                                            roomId,

                                            message:
                                                "🗑️ تم حذف هذه الغرفة"
                                        }
                                    );
                                }


                                user.roomId =
                                    null;

                                user.currentRoom =
                                    null;
                            }
                        }
                    );


                    /* =========================================
                       DELETE DATA
                       ========================================= */

                    rooms =
                        rooms.filter(
                            item =>
                                String(
                                    item.id
                                ) !==
                                roomId
                        );


                    delete roomModeration[
                        roomId
                    ];


                    delete roomMessages[
                        roomId
                    ];


                    delete roomStars[
                        roomId
                    ];


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

                    saveJSON(
                        "roomStars.json",
                        roomStars
                    );


                    socket.emit(
                        "room deleted",
                        {
                            roomId
                        }
                    );


                    io.emit(
                        "rooms updated",
                        getPublicRooms()
                    );


                    io.emit(
                        "rooms",
                        getPublicRooms()
                    );


                    emitOnlineUsers();
                    emitAdminUsers();


                    addLog(
                        `🗑️ تم حذف الغرفة ${room.name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ DELETE ROOM ERROR",
                        error
                    );

                    socket.emit(
                        "room error",
                        "❌ فشل حذف الغرفة"
                    );
                }
            }
        );


/* =========================================================
   TOGGLE ROOM ENABLE / DISABLE
   ========================================================= */

        socket.on(
            "toggle room",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ لا تملك صلاحية إيقاف الغرفة"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


                    const room =
                        getRoom(
                            roomId
                        );


                    if (!room) {
                        return;
                    }


                    room.enabled =
                        data?.enabled !== undefined
                            ? !!data.enabled
                            : !room.enabled;


                    saveJSON(
                        "rooms.json",
                        rooms
                    );


                    io.emit(
                        "rooms updated",
                        getPublicRooms()
                    );


                    io.to(
                        `room:${roomId}`
                    ).emit(
                        "room settings updated",
                        {
                            roomId,

                            enabled:
                                room.enabled,

                            settings:
                                room.settings
                        }
                    );


                    addLog(
                        room.enabled
                            ? `✅ تم تشغيل الغرفة ${room.name}`
                            : `⛔ تم إيقاف الغرفة ${room.name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ TOGGLE ROOM ERROR",
                        error
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

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "room error",
                            "⛔ المدير الرئيسي فقط يستطيع تعديل الغرفة"
                        );

                        return;
                    }


                    const roomId =
                        String(
                            data?.roomId ||
                            ""
                        ).trim();


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


                    const newName =
                        String(
                            data?.name ||
                            room.name
                        ).trim();


                    const newDescription =
                        String(
                            data?.description ??
                            room.description  ??
                            ""
                        ).trim();


                    if (!newName) {

                        socket.emit(
                            "room error",
                            "❌ اسم الغرفة مطلوب"
                        );

                        return;
                    }


                    const duplicate =
                        rooms.some(
                            item =>
                                String(
                                    item.id
                                ) !== roomId &&
                                sameName(
                                    item.name,
                                    newName
                                )
                        );


                    if (
                        duplicate
                    ) {

                        socket.emit(
                            "room error",
                            "⚠️ اسم الغرفة مستخدم مسبقًا"
                        );

                        return;
                    }


                    room.name =
                        newName;

                    room.description =
                        newDescription;


                    saveJSON(
                        "rooms.json",
                        rooms
                    );


                    socket.emit(
                        "room updated",
                        publicRoom(
                            room
                        )
                    );


                    io.emit(
                        "rooms updated",
                        getPublicRooms()
                    );


                    io.emit(
                        "rooms",
                        getPublicRooms()
                    );


                    addLog(
                        `✏️ تم تعديل الغرفة ${room.name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ EDIT ROOM ERROR",
                        error
                    );
                }
            }
        );
      /* =========================================================
   GLOBAL ADMIN COMMANDS
   هذه الأوامر منفصلة عن أوامر الغرف
   ========================================================= */


/* =========================================================
   GLOBAL BAN
   ========================================================= */

        socket.on(
            "ban user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !socket.adminData
                            ?.permissions
                            ?.ban &&
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {

                        socket.emit(
                            "admin error",
                            "⛔ لا تملك صلاحية الحظر العام"
                        );

                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    if (!username) {
                        return;
                    }


                    const target =
                        getUserByName(
                            username
                        );


                    const banEntry = {

                        name:
                            username,

                        ip:
                            target?.ip ||
                            null,

                        device:
                            target?.device ||
                            null,

                        by:
                            socket.adminData.name,

                        time:
                            Date.now()
                    };


                    /* لا نكرر الحظر */

                    const alreadyBanned =
                        bannedUsers.some(
                            item =>
                                sameName(
                                    typeof item === "string"
                                        ? item
                                        : item?.name,
                                    username
                                )
                        );


                    if (
                        !alreadyBanned
                    ) {

                        bannedUsers.push(
                            banEntry
                        );
                    }


                    saveJSON(
                        "banned.json",
                        bannedUsers
                    );


                    /* فصل المستخدم من كل الغرف */

                    if (
                        target
                    ) {

                        const targetSocket =
                            io.sockets.sockets.get(
                                target.socketId
                            );


                        if (
                            targetSocket
                        ) {

                            targetSocket.emit(
                                "banned",
                                "🚫 تم حظرك من الدردشة"
                            );


                            targetSocket.disconnect(
                                true
                            );
                        }
                    }


                    emitStats();

                    emitAdminUsers();


                    addLog(
                        `🚫 تم حظر ${username} حظرًا عامًا`
                    );


                } catch (error) {

                    console.error(
                        "❌ GLOBAL BAN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GLOBAL UNBAN
   ========================================================= */

        socket.on(
            "unban user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !socket.adminData
                            ?.permissions
                            ?.unban &&
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {
                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    if (!username) {
                        return;
                    }


                    bannedUsers =
                        bannedUsers.filter(
                            item => {

                                const name =
                                    typeof item === "string"
                                        ? item
                                        : item?.name;

                                return !sameName(
                                    name,
                                    username
                                );
                            }
                        );


                    saveJSON(
                        "banned.json",
                        bannedUsers
                    );


                    io.emit(
                        "user unbanned",
                        {
                            username
                        }
                    );


                    emitStats();


                    addLog(
                        `🔓 تم فك الحظر العام عن ${username}`
                    );


                } catch (error) {

                    console.error(
                        "❌ GLOBAL UNBAN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GLOBAL MUTE
   ========================================================= */

        socket.on(
            "mute user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !socket.adminData
                            ?.permissions
                            ?.mute &&
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {
                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    if (!username) {
                        return;
                    }


                    if (
                        !mutedUsers.some(
                            item =>
                                sameName(
                                    typeof item === "string"
                                        ? item
                                        : item?.name,
                                    username
                                )
                        )
                    ) {

                        mutedUsers.push({

                            name:
                                username,

                            by:
                                socket.adminData.name,

                            time:
                                Date.now()
                        });
                    }


                    saveJSON(
                        "muted.json",
                        mutedUsers
                    );


                    io.emit(
                        "user muted",
                        {
                            username
                        }
                    );


                    addLog(
                        `🔇 تم كتم ${username} بشكل عام`
                    );


                } catch (error) {

                    console.error(
                        "❌ GLOBAL MUTE ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GLOBAL KICK
   ========================================================= */

        socket.on(
            "kick user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !socket.adminData
                            ?.permissions
                            ?.kick &&
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {
                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    const target =
                        getUserByName(
                            username
                        );


                    if (
                        !target
                    ) {
                        return;
                    }


                    const targetSocket =
                        io.sockets.sockets.get(
                            target.socketId
                        );


                    if (
                        targetSocket
                    ) {

                        targetSocket.emit(
                            "kicked",
                            "👢 تم طردك من الدردشة"
                        );


                        targetSocket.disconnect(
                            true
                        );
                    }


                    addLog(
                        `👢 تم طرد ${username}`
                    );


                } catch (error) {

                    console.error(
                        "❌ GLOBAL KICK ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   GLOBAL DISCONNECT USER
   ========================================================= */

        socket.on(
            "disconnect user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    if (
                        !socket.adminData
                            ?.permissions
                            ?.disconnect &&
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {
                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    const target =
                        getUserByName(
                            username
                        );


                    if (
                        !target
                    ) {
                        return;
                    }


                    const targetSocket =
                        io.sockets.sockets.get(
                            target.socketId
                        );


                    if (
                        targetSocket
                    ) {

                        targetSocket.emit(
                            "user disconnected",
                            {
                                message:
                                    "⛔ تم فصلك من الدردشة"
                            }
                        );


                        targetSocket.disconnect(
                            true
                        );
                    }


                    addLog(
                        `⛔ تم فصل ${username}`
                    );


                } catch (error) {

                    console.error(
                        "❌ GLOBAL DISCONNECT ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   VIEW USER
   ========================================================= */

        socket.on(
            "view user",
            data => {

                try {

                    if (
                        !socket.adminData
                    ) {
                        return;
                    }


                    const canView =
                        isMasterAdmin(
                            socket.adminData
                        ) ||
                        !!socket.adminData
                            ?.permissions
                            ?.viewUserInfo ||
                        !!socket.adminData
                            ?.permissions
                            ?.viewIP;


                    if (
                        !canView
                    ) {
                        return;
                    }


                    const username =
                        cleanName(
                            data?.name ||
                            data?.username ||
                            ""
                        );


                    const target =
                        getUserByName(
                            username
                        );


                    if (
                        !target
                    ) {

                        socket.emit(
                            "user info",
                            null
                        );

                        return;
                    }


                    socket.emit(
                        "user info",
                        {

                            name:
                                target.name,

                            username:
                                target.username,

                            ip:
                                target.ip,

                            device:
                                target.device,

                            userAgent:
                                target.userAgent,

                            room:
                                target.roomId
                                    || null
                        }
                    );


                } catch (error) {

                    console.error(
                        "❌ VIEW USER ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   ADD ADMIN
   ========================================================= */

        socket.on(
            "add admin",
            data => {

                try {

                    if (
                        !socket.adminData ||
                        !isMasterAdmin(
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
                        cleanName(
                            data?.name ||
                            ""
                        );


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
                            "❌ الاسم وكلمة المرور مطلوبان"
                        );

                        return;
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

                        socket.emit(
                            "admin error",
                            "⚠️ هذا الأدمن موجود مسبقًا"
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

                        rooms:
                            [],

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


                    socket.emit(
                        "admin added",
                        newAdmin
                    );


                    io.emit(
                        "admins updated",
                        admins.map(
                            item => ({

                                name:
                                    item.name,

                                role:
                                    isMasterAdmin(
                                        item
                                    )
                                        ? "master"
                                        : "moderator",

                                permissions:
                                    item.permissions ||
                                    {}
                            })
                        )
                    );


                    addLog(
                        `👑 تمت إضافة الأدمن ${name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ ADD ADMIN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   REMOVE ADMIN
   ========================================================= */

        socket.on(
            "remove admin",
            data => {

                try {

                    if (
                        !socket.adminData ||
                        !isMasterAdmin(
                            socket.adminData
                        )
                    ) {
                        return;
                    }


                    const name =
                        cleanName(
                            data?.name ||
                            ""
                        );


                    if (!name) {
                        return;
                    }


                    /* لا نحذف المدير الرئيسي */

                    const target =
                        admins.find(
                            admin =>
                                sameName(
                                    admin.name,
                                    name
                                )
                        );


                    if (
                        !target
                    ) {
                        return;
                    }


                    if (
                        isMasterAdmin(
                            target
                        )
                    ) {

                        socket.emit(
                            "admin error",
                            "⛔ لا يمكن حذف المدير الرئيسي"
                        );

                        return;
                    }


                    admins =
                        admins.filter(
                            admin =>
                                !sameName(
                                    admin.name,
                                    name
                                )
                        );


                    saveJSON(
                        "admins.json",
                        admins
                    );


                    /* إزالة صلاحياته من الغرف */

                    Object.keys(
                        roomModeration
                    ).forEach(
                        roomId => {

                            const moderation =
                                ensureRoomModeration(
                                    roomId
                                );


                            moderation.admins =
                                moderation.admins.filter(
                                    adminName =>
                                        !sameName(
                                            adminName,
                                            name
                                        )
                                );
                        }
                    );


                    saveJSON(
                        "roomModeration.json",
                        roomModeration
                    );


                    io.emit(
                        "admins updated",
                        admins
                    );


                    addLog(
                        `🗑️ تمت إزالة الأدمن ${name}`
                    );


                } catch (error) {

                    console.error(
                        "❌ REMOVE ADMIN ERROR",
                        error
                    );
                }
            }
        );


/* =========================================================
   ADMIN LOGOUT
   ========================================================= */

        socket.on(
            "admin logout",
            () => {

                socket.adminData =
                    null;

                socket.roomAdmin =
                    false;
            }
        );
      /* =========================================================
   GLOBAL STATE PERSISTENCE
   حفظ حالة التحكم العام
   ========================================================= */

const globalState =
    loadJSON(
        "globalState.json",
        {
            chatLocked: false,
            privateLocked: false,
            maintenance: false,
            starsMode: false,
            disconnect: false
        }
    );


globalChatLocked =
    !!globalState.chatLocked;


globalPrivateLocked =
    !!globalState.privateLocked;


globalMaintenance =
    !!globalState.maintenance;


globalStarsMode =
    !!globalState.starsMode;


globalDisconnect =
    !!globalState.disconnect;


function saveGlobalState() {

    saveJSON(
        "globalState.json",
        {
            chatLocked:
                globalChatLocked,

            privateLocked:
                globalPrivateLocked,

            maintenance:
                globalMaintenance,

            starsMode:
                globalStarsMode,

            disconnect:
                globalDisconnect
        }
    );
}


/* =========================================================
   GLOBAL CONTROL URL
   صفحة التحكم العام
   كلمة المرور لا تظهر داخل JavaScript
   ========================================================= */

const GLOBAL_CONTROL_PATH =
    process.env.GLOBAL_CONTROL_PATH ||
    "/global-control-7xK9";


const GLOBAL_CONTROL_PASSWORD =
    process.env.GLOBAL_CONTROL_PASSWORD ||
    "MersalGlobal2026";


app.use(
    express.urlencoded({
        extended: true
    })
);


/* =========================================================
   GLOBAL CONTROL PAGE
   ========================================================= */

app.get(
    GLOBAL_CONTROL_PATH,
    (req, res) => {

        res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Global Control</title>

<style>

body{
    margin:0;
    background:#090b10;
    color:#fff;
    font-family:Arial,sans-serif;
    display:flex;
    justify-content:center;
    align-items:center;
    min-height:100vh;
}

.box{
    width:90%;
    max-width:420px;
    background:#11151d;
    border:1px solid #333;
    border-radius:18px;
    padding:25px;
    box-sizing:border-box;
}

h1{
    text-align:center;
    margin-top:0;
}

input{
    width:100%;
    box-sizing:border-box;
    padding:14px;
    margin:10px 0;
    border-radius:10px;
    border:1px solid #444;
    background:#080a0f;
    color:#fff;
    font-size:16px;
}

button{
    width:100%;
    padding:14px;
    margin-top:10px;
    border:0;
    border-radius:10px;
    font-size:16px;
    cursor:pointer;
}

.disconnect{
    background:#c62828;
    color:#fff;
}

.restore{
    background:#2e7d32;
    color:#fff;
}

.status{
    margin-top:18px;
    padding:12px;
    border-radius:10px;
    background:#080a0f;
    text-align:center;
}

</style>

</head>

<body>

<div class="box">

<h1>🔐 التحكم العام</h1>

<form method="POST">

<input
    type="password"
    name="password"
    placeholder="كلمة المرور"
    required
>

<button
    class="disconnect"
    name="action"
    value="disconnect"
>
⛔ فصل الدردشة العامة
</button>

<button
    class="restore"
    name="action"
    value="restore"
>
🔓 فك الفصل العام
</button>

</form>

<div class="status">

الحالة الحالية:

<strong>
${globalDisconnect ? "⛔ مفصولة" : "🟢 تعمل"}
</strong>

</div>

</div>

</body>

</html>
        `);
    }
);


/* =========================================================
   GLOBAL CONTROL ACTION
   ========================================================= */

app.post(
    GLOBAL_CONTROL_PATH,
    (req, res) => {

        const password =
            String(
                req.body?.password ||
                ""
            );


        const action =
            String(
                req.body?.action ||
                ""
            );


        if (
            password !==
            GLOBAL_CONTROL_PASSWORD
        ) {

            res.status(403).send(`
                <h2
                    style="
                    font-family:Arial;
                    text-align:center;
                    margin-top:50px;
                    "
                >
                    ❌ كلمة المرور غير صحيحة
                </h2>
            `);

            return;
        }


        if (
            action ===
            "disconnect"
        ) {

            globalDisconnect =
                true;


            saveGlobalState();


            io.emit(
                "global disconnected",
                {
                    message:
                        "⛔ تم فصل الدردشة العامة مؤقتًا"
                }
            );


            addLog(
                "⛔ تم فصل الدردشة العامة"
            );
        }


        if (
            action ===
            "restore"
        ) {

            globalDisconnect =
                false;


            saveGlobalState();


            io.emit(
                "global disconnect lifted",
                {
                    message:
                        "🔓 تم فك الفصل عن الدردشة العامة"
                }
            );


            addLog(
                "🔓 تم فك فصل الدردشة العامة"
            );
        }


        res.redirect(
            GLOBAL_CONTROL_PATH
        );
    }
);


/* =========================================================
   ROOM JOIN
   ========================================================= */

socket.on(
    "join room",
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
                String(
                    data?.roomId ||
                    ""
                ).trim();


            if (!roomId) {

                socket.emit(
                    "room error",
                    "❌ الغرفة غير محددة"
                );

                return;
            }


            const room =
                getRoomById(
                    roomId
                );


            if (!room) {

                socket.emit(
                    "room error",
                    "❌ الغرفة غير موجودة"
                );

                return;
            }


            if (
                room.enabled === false
            ) {

                socket.emit(
                    "room error",
                    "⛔ هذه الغرفة مغلقة"
                );

                return;
            }


            const moderation =
                ensureRoomModeration(
                    roomId
                );


            const isBanned =
                moderation.banned.some(
                    item =>
                        sameName(
                            typeof item === "string"
                                ? item
                                : item?.name,
                            user.name
                        )
                );


            if (isBanned) {

                socket.emit(
                    "room banned",
                    {
                        roomId,
                        message:
                            "🚫 أنت محظور من هذه الغرفة"
                    }
                );

                return;
            }


            const isDisconnected =
                moderation.disconnected.some(
                    item =>
                        sameName(
                            typeof item === "string"
                                ? item
                                : item?.name,
                            user.name
                        )
                );


            if (isDisconnected) {

                socket.emit(
                    "room disconnected",
                    {
                        roomId,
                        message:
                            "⛔ تم فصلك من هذه الغرفة"
                    }
                );

                return;
            }


            user.roomIds =
                Array.isArray(
                    user.roomIds
                )
                    ? user.roomIds
                    : [];


            /*
             * الحد الأقصى 3 غرف عامة مفتوحة
             */

            if (
                !user.roomIds.includes(
                    roomId
                ) &&
                user.roomIds.length >= 3
            ) {

                socket.emit(
                    "room error",
                    "⚠️ يمكنك فتح 3 غرف فقط في نفس الوقت"
                );

                return;
            }


            if (
                !user.roomIds.includes(
                    roomId
                )
            ) {

                user.roomIds.push(
                    roomId
                );
            }


            user.roomId =
                roomId;


            user.currentRoom =
                roomId;


            socket.join(
                `room:${roomId}`
            );


            socket.emit(
                "room joined",
                {
                    room,
                    roomId,

                    messages:
                        roomMessages[
                            roomId
                        ] || [],

                    users:
                        getRoomUsers(
                            roomId
                        )
                }
            );


            io.to(
                `room:${roomId}`
            ).emit(
                "room users",
                getRoomUsers(
                    roomId
                )
            );


        } catch (error) {

            console.error(
                "❌ JOIN ROOM ERROR",
                error
            );
        }
    }
);


/* =========================================================
   LEAVE ROOM
   ========================================================= */

socket.on(
    "leave room",
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
                String(
                    data?.roomId ||
                    ""
                ).trim();


            if (!roomId) {
                return;
            }


            socket.leave(
                `room:${roomId}`
            );


            user.roomIds =
                Array.isArray(
                    user.roomIds
                )
                    ? user.roomIds
                    : [];


            user.roomIds =
                user.roomIds.filter(
                    id =>
                        id !== roomId
                );


            if (
                user.currentRoom ===
                roomId
            ) {

                user.currentRoom =
                    user.roomIds[0] ||
                    null;

                user.roomId =
                    user.currentRoom;
            }


            io.to(
                `room:${roomId}`
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


        } catch (error) {

            console.error(
                "❌ LEAVE ROOM ERROR",
                error
            );
        }
    }
);


/* =========================================================
   SWITCH CURRENT ROOM
   ========================================================= */

socket.on(
    "switch room",
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
                String(
                    data?.roomId ||
                    ""
                ).trim();


            if (!roomId) {
                return;
            }


            user.roomIds =
                Array.isArray(
                    user.roomIds
                )
                    ? user.roomIds
                    : [];


            if (
                !user.roomIds.includes(
                    roomId
                )
            ) {

                socket.emit(
                    "room error",
                    "❌ لم تدخل هذه الغرفة"
                );

                return;
            }


            user.currentRoom =
                roomId;


            user.roomId =
                roomId;


            socket.emit(
                "room switched",
                {
                    roomId,

                    messages:
                        roomMessages[
                            roomId
                        ] || [],

                    users:
                        getRoomUsers(
                            roomId
                        )
                }
            );


        } catch (error) {

            console.error(
                "❌ SWITCH ROOM ERROR",
                error
            );
        }
    }
);


/* =========================================================
   PUBLIC ROOM MESSAGE
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
                String(
                    data?.roomId ||
                    user.currentRoom ||
                    ""
                ).trim();


            if (!roomId) {

                socket.emit(
                    "chat error",
                    "🏠 يجب اختيار غرفة أولًا"
                );

                return;
            }


            const room =
                getRoomById(
                    roomId
                );


            if (!room) {

                socket.emit(
                    "chat error",
                    "❌ الغرفة غير موجودة"
                );

                return;
            }


            if (
                globalDisconnect
            ) {

                socket.emit(
                    "global disconnected",
                    {
                        message:
                            "⛔ أنت مفصول عن الدردشة العامة"
                    }
                );

                return;
            }


            if (
                globalMaintenance
            ) {

                socket.emit(
                    "chat error",
                    "🛠️ الدردشة تحت الصيانة"
                );

                return;
            }


            if (
                globalChatLocked
            ) {

                socket.emit(
                    "chat error",
                    "🔒 الدردشة العامة مقفلة"
                );

                return;
            }


            const moderation =
                ensureRoomModeration(
                    roomId
                );


            const banned =
                moderation.banned.some(
                    item =>
                        sameName(
                            typeof item === "string"
                                ? item
                                : item?.name,
                            user.name
                        )
                );


            if (banned) {

                socket.emit(
                    "room banned",
                    {
                        roomId,
                        message:
                            "🚫 أنت محظور من هذه الغرفة"
                    }
                );

                return;
            }


            const muted =
                moderation.muted.some(
                    item =>
                        sameName(
                            typeof item === "string"
                                ? item
                                : item?.name,
                            user.name
                        )
                );


            if (muted) {

                socket.emit(
                    "room muted",
                    {
                        roomId,
                        message:
                            "🔇 أنت مكتوم في هذه الغرفة"
                    }
                );

                return;
            }


            const roomLocked =
                room.chatLock === true;


            if (
                roomLocked
            ) {

                socket.emit(
                    "chat error",
                    "🔒 الدردشة في هذه الغرفة مقفلة"
                );

                return;
            }


            const messageText =
                String(
                    data?.message ||
                    data?.text ||
                    ""
                ).trim();


            if (!messageText) {
                return;
            }


            if (
                messageText.length >
                3000
            ) {

                socket.emit(
                    "chat error",
                    "⚠️ الرسالة طويلة جدًا"
                );

                return;
            }


            const message = {

                id:
                    makeId(),

                roomId,

                name:
                    user.name,

                username:
                    user.username ||
                    user.name,

                prefix:
                    user.prefix ||
                    "",

                message:
                    messageText,

                text:
                    messageText,

                reply:
                    data?.reply ||
                    null,

                timestamp:
                    Date.now()
            };


            if (
                !Array.isArray(
                    roomMessages[
                        roomId
                    ]
                )
            ) {

                roomMessages[
                    roomId
                ] = [];
            }


            roomMessages[
                roomId
            ].push(
                message
            );


            if (
                roomMessages[
                    roomId
                ].length > 500
            ) {

                roomMessages[
                    roomId
                ] =
                    roomMessages[
                        roomId
                    ].slice(-500);
            }


            saveJSON(
                "roomMessages.json",
                roomMessages
            );


            io.to(
                `room:${roomId}`
            ).emit(
                "chat message",
                message
            );


        } catch (error) {

            console.error(
                "❌ CHAT MESSAGE ERROR",
                error
            );
        }
    }
);


/* =========================================================
   PRIVATE MESSAGE
   ========================================================= */

socket.on(
    "private message",
    data => {

        try {

            const sender =
                getUserBySocket(
                    socket.id
                );


            if (!sender) {
                return;
            }


            if (
                globalPrivateLocked
            ) {

                socket.emit(
                    "private error",
                    "🔒 المحادثات الخاصة مقفلة"
                );

                return;
            }


            const targetName =
                cleanName(
                    data?.to ||
                    data?.name ||
                    data?.username ||
                    ""
                );


            const text =
                String(
                    data?.message ||
                    data?.text ||
                    ""
                ).trim();


            if (
                !targetName ||
                !text
            ) {
                return;
            }


            const target =
                getUserByName(
                    targetName
                );


            if (!target) {

                socket.emit(
                    "private error",
                    "❌ المستخدم غير متصل"
                );

                return;
            }


            const targetSocket =
                io.sockets.sockets.get(
                    target.socketId
                );


            if (!targetSocket) {

                socket.emit(
                    "private error",
                    "❌ المستخدم غير متصل"
                );

                return;
            }


            const privateMessage = {

                id:
                    makeId(),

                from:
                    sender.name,

                fromUsername:
                    sender.username ||
                    sender.name,

                to:
                    target.name,

                message:
                    text,

                text,

                timestamp:
                    Date.now()
            };


            targetSocket.emit(
                "private message",
                privateMessage
            );


            socket.emit(
                "private message",
                {
                    ...privateMessage,

                    self: true
                }
            );


        } catch (error) {

            console.error(
                "❌ PRIVATE MESSAGE ERROR",
                error
            );
        }
    }
);


/* =========================================================
   REQUEST ROOM USERS
   ========================================================= */

socket.on(
    "get room users",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            ).trim();


        if (!roomId) {
            return;
        }


        socket.emit(
            "room users",
            getRoomUsers(
                roomId
            )
        );
    }
);


/* =========================================================
   REQUEST PUBLIC ROOMS
   ========================================================= */

socket.on(
    "get rooms",
    () => {

        socket.emit(
            "rooms",
            getPublicRooms()
        );
    }
);


/* =========================================================
   REQUEST ONLINE USERS
   ========================================================= */

socket.on(
    "get online users",
    () => {

        socket.emit(
            "online users",
            getPublicOnlineUsers()
        );
    }
);


/* =========================================================
   SOCKET DISCONNECT
   ========================================================= */

socket.on(
    "disconnect",
    () => {

        try {

            const user =
                getUserBySocket(
                    socket.id
                );


            if (!user) {
                return;
            }


            const joinedRooms =
                Array.isArray(
                    user.roomIds
                )
                    ? [...user.roomIds]
                    : [];


            joinedRooms.forEach(
                roomId => {

                    socket.leave(
                        `room:${roomId}`
                    );


                    io.to(
                        `room:${roomId}`
                    ).emit(
                        "room users",
                        getRoomUsers(
                            roomId
                        )
                    );
                }
            );


            users =
                users.filter(
                    item =>
                        item.socketId !==
                        socket.id
                );


            emitOnlineUsers();

            emitAdminUsers();

            emitStats();


        } catch (error) {

            console.error(
                "❌ SOCKET DISCONNECT ERROR",
                error
            );
        }
    }
);

});
/* =========================================================
   SERVER START
   ========================================================= */

const PORT =
    process.env.PORT ||
    3000;


server.listen(
    PORT,
    () => {

        console.log(
            `🚀 Mersal Chat running on port ${PORT}`
        );

        console.log(
            `🔐 Global control: ${GLOBAL_CONTROL_PATH}`
        );
    }
);
      
