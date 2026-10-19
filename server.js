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

const DATA_DIR = __dirname;

app.use(express.json());

/*
|--------------------------------------------------------------------------
| STATIC FILES
|--------------------------------------------------------------------------
*/

app.use(express.static(DATA_DIR));

app.use(express.static(
    path.join(DATA_DIR, "public")
));

/*
|--------------------------------------------------------------------------
| FILE SYSTEM
|--------------------------------------------------------------------------
*/

function filePath(file) {
    return path.join(DATA_DIR, file);
}

function loadFile(file, def = []) {
    try {
        const fullPath = filePath(file);

        if (!fs.existsSync(fullPath)) {
            fs.writeFileSync(
                fullPath,
                JSON.stringify(def, null, 2)
            );

            return def;
        }

        const data = fs.readFileSync(
            fullPath,
            "utf8"
        );

        if (!data.trim()) {
            return def;
        }

        return JSON.parse(data);

    } catch (error) {
        console.error(
            "❌ loadFile error:",
            file,
            error
        );

        return def;
    }
}

function saveFile(file, data) {
    try {
        fs.writeFileSync(
            filePath(file),
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error(
            "❌ saveFile error:",
            file,
            error
        );
    }
}

/*
|--------------------------------------------------------------------------
| DATA
|--------------------------------------------------------------------------
*/

let users = [];

let admins = loadFile(
    "admins.json",
    []
);

let bannedUsers = loadFile(
    "banned.json",
    []
);

let mutedUsers = loadFile(
    "muted.json",
    []
);

let deviceBannedUsers = loadFile(
    "deviceBanned.json",
    []
);

let stars = loadFile(
    "stars.json",
    []
);

let logs = loadFile(
    "logs.json",
    []
);

/*
|--------------------------------------------------------------------------
| NEW ROOM SYSTEM
|--------------------------------------------------------------------------
*/

let rooms = loadFile(
    "rooms.json",
    []
);

let roomModeration = loadFile(
    "roomModeration.json",
    {}
);

/*
|--------------------------------------------------------------------------
| PRIVATE CHAT
|--------------------------------------------------------------------------
*/

let privateLocked = false;

/*
|--------------------------------------------------------------------------
| ROOM MESSAGES
|--------------------------------------------------------------------------
|
| محفوظة في الذاكرة أثناء تشغيل السيرفر.
|
*/

const roomMessages = new Map();

/*
|--------------------------------------------------------------------------
| DEFAULT ADMIN PERMISSIONS
|--------------------------------------------------------------------------
*/

const DEFAULT_PERMISSIONS = {
    kick: false,
    ban: false,
    unban: false,

    mute: false,
    unmute: false,

    disconnect: false,
    undisconnect: false,

    deleteMessage: false,

    viewUserInfo: false,

    stars: false,

    chatLock: false,

    privateLock: false,

    maintenance: false,

    protection: false,

    addAdmin: false,

    manageRooms: false
};

/*
|--------------------------------------------------------------------------
| NORMALIZE PERMISSIONS
|--------------------------------------------------------------------------
*/

function normalizePermissions(
    permissions = {}
) {
    return {
        ...DEFAULT_PERMISSIONS,
        ...(permissions || {})
    };
}

/*
|--------------------------------------------------------------------------
| NORMALIZE ADMINS
|--------------------------------------------------------------------------
*/

function normalizeAdmin(admin) {

    if (!admin || typeof admin !== "object") {
        return null;
    }

    admin.name = String(
        admin.name ||
        admin.username ||
        ""
    ).trim();

    admin.password = String(
        admin.password || ""
    );

    admin.permissions =
        normalizePermissions(
            admin.permissions
        );

    if (!Array.isArray(admin.rooms)) {
        admin.rooms = [];
    }

    if (
        !admin.roomPermissions ||
        typeof admin.roomPermissions !== "object"
    ) {
        admin.roomPermissions = {};
    }

    /*
    |------------------------------------------------------
    | Backward compatibility
    |------------------------------------------------------
    */

    if (
        admin.master === undefined &&
        admin.role === undefined
    ) {
        admin.master =
            admin.permissions.addAdmin === true;
    }

    return admin;
}

admins = admins
    .map(normalizeAdmin)
    .filter(Boolean);

saveFile(
    "admins.json",
    admins
);

/*
|--------------------------------------------------------------------------
| MASTER ADMIN
|--------------------------------------------------------------------------
*/

function isMaster(admin) {

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
| SAFE ADMIN DATA
|--------------------------------------------------------------------------
|
| لا نرسل كلمة السر للواجهة.
|
*/

function safeAdmin(admin) {

    if (!admin) {
        return null;
    }

    return {
        name: admin.name,

        role:
            isMaster(admin)
                ? "master"
                : (
                    admin.role ||
                    "moderator"
                ),

        master:
            isMaster(admin),

        permissions:
            normalizePermissions(
                admin.permissions
            ),

        rooms:
            Array.isArray(admin.rooms)
                ? admin.rooms
                : [],

        roomPermissions:
            admin.roomPermissions &&
            typeof admin.roomPermissions === "object"
                ? admin.roomPermissions
                : {}
    };
}

/*
|--------------------------------------------------------------------------
| ROOM NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeRoom(room) {

    if (!room || !room.id) {
        return null;
    }

    return {
        id: String(room.id),

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

rooms = rooms
    .map(normalizeRoom)
    .filter(Boolean);

/*
|--------------------------------------------------------------------------
| ROOM MODERATION
|--------------------------------------------------------------------------
*/

function ensureRoomModeration(roomId) {

    roomId = String(roomId);

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
    }

    const moderation =
        roomModeration[roomId];

    if (!Array.isArray(moderation.banned)) {
        moderation.banned = [];
    }

    if (!Array.isArray(moderation.muted)) {
        moderation.muted = [];
    }

    if (!Array.isArray(moderation.disconnected)) {
        moderation.disconnected = [];
    }

    if (!Array.isArray(moderation.stars)) {
        moderation.stars = [];
    }

    return moderation;
}

/*
|--------------------------------------------------------------------------
| INITIALIZE ROOM MODERATION
|--------------------------------------------------------------------------
*/

rooms.forEach(room => {
    ensureRoomModeration(room.id);
});

saveFile(
    "rooms.json",
    rooms
);

saveFile(
    "roomModeration.json",
    roomModeration
);

/*
|--------------------------------------------------------------------------
| ROOM HELPERS
|--------------------------------------------------------------------------
*/

function createRoomId() {

    return (
        "room-" +
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 8)
    );
}

function getRoom(roomId) {

    return rooms.find(
        room =>
            room.id === String(roomId)
    );
}

function getPublicRooms() {

    return rooms
        .filter(
            room =>
                room.enabled !== false
        )
        .map(normalizeRoom);
}

function getAdminRooms(admin) {

    if (!admin) {
        return [];
    }

    /*
    |------------------------------------------------------
    | Master sees every room
    |------------------------------------------------------
    */

    if (isMaster(admin)) {
        return rooms.map(normalizeRoom);
    }

    const assignedRooms =
        Array.isArray(admin.rooms)
            ? admin.rooms
            : [];

    return rooms
        .filter(
            room =>
                assignedRooms.includes(
                    room.id
                )
        )
        .map(normalizeRoom);
}

/*
|--------------------------------------------------------------------------
| ADMIN ROOM ACCESS
|--------------------------------------------------------------------------
*/

function adminHasRoomAccess(
    admin,
    roomId
) {

    if (!admin) {
        return false;
    }

    if (isMaster(admin)) {
        return true;
    }

    return (
        Array.isArray(admin.rooms) &&
        admin.rooms.includes(
            String(roomId)
        )
    );
}

/*
|--------------------------------------------------------------------------
| ROOM PERMISSION
|--------------------------------------------------------------------------
*/

function hasRoomPermission(
    admin,
    roomId,
    permission
) {

    if (!admin) {
        return false;
    }

    /*
    |------------------------------------------------------
    | Master
    |------------------------------------------------------
    */

    if (isMaster(admin)) {
        return true;
    }

    /*
    |------------------------------------------------------
    | Must be assigned to room
    |------------------------------------------------------
    */

    if (
        !adminHasRoomAccess(
            admin,
            roomId
        )
    ) {
        return false;
    }

    /*
    |------------------------------------------------------
    | Room-specific permission
    |------------------------------------------------------
    */

    const roomPermissions =
        admin.roomPermissions?.[
            String(roomId)
        ];

    if (
        roomPermissions &&
        Object.prototype.hasOwnProperty.call(
            roomPermissions,
            permission
        )
    ) {

        return (
            roomPermissions[permission] === true
        );
    }

    /*
    |------------------------------------------------------
    | Fallback to general permission
    |------------------------------------------------------
    */

    return (
        admin.permissions?.[
            permission
        ] === true
    );
}

/*
|--------------------------------------------------------------------------
| REQUIRE ROOM PERMISSION
|--------------------------------------------------------------------------
*/

function requireRoomPermission(
    socket,
    roomId,
    permission
) {

    if (!socket.adminData) {

        socket.emit(
            "admin action error",
            "❌ يجب تسجيل دخول الإدارة"
        );

        return false;
    }

    if (
        !hasRoomPermission(
            socket.adminData,
            roomId,
            permission
        )
    ) {

        socket.emit(
            "admin action error",
            `⛔ لا تملك صلاحية ${permission} في هذه الغرفة`
        );

        return false;
    }

    return true;
}

/*
|--------------------------------------------------------------------------
| LOG SYSTEM
|--------------------------------------------------------------------------
*/

function addLog(
    message,
    roomId = null
) {

    const log = {
        time:
            new Date().toLocaleString(),

        message:
            String(message),

        roomId:
            roomId || null
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

    console.log(
        log.message
    );
}

/*
|--------------------------------------------------------------------------
| USER HELPERS
|--------------------------------------------------------------------------
*/

function getUserById(id) {

    return users.find(
        user =>
            user.id === id
    );
}

function getUserByName(name) {

    if (!name) {
        return null;
    }

    const target =
        String(name).toLowerCase();

    return users.find(
        user =>
            user.username
                .toLowerCase() ===
            target
    );
}

function getSocketByUserId(id) {

    return io.sockets.sockets.get(id);
}

/*
|--------------------------------------------------------------------------
| ROLE
|--------------------------------------------------------------------------
*/

function getRolePrefix(socket) {

    if (!socket?.adminData) {
        return "";
    }

    return isMaster(
        socket.adminData
    )
        ? "&"
        : "@";
}

/*
|--------------------------------------------------------------------------
| RESERVED USERNAMES
|--------------------------------------------------------------------------
*/

function isReservedUsername(
    username
) {

    /*
    |------------------------------------------------------
    | & and @ are reserved for administration.
    |------------------------------------------------------
    */

    return /[&@]/.test(
        String(username || "")
    );
}

/*
|--------------------------------------------------------------------------
| ROOM USERS
|--------------------------------------------------------------------------
*/

function getRoomUsers(roomId) {

    return users
        .filter(user => {

            const targetSocket =
                getSocketByUserId(
                    user.id
                );

            return (
                targetSocket &&
                targetSocket.openRooms &&
                targetSocket.openRooms.has(
                    String(roomId)
                )
            );
        })
        .map(user => {

            const targetSocket =
                getSocketByUserId(
                    user.id
                );

            return {
                id: user.id,

                username:
                    user.username,

                color:
                    user.color,

                rolePrefix:
                    getRolePrefix(
                        targetSocket
                    ),

                isAdmin:
                    !!targetSocket?.adminData
            };
        });
}

/*
|--------------------------------------------------------------------------
| EMIT ROOM USERS
|--------------------------------------------------------------------------
*/

function emitRoomUsers(
    roomId
) {

    const roomUsers =
        getRoomUsers(roomId);

    io.to(
        String(roomId)
    ).emit(
        "room users",
        {
            roomId:
                String(roomId),

            users:
                roomUsers
        }
    );

    /*
    |------------------------------------------------------
    | Backward compatibility
    |------------------------------------------------------
    */

    io.to(
        String(roomId)
    ).emit(
        "online users",
        roomUsers
    );
}

/*
|--------------------------------------------------------------------------
| ROOM NOTICE
|--------------------------------------------------------------------------
*/

function roomNotice(
    roomId,
    message
) {

    io.to(
        String(roomId)
    ).emit(
        "room notice",
        {
            roomId:
                String(roomId),

            message:
                String(message),

            timestamp:
                Date.now()
        }
    );
}

/*
|--------------------------------------------------------------------------
| REMOVE USER FROM ROOM
|--------------------------------------------------------------------------
*/

function removeUserFromRoom(
    socket,
    roomId
) {

    if (!socket.openRooms) {
        return;
    }

    roomId =
        String(roomId);

    socket.leave(
        roomId
    );

    socket.openRooms.delete(
        roomId
    );

    if (
        socket.currentRoomId ===
        roomId
    ) {

        socket.currentRoomId =
            Array.from(
                socket.openRooms
            )[0] || null;
    }

    emitRoomUsers(
        roomId
    );
}

/*
|--------------------------------------------------------------------------
| MODERATION SEARCH
|--------------------------------------------------------------------------
*/

function findModerationUser(
    list,
    username
) {

    return list.find(
        item =>
            String(
                item.username || ""
            ).toLowerCase() ===
            String(
                username || ""
            ).toLowerCase()
    );
}

/*
|--------------------------------------------------------------------------
| END OF PART 1
|--------------------------------------------------------------------------
*/
/*
|--------------------------------------------------------------------------
| PART 2/3
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/

io.on("connection", socket => {

    console.log(
        "🟢 Socket connected:",
        socket.id
    );

    /*
    |--------------------------------------------------------------------------
    | SOCKET STATE
    |--------------------------------------------------------------------------
    */

    socket.userData = null;

    socket.adminData = null;

    socket.openRooms =
        new Set();

    socket.currentRoomId =
        null;

    /*
    |--------------------------------------------------------------------------
    | CHECK ADMIN
    |--------------------------------------------------------------------------
    */

    socket.on(
        "check admin",
        data => {

            const name =
                String(
                    data?.name || ""
                ).trim();

            const admin =
                admins.find(
                    a =>
                        a.name.toLowerCase() ===
                        name.toLowerCase()
                );

            socket.emit(
                "admin status",
                {
                    isAdmin:
                        !!admin,

                    admin:
                        admin
                            ? safeAdmin(admin)
                            : null
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | LOGIN
    |--------------------------------------------------------------------------
    */

    socket.on(
        "join",
        data => {

            const username =
                String(
                    data?.username ||
                    data?.name ||
                    ""
                ).trim();

            const password =
                String(
                    data?.password ||
                    ""
                );

            const device =
                String(
                    data?.device ||
                    socket.handshake.headers[
                        "user-agent"
                    ] ||
                    ""
                );

            const ip =
                String(
                    socket.handshake.address ||
                    ""
                );

            /*
            |--------------------------------------------------------------
            | USERNAME VALIDATION
            |--------------------------------------------------------------
            */

            if (
                !username ||
                username.length < 2
            ) {

                socket.emit(
                    "login failed",
                    "❌ أدخل اسم مستخدم صحيح"
                );

                return;
            }

            if (
                username.length > 30
            ) {

                socket.emit(
                    "login failed",
                    "❌ اسم المستخدم طويل جدًا"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | RESERVED ADMIN SYMBOLS
            |--------------------------------------------------------------
            */

            if (
                isReservedUsername(
                    username
                )
            ) {

                socket.emit(
                    "login failed",
                    "❌ الرموز @ و & محجوزة للإدارة"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | DUPLICATE USERNAME
            |--------------------------------------------------------------
            */

            const duplicate =
                users.find(
                    user =>
                        user.username
                            .toLowerCase() ===
                        username.toLowerCase()
                );

            if (duplicate) {

                socket.emit(
                    "login failed",
                    "❌ اسم المستخدم مستخدم بالفعل"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | ADMIN LOGIN
            |--------------------------------------------------------------
            */

            const admin =
                admins.find(
                    a =>
                        a.name.toLowerCase() ===
                        username.toLowerCase()
                );

            if (admin) {

                if (
                    admin.password &&
                    admin.password !==
                    password
                ) {

                    socket.emit(
                        "login failed",
                        "❌ كلمة مرور الإدارة غير صحيحة"
                    );

                    return;
                }

                socket.adminData =
                    normalizeAdmin(
                        admin
                    );
            }

            /*
            |--------------------------------------------------------------
            | DEVICE BAN
            |--------------------------------------------------------------
            */

            const deviceBan =
                deviceBannedUsers.find(
                    item => {

                        if (
                            typeof item ===
                            "string"
                        ) {
                            return (
                                item === device
                            );
                        }

                        return (
                            item.device ===
                            device
                        );
                    }
                );

            if (deviceBan) {

                socket.emit(
                    "login failed",
                    "🚫 هذا الجهاز محظور"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | LEGACY GLOBAL IP BAN
            |--------------------------------------------------------------
            */

            const globalBan =
                bannedUsers.find(
                    item => {

                        if (
                            typeof item ===
                            "string"
                        ) {
                            return (
                                item === ip ||
                                item.toLowerCase() ===
                                username.toLowerCase()
                            );
                        }

                        return (
                            item.ip === ip ||
                            String(
                                item.username || ""
                            ).toLowerCase() ===
                            username.toLowerCase()
                        );
                    }
                );

            if (globalBan) {

                socket.emit(
                    "login failed",
                    "🚫 أنت محظور من الدخول"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | CREATE USER
            |--------------------------------------------------------------
            */

            const user = {

                id:
                    socket.id,

                username:
                    username,

                ip:
                    ip,

                device:
                    device,

                color:
                    data?.color ||
                    "#ffffff",

                joinedAt:
                    Date.now()
            };

            users.push(
                user
            );

            socket.userData =
                user;

            /*
            |--------------------------------------------------------------
            | ROLE
            |--------------------------------------------------------------
            */

            const rolePrefix =
                getRolePrefix(
                    socket
                );

            /*
            |--------------------------------------------------------------
            | LOGIN SUCCESS
            |--------------------------------------------------------------
            */

            socket.emit(
                "login success",
                {
                    id:
                        user.id,

                    username:
                        user.username,

                    rolePrefix:
                        rolePrefix,

                    isAdmin:
                        !!socket.adminData,

                    admin:
                        socket.adminData
                            ? safeAdmin(
                                socket.adminData
                            )
                            : null,

                    rooms:
                        getPublicRooms()
                }
            );

            /*
            |--------------------------------------------------------------
            | PUBLIC ONLINE USERS
            |--------------------------------------------------------------
            */

            io.emit(
                "online users",
                users.map(
                    item => {

                        const targetSocket =
                            getSocketByUserId(
                                item.id
                            );

                        return {
                            id:
                                item.id,

                            username:
                                item.username,

                            color:
                                item.color,

                            rolePrefix:
                                getRolePrefix(
                                    targetSocket
                                ),

                            isAdmin:
                                !!targetSocket?.adminData
                        };
                    }
                )
            );

            /*
            |--------------------------------------------------------------
            | ADMIN NOTICE
            |--------------------------------------------------------------
            */

            if (
                socket.adminData
            ) {

                const adminName =
                    socket.adminData.name;

                const assignedRooms =
                    getAdminRooms(
                        socket.adminData
                    );

                assignedRooms.forEach(
                    room => {

                        roomNotice(
                            room.id,
                            `✨ تم توكيل ${adminName}`
                        );
                    }
                );
            }

            addLog(
                `🟢 دخول ${username}`
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | GET ROOMS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get rooms",
        () => {

            socket.emit(
                "rooms list",
                getPublicRooms()
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | JOIN ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "join room",
        data => {

            if (!socket.userData) {

                socket.emit(
                    "room error",
                    "❌ يجب تسجيل الدخول أولاً"
                );

                return;
            }

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
                    "❌ هذه الغرفة غير مفعلة"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | MAX 3 PUBLIC ROOMS
            |--------------------------------------------------------------
            */

            if (
                !socket.openRooms
                    .has(roomId) &&
                socket.openRooms.size >= 3
            ) {

                socket.emit(
                    "room error",
                    "⚠️ يمكنك فتح 3 غرف كحد أقصى"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | ROOM BAN
            |--------------------------------------------------------------
            */

            const moderation =
                ensureRoomModeration(
                    roomId
                );

            const banned =
                findModerationUser(
                    moderation.banned,
                    socket.userData.username
                );

            if (banned) {

                socket.emit(
                    "room error",
                    "🚫 أنت محظور من هذه الغرفة"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | ROOM DISCONNECT
            |--------------------------------------------------------------
            */

            const disconnected =
                findModerationUser(
                    moderation.disconnected,
                    socket.userData.username
                );

            if (
                disconnected &&
                (
                    !disconnected.device ||
                    disconnected.device ===
                    socket.userData.device
                )
            ) {

                socket.emit(
                    "room error",
                    "⛔ أنت مفصول من هذه الغرفة"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | JOIN SOCKET.IO ROOM
            |--------------------------------------------------------------
            */

            socket.join(
                roomId
            );

            socket.openRooms.add(
                roomId
            );

            socket.currentRoomId =
                roomId;

            /*
            |--------------------------------------------------------------
            | INITIAL MESSAGES
            |--------------------------------------------------------------
            */

            if (
                !roomMessages.has(
                    roomId
                )
            ) {

                roomMessages.set(
                    roomId,
                    []
                );
            }

            socket.emit(
                "room joined",
                {
                    room:
                        room,

                    messages:
                        roomMessages.get(
                            roomId
                        ),

                    moderation:
                        {
                            muted:
                                !!findModerationUser(
                                    moderation.muted,
                                    socket.userData.username
                                ),

                            starred:
                                moderation.stars
                                    .includes(
                                        socket.userData.username
                                    )
                        }
                }
            );

            /*
            |--------------------------------------------------------------
            | ROOM NOTICE FOR ADMIN
            |--------------------------------------------------------------
            */

            if (
                socket.adminData &&
                adminHasRoomAccess(
                    socket.adminData,
                    roomId
                )
            ) {

                socket.emit(
                    "room notice",
                    {
                        roomId:
                            roomId,

                        message:
                            `✨ تم توكيل ${socket.adminData.name}`
                    }
                );
            }

            emitRoomUsers(
                roomId
            );

            addLog(
                `🚪 ${socket.userData.username} دخل غرفة ${room.name}`,
                roomId
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | LEAVE ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "leave room",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    socket.currentRoomId ||
                    ""
                );

            if (!roomId) {
                return;
            }

            removeUserFromRoom(
                socket,
                roomId
            );

            socket.emit(
                "room left",
                {
                    roomId:
                        roomId
                }
            );

            const room =
                getRoom(
                    roomId
                );

            if (room) {

                addLog(
                    `🚪 ${socket.userData?.username || "User"} غادر غرفة ${room.name}`,
                    roomId
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | SWITCH ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "switch room",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    ""
                );

            if (!roomId) {
                return;
            }

            if (
                !socket.openRooms.has(
                    roomId
                )
            ) {

                socket.emit(
                    "room error",
                    "❌ الغرفة ليست مفتوحة"
                );

                return;
            }

            socket.currentRoomId =
                roomId;

            socket.emit(
                "room switched",
                {
                    roomId:
                        roomId
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | CHAT MESSAGE
    |--------------------------------------------------------------------------
    */

    socket.on(
        "chat message",
        data => {

            if (!socket.userData) {
                return;
            }

            const roomId =
                String(
                    data?.roomId ||
                    socket.currentRoomId ||
                    ""
                );

            if (!roomId) {

                socket.emit(
                    "chat error",
                    "❌ اختر غرفة أولاً"
                );

                return;
            }

            if (
                !socket.openRooms.has(
                    roomId
                )
            ) {

                socket.emit(
                    "chat error",
                    "❌ لم تدخل هذه الغرفة"
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

            /*
            |--------------------------------------------------------------
            | CHAT LOCK
            |--------------------------------------------------------------
            */

            if (
                room.settings.chatLocked &&
                !hasRoomPermission(
                    socket.adminData,
                    roomId,
                    "chatLock"
                )
            ) {

                socket.emit(
                    "chat error",
                    "🔒 الدردشة مقفلة حالياً"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | MAINTENANCE
            |--------------------------------------------------------------
            */

            if (
                room.settings.maintenance &&
                !socket.adminData
            ) {

                socket.emit(
                    "chat error",
                    "🛠️ الغرفة تحت الصيانة حالياً"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | MUTED
            |--------------------------------------------------------------
            */

            const moderation =
                ensureRoomModeration(
                    roomId
                );

            const muted =
                findModerationUser(
                    moderation.muted,
                    socket.userData.username
                );

            if (
                muted &&
                !socket.adminData
            ) {

                socket.emit(
                    "chat error",
                    "🔇 أنت مكتوم في هذه الغرفة"
                );

                return;
            }

            /*
            |--------------------------------------------------------------
            | MESSAGE
            |--------------------------------------------------------------
            */

            const messageText =
                String(
                    data?.message ||
                    ""
                ).trim();

            if (!messageText) {
                return;
            }

            if (
                messageText.length > 2000
            ) {

                socket.emit(
                    "chat error",
                    "❌ الرسالة طويلة جداً"
                );

                return;
            }

            const message = {

                id:
                    "msg-" +
                    Date.now().toString(36) +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8),

                roomId:
                    roomId,

                username:
                    socket.userData.username,

                rolePrefix:
                    getRolePrefix(
                        socket
                    ),

                message:
                    messageText,

                reply:
                    data?.reply || null,

                timestamp:
                    Date.now()
            };

            /*
            |--------------------------------------------------------------
            | STORE
            |--------------------------------------------------------------
            */

            if (
                !roomMessages.has(
                    roomId
                )
            ) {

                roomMessages.set(
                    roomId,
                    []
                );
            }

            const messages =
                roomMessages.get(
                    roomId
                );

            messages.push(
                message
            );

            if (
                messages.length > 500
            ) {

                messages.splice(
                    0,
                    messages.length - 500
                );
            }

            /*
            |--------------------------------------------------------------
            | BROADCAST
            |--------------------------------------------------------------
            */

            io.to(
                roomId
            ).emit(
                "chat message",
                message
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | PRIVATE MESSAGE
    |--------------------------------------------------------------------------
    */

    socket.on(
        "private message",
        data => {

            if (!socket.userData) {
                return;
            }

            if (
                privateLocked &&
                !socket.adminData
            ) {

                socket.emit(
                    "private error",
                    "🔒 المحادثات الخاصة مقفلة حالياً"
                );

                return;
            }

            const to =
                String(
                    data?.to ||
                    data?.username ||
                    ""
                ).trim();

            const messageText =
                String(
                    data?.message ||
                    ""
                ).trim();

            if (
                !to ||
                !messageText
            ) {
                return;
            }

            const target =
                getUserByName(
                    to
                );

            if (!target) {

                socket.emit(
                    "private error",
                    "❌ المستخدم غير متصل"
                );

                return;
            }

            const targetSocket =
                getSocketByUserId(
                    target.id
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
                    "pm-" +
                    Date.now().toString(36) +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8),

                from:
                    socket.userData.username,

                to:
                    target.username,

                message:
                    messageText,

                timestamp:
                    Date.now()
            };

            /*
            |--------------------------------------------------------------
            | RECEIVER
            |--------------------------------------------------------------
            */

            targetSocket.emit(
                "private message",
                privateMessage
            );

            /*
            |--------------------------------------------------------------
            | SENDER
            |--------------------------------------------------------------
            */

            socket.emit(
                "private message",
                privateMessage
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | PRIVATE LOCK
    |--------------------------------------------------------------------------
    */

    socket.on(
        "toggle private lock",
        () => {

            if (
                !socket.adminData ||
                !socket.adminData.permissions
                    ?.privateLock
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ لا تملك صلاحية قفل الخاص"
                );

                return;
            }

            privateLocked =
                !privateLocked;

            addLog(
                `🔒 الخاص ${privateLocked ? "مقفل" : "مفتوح"}`
            );

            io.emit(
                "private lock changed",
                {
                    locked:
                        privateLocked
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | ADMIN PANEL LOGIN
    |--------------------------------------------------------------------------
    |
    | ندعم الاسمين:
    | admin panel login
    | admin.panel login
    |
    | حتى لا تتكرر مشكلة تعليق صفحة الإدارة.
    |--------------------------------------------------------------------------
    */

    const adminPanelLogin =
        data => {

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
                    a =>
                        a.name.toLowerCase() ===
                        name.toLowerCase() &&
                        String(
                            a.password
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
                normalizeAdmin(
                    admin
                );

            socket.emit(
                "admin login success",
                {
                    admin:
                        safeAdmin(
                            socket.adminData
                        ),

                    permissions:
                        normalizePermissions(
                            socket.adminData
                                .permissions
                        ),

                    rooms:
                        getAdminRooms(
                            socket.adminData
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

            addLog(
                `🔐 دخول لوحة الإدارة: ${admin.name}`
            );
        };

    socket.on(
        "admin panel login",
        adminPanelLogin
    );

    socket.on(
        "admin.panel login",
        adminPanelLogin
    );

    /*
    |--------------------------------------------------------------------------
    | GET ADMIN ROOMS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get admin rooms",
        () => {

            if (!socket.adminData) {
                return;
            }

            socket.emit(
                "admin rooms",
                getAdminRooms(
                    socket.adminData
                )
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | GET ONLINE USERS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get online users",
        () => {

            if (!socket.adminData) {
                return;
            }

            socket.emit(
                "admin online users",
                users
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | GET STATS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get stats",
        () => {

            if (!socket.adminData) {
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

    /*
    |--------------------------------------------------------------------------
    | GET LOGS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get logs",
        () => {

            if (!socket.adminData) {
                return;
            }

            socket.emit(
                "admin logs",
                logs
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | GET ADMINS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get admins",
        () => {

            if (!socket.adminData) {
                return;
            }

            if (
                !isMaster(
                    socket.adminData
                ) &&
                !socket.adminData.permissions
                    ?.addAdmin
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ لا تملك صلاحية إدارة المشرفين"
                );

                return;
            }

            socket.emit(
                "admins list",
                admins.map(
                    safeAdmin
                )
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | GET ADMIN PERMISSIONS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "get admin permissions",
        data => {

            if (!socket.adminData) {
                return;
            }

            const targetName =
                String(
                    data?.username ||
                    data?.name ||
                    ""
                );

            const target =
                admins.find(
                    a =>
                        a.name.toLowerCase() ===
                        targetName.toLowerCase()
                );

            if (!target) {

                socket.emit(
                    "admin action error",
                    "❌ المشرف غير موجود"
                );

                return;
            }

            if (
                !isMaster(
                    socket.adminData
                ) &&
                !socket.adminData.permissions
                    ?.addAdmin
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ لا تملك الصلاحية"
                );

                return;
            }

            socket.emit(
                "admin permissions",
                {
                    username:
                        target.name,

                    permissions:
                        normalizePermissions(
                            target.permissions
                        ),

                    rooms:
                        target.rooms || [],

                    roomPermissions:
                        target.roomPermissions || {}
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | VIEW USER INFO
    |--------------------------------------------------------------------------
    */

    socket.on(
        "view user",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    ""
                );

            if (
                !requireRoomPermission(
                    socket,
                    roomId,
                    "viewUserInfo"
                )
            ) {
                return;
            }

            const target =
                getUserByName(
                    data?.username
                );

            if (!target) {

                socket.emit(
                    "admin action error",
                    "❌ المستخدم غير موجود"
                );

                return;
            }

            socket.emit(
                "user info",
                {
                    id:
                        target.id,

                    username:
                        target.username,

                    ip:
                        target.ip,

                    device:
                        target.device,

                    color:
                        target.color,

                    joinedAt:
                        target.joinedAt,

                    roomId:
                        roomId
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | CREATE ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "create room",
        data => {

            if (
                !socket.adminData ||
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ إنشاء الغرف متاح للمدير الرئيسي فقط"
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
                    "❌ أدخل اسم الغرفة"
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
                    "❌ توجد غرفة بهذا الاسم"
                );

                return;
            }

            const room = {

                id:
                    createRoomId(),

                name:
                    name,

                description:
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
                        false
                }
            };

            rooms.push(
                room
            );

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

            addLog(
                `🏠 إنشاء غرفة: ${room.name}`
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "create room",

                    room:
                        room
                }
            );

            io.emit(
                "rooms list",
                getPublicRooms()
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | UPDATE ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "update room",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    ""
                );

            if (
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ تعديل الغرف متاح للمدير الرئيسي فقط"
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

            if (
                data.name !== undefined
            ) {

                const newName =
                    String(
                        data.name
                    ).trim();

                if (newName) {
                    room.name =
                        newName;
                }
            }

            if (
                data.description !== undefined
            ) {

                room.description =
                    String(
                        data.description
                    ).trim();
            }

            saveFile(
                "rooms.json",
                rooms
            );

            addLog(
                `✏️ تعديل الغرفة: ${room.name}`,
                roomId
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "update room",

                    room:
                        room
                }
            );

            io.emit(
                "rooms list",
                getPublicRooms()
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | TOGGLE ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "toggle room",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    ""
                );

            if (
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ لا تملك صلاحية إدارة الغرف"
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
                !room.enabled;

            saveFile(
                "rooms.json",
                rooms
            );

            addLog(
                `🔄 غرفة ${room.name}: ${room.enabled ? "مفعلة" : "متوقفة"}`,
                roomId
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "toggle room",

                    room:
                        room
                }
            );

            io.emit(
                "rooms list",
                getPublicRooms()
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | DELETE ROOM
    |--------------------------------------------------------------------------
    */

    socket.on(
        "delete room",
        data => {

            const roomId =
                String(
                    data?.roomId ||
                    ""
                );

            if (
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ حذف الغرف متاح للمدير الرئيسي فقط"
                );

                return;
            }

            const index =
                rooms.findIndex(
                    room =>
                        room.id ===
                        roomId
                );

            if (index === -1) {
                return;
            }

            const room =
                rooms[index];

            rooms.splice(
                index,
                1
            );

            delete roomModeration[
                roomId
            ];

            roomMessages.delete(
                roomId
            );

            /*
            |--------------------------------------------------------------
            | Force users out
            |--------------------------------------------------------------
            */

            for (
                const client
                of io.sockets.sockets.values()
            ) {

                if (
                    client.openRooms &&
                    client.openRooms.has(
                        roomId
                    )
                ) {

                    removeUserFromRoom(
                        client,
                        roomId
                    );

                    client.emit(
                        "room deleted",
                        {
                            roomId:
                                roomId
                        }
                    );
                }
            }

            saveFile(
                "rooms.json",
                rooms
            );

            saveFile(
                "roomModeration.json",
                roomModeration
            );

            addLog(
                `🗑️ حذف الغرفة: ${room.name}`,
                roomId
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "delete room",

                    roomId:
                        roomId
                }
            );

            io.emit(
                "rooms list",
                getPublicRooms()
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | UPDATE ADMIN ROOMS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "update admin rooms",
        data => {

            if (
                !socket.adminData ||
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ المدير الرئيسي فقط يستطيع تعيين الغرف"
                );

                return;
            }

            const username =
                String(
                    data?.username ||
                    ""
                ).trim();

            const target =
                admins.find(
                    admin =>
                        admin.name.toLowerCase() ===
                        username.toLowerCase()
                );

            if (!target) {

                socket.emit(
                    "admin action error",
                    "❌ المشرف غير موجود"
                );

                return;
            }

            const assignedRooms =
                Array.isArray(
                    data?.rooms
                )
                    ? data.rooms
                        .map(String)
                        .filter(
                            roomId =>
                                !!getRoom(
                                    roomId
                                )
                        )
                    : [];

            target.rooms =
                [
                    ...new Set(
                        assignedRooms
                    )
                ];

            saveFile(
                "admins.json",
                admins
            );

            addLog(
                `👤 تحديث غرف المشرف ${target.name}`
            );

            socket.emit(
                "admin room assignment",
                {
                    username:
                        target.name,

                    rooms:
                        target.rooms
                }
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "update admin rooms"
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | UPDATE ADMIN PERMISSIONS
    |--------------------------------------------------------------------------
    */

    socket.on(
        "update admin permissions",
        data => {

            if (
                !socket.adminData ||
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ المدير الرئيسي فقط يستطيع تعديل الصلاحيات"
                );

                return;
            }

            const username =
                String(
                    data?.username ||
                    ""
                ).trim();

            const target =
                admins.find(
                    admin =>
                        admin.name.toLowerCase() ===
                        username.toLowerCase()
                );

            if (!target) {

                socket.emit(
                    "admin action error",
                    "❌ المشرف غير موجود"
                );

                return;
            }

            target.permissions =
                normalizePermissions(
                    data?.permissions
                );

            if (
                data?.roomPermissions &&
                typeof data.roomPermissions ===
                "object"
            ) {

                target.roomPermissions =
                    data.roomPermissions;
            }

            saveFile(
                "admins.json",
                admins
            );

            addLog(
                `🔐 تحديث صلاحيات ${target.name}`
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "update admin permissions"
                }
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | ADD ADMIN
    |--------------------------------------------------------------------------
    */

    socket.on(
        "add admin",
        data => {

            if (
                !socket.adminData ||
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ المدير الرئيسي فقط يستطيع إضافة مشرف"
                );

                return;
            }

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

            if (
                !name ||
                !password
            ) {

                socket.emit(
                    "admin action error",
                    "❌ الاسم وكلمة المرور مطلوبان"
                );

                return;
            }

            if (
                isReservedUsername(
                    name
                )
            ) {

                socket.emit(
                    "admin action error",
                    "❌ لا تستخدم @ أو & في اسم المشرف"
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
                    "admin action error",
                    "❌ المشرف موجود بالفعل"
                );

                return;
            }

            const newAdmin = {

                name:
                    name,

                password:
                    password,

                role:
                    "moderator",

                master:
                    false,

                permissions:
                    normalizePermissions(
                        data?.permissions
                    ),

                rooms:
                    Array.isArray(
                        data?.rooms
                    )
                        ? data.rooms
                        : [],

                roomPermissions:
                    data?.roomPermissions &&
                    typeof data.roomPermissions ===
                    "object"
                        ? data.roomPermissions
                        : {}
            };

            admins.push(
                newAdmin
            );

            saveFile(
                "admins.json",
                admins
            );

            addLog(
                `👤 إضافة مشرف: ${name}`
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "add admin",

                    admin:
                        safeAdmin(
                            newAdmin
                        )
                }
            );

            io.emit(
                "admins list",
                admins.map(
                    safeAdmin
                )
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | REMOVE ADMIN
    |--------------------------------------------------------------------------
    */

    socket.on(
        "remove admin",
        data => {

            if (
                !socket.adminData ||
                !isMaster(
                    socket.adminData
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ المدير الرئيسي فقط يستطيع حذف المشرف"
                );

                return;
            }

            const name =
                String(
                    data?.name ||
                    data?.username ||
                    ""
                ).trim();

            const index =
                admins.findIndex(
                    admin =>
                        admin.name.toLowerCase() ===
                        name.toLowerCase()
                );

            if (
                index === -1
            ) {

                socket.emit(
                    "admin action error",
                    "❌ المشرف غير موجود"
                );

                return;
            }

            const removed =
                admins[index];

            if (
                isMaster(
                    removed
                )
            ) {

                socket.emit(
                    "admin action error",
                    "⛔ لا يمكن حذف المدير الرئيسي"
                );

                return;
            }

            admins.splice(
                index,
                1
            );

            saveFile(
                "admins.json",
                admins
            );

            addLog(
                `🗑️ حذف المشرف: ${removed.name}`
            );

            socket.emit(
                "admin action success",
                {
                    action:
                        "remove admin"
                }
            );

            io.emit(
                "admins list",
                admins.map(
                    safeAdmin
                )
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | END OF PART 2
    |--------------------------------------------------------------------------
    */
  /*
|--------------------------------------------------------------------------
| PART 3/3
|--------------------------------------------------------------------------
| ROOM MODERATION
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| MODERATION HELPER
|--------------------------------------------------------------------------
*/

function getTargetUser(data) {

    const username =
        String(
            data?.username ||
            data?.name ||
            ""
        ).trim();

    if (!username) {
        return null;
    }

    return getUserByName(
        username
    );
}

/*
|--------------------------------------------------------------------------
| KICK USER FROM ROOM
|--------------------------------------------------------------------------
*/

socket.on(
    "kick user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "kick"
            )
        ) {
            return;
        }

        const target =
            getTargetUser(
                data
            );

        if (!target) {

            socket.emit(
                "admin action error",
                "❌ المستخدم غير موجود"
            );

            return;
        }

        const targetSocket =
            getSocketByUserId(
                target.id
            );

        if (!targetSocket) {
            return;
        }

        removeUserFromRoom(
            targetSocket,
            roomId
        );

        const room =
            getRoom(
                roomId
            );

        roomNotice(
            roomId,
            `👢 تم طرد ${target.username} من الغرفة`
        );

        targetSocket.emit(
            "room kicked",
            {
                roomId:
                    roomId,

                message:
                    `👢 تم طردك من غرفة ${room?.name || ""}`
            }
        );

        addLog(
            `👢 ${socket.adminData.name} طرد ${target.username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| BAN USER FROM ROOM
|--------------------------------------------------------------------------
*/

socket.on(
    "ban user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "ban"
            )
        ) {
            return;
        }

        const target =
            getTargetUser(
                data
            );

        if (!target) {

            socket.emit(
                "admin action error",
                "❌ المستخدم غير موجود"
            );

            return;
        }

        const moderation =
            ensureRoomModeration(
                roomId
            );

        const exists =
            findModerationUser(
                moderation.banned,
                target.username
            );

        if (!exists) {

            moderation.banned.push({
                username:
                    target.username,

                ip:
                    target.ip,

                createdAt:
                    Date.now()
            });
        }

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        const targetSocket =
            getSocketByUserId(
                target.id
            );

        if (targetSocket) {

            removeUserFromRoom(
                targetSocket,
                roomId
            );

            targetSocket.emit(
                "room banned",
                {
                    roomId:
                        roomId,

                    message:
                        "🚫 تم حظرك من هذه الغرفة"
                }
            );
        }

        roomNotice(
            roomId,
            `🚫 تم حظر ${target.username} من الغرفة`
        );

        addLog(
            `🚫 ${socket.adminData.name} حظر ${target.username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| UNBAN USER
|--------------------------------------------------------------------------
*/

socket.on(
    "unban user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "unban"
            )
        ) {
            return;
        }

        const username =
            String(
                data?.username ||
                ""
            ).trim();

        const moderation =
            ensureRoomModeration(
                roomId
            );

        const index =
            moderation.banned.findIndex(
                item =>
                    String(
                        item.username ||
                        ""
                    ).toLowerCase() ===
                    username.toLowerCase()
            );

        if (
            index === -1
        ) {

            socket.emit(
                "admin action error",
                "❌ المستخدم غير موجود في قائمة الحظر"
            );

            return;
        }

        moderation.banned.splice(
            index,
            1
        );

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `🔓 تم فك حظر ${username}`
        );

        addLog(
            `🔓 ${socket.adminData.name} فك حظر ${username}`,
            roomId
        );

        socket.emit(
            "admin action success",
            {
                action:
                    "unban user",

                username:
                    username,

                roomId:
                    roomId
            }
        );
    }
);

/*
|--------------------------------------------------------------------------
| MUTE USER
|--------------------------------------------------------------------------
*/

socket.on(
    "mute user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "mute"
            )
        ) {
            return;
        }

        const target =
            getTargetUser(
                data
            );

        const username =
            target
                ? target.username
                : String(
                    data?.username ||
                    ""
                ).trim();

        if (!username) {

            socket.emit(
                "admin action error",
                "❌ اسم المستخدم مطلوب"
            );

            return;
        }

        const moderation =
            ensureRoomModeration(
                roomId
            );

        if (
            !findModerationUser(
                moderation.muted,
                username
            )
        ) {

            moderation.muted.push({
                username:
                    username,

                createdAt:
                    Date.now()
            });
        }

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `🔇 تم كتم ${username}`
        );

        addLog(
            `🔇 ${socket.adminData.name} كتم ${username}`,
            roomId
        );

        const targetSocket =
            target
                ? getSocketByUserId(
                    target.id
                )
                : null;

        if (targetSocket) {

            targetSocket.emit(
                "room muted",
                {
                    roomId:
                        roomId
                }
            );
        }
    }
);

/*
|--------------------------------------------------------------------------
| UNMUTE USER
|--------------------------------------------------------------------------
*/

socket.on(
    "unmute user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "unmute"
            )
        ) {
            return;
        }

        const username =
            String(
                data?.username ||
                ""
            ).trim();

        const moderation =
            ensureRoomModeration(
                roomId
            );

        moderation.muted =
            moderation.muted.filter(
                item =>
                    String(
                        item.username ||
                        ""
                    ).toLowerCase() !==
                    username.toLowerCase()
            );

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `🔊 تم فك كتم ${username}`
        );

        addLog(
            `🔊 ${socket.adminData.name} فك كتم ${username}`,
            roomId
        );

        socket.emit(
            "admin action success",
            {
                action:
                    "unmute user",

                username:
                    username,

                roomId:
                    roomId
            }
        );
    }
);

/*
|--------------------------------------------------------------------------
| DISCONNECT USER
|--------------------------------------------------------------------------
*/

socket.on(
    "disconnect user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "disconnect"
            )
        ) {
            return;
        }

        const target =
            getTargetUser(
                data
            );

        if (!target) {

            socket.emit(
                "admin action error",
                "❌ المستخدم غير موجود"
            );

            return;
        }

        const targetSocket =
            getSocketByUserId(
                target.id
            );

        const moderation =
            ensureRoomModeration(
                roomId
            );

        const exists =
            findModerationUser(
                moderation.disconnected,
                target.username
            );

        if (!exists) {

            moderation.disconnected.push({

                username:
                    target.username,

                device:
                    target.device,

                ip:
                    target.ip,

                createdAt:
                    Date.now()
            });
        }

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        if (targetSocket) {

            removeUserFromRoom(
                targetSocket,
                roomId
            );

            targetSocket.emit(
                "room disconnected",
                {
                    roomId:
                        roomId,

                    message:
                        "⛔ تم فصلك من هذه الغرفة"
                }
            );
        }

        roomNotice(
            roomId,
            `⛔ تم فصل ${target.username} من الغرفة`
        );

        addLog(
            `⛔ ${socket.adminData.name} فصل ${target.username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| UNDISCONNECT USER
|--------------------------------------------------------------------------
*/

socket.on(
    "undisconnect user",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "undisconnect"
            )
        ) {
            return;
        }

        const username =
            String(
                data?.username ||
                ""
            ).trim();

        const moderation =
            ensureRoomModeration(
                roomId
            );

        moderation.disconnected =
            moderation.disconnected.filter(
                item =>
                    String(
                        item.username ||
                        ""
                    ).toLowerCase() !==
                    username.toLowerCase()
            );

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `🔓 تم إلغاء فصل ${username}`
        );

        addLog(
            `🔓 ${socket.adminData.name} ألغى فصل ${username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| GIVE STAR
|--------------------------------------------------------------------------
*/

socket.on(
    "give star",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "stars"
            )
        ) {
            return;
        }

        const target =
            getTargetUser(
                data
            );

        const username =
            target
                ? target.username
                : String(
                    data?.username ||
                    ""
                ).trim();

        if (!username) {
            return;
        }

        const moderation =
            ensureRoomModeration(
                roomId
            );

        if (
            !moderation.stars.includes(
                username
            )
        ) {

            moderation.stars.push(
                username
            );
        }

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `⭐ تم منح النجمة لـ ${username}`
        );

        io.to(
            roomId
        ).emit(
            "star changed",
            {
                roomId:
                    roomId,

                username:
                    username,

                starred:
                    true
            }
        );

        addLog(
            `⭐ ${socket.adminData.name} منح نجمة لـ ${username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| REMOVE STAR
|--------------------------------------------------------------------------
*/

socket.on(
    "remove star",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "stars"
            )
        ) {
            return;
        }

        const username =
            String(
                data?.username ||
                ""
            ).trim();

        const moderation =
            ensureRoomModeration(
                roomId
            );

        moderation.stars =
            moderation.stars.filter(
                name =>
                    name.toLowerCase() !==
                    username.toLowerCase()
            );

        saveFile(
            "roomModeration.json",
            roomModeration
        );

        roomNotice(
            roomId,
            `⭐ تم إزالة النجمة من ${username}`
        );

        io.to(
            roomId
        ).emit(
            "star changed",
            {
                roomId:
                    roomId,

                username:
                    username,

                starred:
                    false
            }
        );

        addLog(
            `⭐ ${socket.adminData.name} أزال نجمة ${username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| TOGGLE STARS MODE
|--------------------------------------------------------------------------
*/

socket.on(
    "toggle stars mode",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "stars"
            )
        ) {
            return;
        }

        const room =
            getRoom(
                roomId
            );

        if (!room) {
            return;
        }

        room.settings.starsMode =
            !room.settings.starsMode;

        saveFile(
            "rooms.json",
            rooms
        );

        roomNotice(
            roomId,
            room.settings.starsMode
                ? "⭐ تم تشغيل وضع النجوم"
                : "⭐ تم إيقاف وضع النجوم"
        );

        io.to(
            roomId
        ).emit(
            "stars mode changed",
            {
                roomId:
                    roomId,

                enabled:
                    room.settings.starsMode
            }
        );

        addLog(
            `⭐ وضع النجوم ${room.settings.starsMode ? "ON" : "OFF"}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| TOGGLE CHAT LOCK
|--------------------------------------------------------------------------
*/

socket.on(
    "toggle chat lock",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "chatLock"
            )
        ) {
            return;
        }

        const room =
            getRoom(
                roomId
            );

        if (!room) {
            return;
        }

        room.settings.chatLocked =
            !room.settings.chatLocked;

        saveFile(
            "rooms.json",
            rooms
        );

        roomNotice(
            roomId,
            room.settings.chatLocked
                ? "🔒 تم قفل الدردشة"
                : "🔓 تم فتح الدردشة"
        );

        io.to(
            roomId
        ).emit(
            "chat lock changed",
            {
                roomId:
                    roomId,

                locked:
                    room.settings.chatLocked
            }
        );

        addLog(
            `🔒 الدردشة ${room.settings.chatLocked ? "مقفلة" : "مفتوحة"}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| MAINTENANCE MODE
|--------------------------------------------------------------------------
*/

socket.on(
    "maintenance mode",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "maintenance"
            )
        ) {
            return;
        }

        const room =
            getRoom(
                roomId
            );

        if (!room) {
            return;
        }

        room.settings.maintenance =
            !room.settings.maintenance;

        saveFile(
            "rooms.json",
            rooms
        );

        roomNotice(
            roomId,
            room.settings.maintenance
                ? "🛠️ تم تشغيل وضع الصيانة"
                : "🟢 تم إيقاف وضع الصيانة"
        );

        io.to(
            roomId
        ).emit(
            "maintenance changed",
            {
                roomId:
                    roomId,

                enabled:
                    room.settings.maintenance
            }
        );

        addLog(
            `🛠️ الصيانة ${room.settings.maintenance ? "ON" : "OFF"}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| PROTECTION MODE
|--------------------------------------------------------------------------
*/

socket.on(
    "toggle protection",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "protection"
            )
        ) {
            return;
        }

        const room =
            getRoom(
                roomId
            );

        if (!room) {
            return;
        }

        room.settings.protection =
            !room.settings.protection;

        saveFile(
            "rooms.json",
            rooms
        );

        roomNotice(
            roomId,
            room.settings.protection
                ? "🛡️ تم تشغيل الحماية"
                : "🛡️ تم إيقاف الحماية"
        );

        io.to(
            roomId
        ).emit(
            "protection changed",
            {
                roomId:
                    roomId,

                enabled:
                    room.settings.protection
            }
        );

        addLog(
            `🛡️ الحماية ${room.settings.protection ? "ON" : "OFF"}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| GET ROOM MODERATION
|--------------------------------------------------------------------------
*/

socket.on(
    "get room moderation",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !socket.adminData ||
            !adminHasRoomAccess(
                socket.adminData,
                roomId
            )
        ) {

            socket.emit(
                "admin action error",
                "⛔ لا تملك الوصول إلى هذه الغرفة"
            );

            return;
        }

        const moderation =
            ensureRoomModeration(
                roomId
            );

        socket.emit(
            "room moderation",
            {
                roomId:
                    roomId,

                moderation:
                    moderation
            }
        );
    }
);

/*
|--------------------------------------------------------------------------
| DELETE MESSAGE
|--------------------------------------------------------------------------
*/

socket.on(
    "delete message",
    data => {

        const roomId =
            String(
                data?.roomId ||
                ""
            );

        if (
            !requireRoomPermission(
                socket,
                roomId,
                "deleteMessage"
            )
        ) {
            return;
        }

        const messageId =
            String(
                data?.messageId ||
                ""
            );

        if (!messageId) {
            return;
        }

        const messages =
            roomMessages.get(
                roomId
            );

        if (!messages) {
            return;
        }

        const index =
            messages.findIndex(
                message =>
                    message.id ===
                    messageId
            );

        if (
            index === -1
        ) {

            socket.emit(
                "admin action error",
                "❌ الرسالة غير موجودة"
            );

            return;
        }

        const deleted =
            messages[index];

        messages.splice(
            index,
            1
        );

        io.to(
            roomId
        ).emit(
            "message deleted",
            {
                roomId:
                    roomId,

                messageId:
                    messageId
            }
        );

        roomNotice(
            roomId,
            `🗑️ تم حذف رسالة ${deleted.username}`
        );

        addLog(
            `🗑️ ${socket.adminData.name} حذف رسالة من ${deleted.username}`,
            roomId
        );
    }
);

/*
|--------------------------------------------------------------------------
| ADMIN ROOM ASSIGNMENT
|--------------------------------------------------------------------------
*/

socket.on(
    "get admin room assignment",
    data => {

        if (
            !socket.adminData ||
            !isMaster(
                socket.adminData
            )
        ) {
            return;
        }

        const username =
            String(
                data?.username ||
                ""
            ).trim();

        const admin =
            admins.find(
                item =>
                    item.name.toLowerCase() ===
                    username.toLowerCase()
            );

        if (!admin) {
            return;
        }

        socket.emit(
            "admin room assignment",
            {
                username:
                    admin.name,

                rooms:
                    admin.rooms || [],

                roomPermissions:
                    admin.roomPermissions || {}
            }
        );
    }
);

/*
|--------------------------------------------------------------------------
| SOCKET DISCONNECT
|--------------------------------------------------------------------------
*/

socket.on(
    "disconnect",
    reason => {

        const username =
            socket.userData?.username;

        /*
        |--------------------------------------------------------------
        | Remove user from every room
        |--------------------------------------------------------------
        */

        if (
            socket.openRooms &&
            socket.openRooms.size
        ) {

            const openedRooms =
                Array.from(
                    socket.openRooms
                );

            openedRooms.forEach(
                roomId => {

                    socket.leave(
                        roomId
                    );

                    emitRoomUsers(
                        roomId
                    );
                }
            );
        }

        /*
        |--------------------------------------------------------------
        | Remove from online users
        |--------------------------------------------------------------
        */

        users =
            users.filter(
                user =>
                    user.id !==
                    socket.id
            );

        io.emit(
            "online users",
            users.map(
                user => {

                    const targetSocket =
                        getSocketByUserId(
                            user.id
                        );

                    return {
                        id:
                            user.id,

                        username:
                            user.username,

                        color:
                            user.color,

                        rolePrefix:
                            getRolePrefix(
                                targetSocket
                            ),

                        isAdmin:
                            !!targetSocket?.adminData
                    };
                }
            )
        );

        if (username) {

            addLog(
                `🔴 خروج ${username}`
            );
        }

        console.log(
            "🔴 Socket disconnected:",
            socket.id,
            reason
        );
    }
);

/*
|--------------------------------------------------------------------------
| END SOCKET CONNECTION
|--------------------------------------------------------------------------
*/

});

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| PUBLIC ROOMS
|--------------------------------------------------------------------------
*/

app.get(
    "/rooms.json",
    (req, res) => {

        res.json(
            getPublicRooms()
        );
    }
);

/*
|--------------------------------------------------------------------------
| BANNED
|--------------------------------------------------------------------------
|
| Legacy compatibility.
|--------------------------------------------------------------------------
*/

app.get(
    "/banned.json",
    (req, res) => {

        res.json(
            bannedUsers
        );
    }
);

/*
|--------------------------------------------------------------------------
| MUTED
|--------------------------------------------------------------------------
*/

app.get(
    "/muted.json",
    (req, res) => {

        res.json(
            mutedUsers
        );
    }
);

/*
|--------------------------------------------------------------------------
| DEVICE BANNED
|--------------------------------------------------------------------------
*/

app.get(
    "/deviceBanned.json",
    (req, res) => {

        res.json(
            deviceBannedUsers
        );
    }
);

/*
|--------------------------------------------------------------------------
| ROOM MODERATION API
|--------------------------------------------------------------------------
*/

app.get(
    "/room-moderation/:roomId",
    (req, res) => {

        const roomId =
            String(
                req.params.roomId
            );

        const room =
            getRoom(
                roomId
            );

        if (!room) {

            res.status(404).json({
                error:
                    "Room not found"
            });

            return;
        }

        res.json(
            ensureRoomModeration(
                roomId
            )
        );
    }
);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
    "/health",
    (req, res) => {

        res.json({
            status:
                "ok",

            users:
                users.length,

            rooms:
                rooms.length,

            uptime:
                process.uptime()
        });
    }
);

/*
|--------------------------------------------------------------------------
| FALLBACK INDEX
|--------------------------------------------------------------------------
*/

app.get(
    "/",
    (req, res) => {

        const publicIndex =
            path.join(
                DATA_DIR,
                "public",
                "index.html"
            );

        const rootIndex =
            path.join(
                DATA_DIR,
                "index.html"
            );

        if (
            fs.existsSync(
                publicIndex
            )
        ) {

            res.sendFile(
                publicIndex
            );

            return;
        }

        if (
            fs.existsSync(
                rootIndex
            )
        ) {

            res.sendFile(
                rootIndex
            );

            return;
        }

        res.status(404).send(
            "Mersal Chat"
        );
    }
);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT ||
    3000;

server.listen(
    PORT,
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "🚀 Mersal Chat Server Started"
        );

        console.log(
            `🌐 Port: ${PORT}`
        );

        console.log(
            `👥 Users: ${users.length}`
        );

        console.log(
            `🏠 Rooms: ${rooms.length}`
        );

        console.log(
            `👮 Admins: ${admins.length}`
        );

        console.log(
            "===================================="
        );
    }
);

