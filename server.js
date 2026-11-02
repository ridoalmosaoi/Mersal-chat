// ============================================================
// MERSAL CHAT - SERVER.JS
// PART 1 / 3
// ============================================================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

// ============================================================
// APP
// ============================================================

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

// ============================================================
// DATA DIRECTORY
// ============================================================

const DATA_DIR = path.join(
    __dirname,
    "data"
);

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}

// ============================================================
// FILE HELPERS
// ============================================================

function dataFile(name) {
    return path.join(
        DATA_DIR,
        name
    );
}

function loadJSON(name, fallback) {

    const file = dataFile(name);

    try {

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
            `❌ LOAD ERROR ${name}`,
            error
        );

        return fallback;
    }
}

function saveJSON(name, value) {

    const file =
        dataFile(name);

    try {

        fs.writeFileSync(
            file,
            JSON.stringify(
                value,
                null,
                2
            )
        );

    } catch (error) {

        console.error(
            `❌ SAVE ERROR ${name}`,
            error
        );
    }
}

// ============================================================
// BASIC ID
// ============================================================

function makeId(prefix = "id") {

    return (
        prefix +
        "_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

// ============================================================
// GLOBAL MEMORY
// ============================================================

let users = [];

// ============================================================
// GLOBAL SETTINGS
// ============================================================

let globalChatLocked = false;

let globalPrivateLocked = false;

let globalMaintenance = false;

let globalStarsMode = false;

let globalDisconnect = false;

// ============================================================
// ADMINS
// ============================================================

let admins = loadJSON(
    "admins.json",
    []
);

// ============================================================
// GLOBAL MODERATION
// ============================================================

let bannedUsers = loadJSON(
    "banned.json",
    []
);

let mutedUsers = loadJSON(
    "muted.json",
    []
);

let deviceBannedUsers = loadJSON(
    "deviceBanned.json",
    []
);

let stars = loadJSON(
    "stars.json",
    []
);

// ============================================================
// LOGS
// ============================================================

let logs = loadJSON(
    "logs.json",
    []
);

// ============================================================
// ROOMS
// ============================================================

let rooms = loadJSON(
    "rooms.json",
    []
);

// ============================================================
// ROOM MODERATION
//
// IMPORTANT:
//
// banned = حظر داخل هذه الغرفة فقط
// muted = كتم داخل هذه الغرفة فقط
// kicked = طرد من هذه الغرفة
// disconnected = فصل من هذه الغرفة
//
// لا نستخدم bannedUsers هنا.
// ============================================================

let roomModeration =
    loadJSON(
        "roomModeration.json",
        {}
    );

// ============================================================
// ROOM MESSAGES
// ============================================================

let roomMessages =
    loadJSON(
        "roomMessages.json",
        {}
    );

// ============================================================
// ROOM STARS
// ============================================================

let roomStars =
    loadJSON(
        "roomStars.json",
        {}
    );

// ============================================================
// CONSTANTS
// ============================================================

const MAX_OPEN_ROOMS = 3;

const MAX_USERNAME_LENGTH = 30;

const MAX_MESSAGE_LENGTH = 2000;

const MAX_ROOM_NAME_LENGTH = 50;

const MAX_ROOM_DESCRIPTION_LENGTH = 300;

// ============================================================
// GLOBAL CONTROL
// ============================================================

const GLOBAL_CONTROL_PATH =
    process.env.GLOBAL_CONTROL_PATH ||
    "/global-control-7xK9";

const GLOBAL_CONTROL_PASSWORD =
    process.env.GLOBAL_CONTROL_PASSWORD ||
    "MersalGlobal2026";

// ============================================================
// ADMIN DEFAULT PERMISSIONS
// ============================================================

const DEFAULT_PERMISSIONS = {

    kick: false,

    ban: false,

    disconnect: false,

    unban: false,

    mute: false,

    unmute: false,

    clear: false,

    maintenance: false,

    chatLock: false,

    privateLock: false,

    deleteMessage: false,

    addAdmin: false,

    removeAdmin: false,

    viewIP: false,

    viewUserInfo: false,

    stars: false,

    rooms: false,

    roomSettings: false
};

// ============================================================
// ADMIN NORMALIZATION
// ============================================================

function normalizePermissions(
    permissions
) {

    const result = {
        ...DEFAULT_PERMISSIONS
    };

    if (
        permissions &&
        typeof permissions === "object"
    ) {

        Object.keys(
            DEFAULT_PERMISSIONS
        ).forEach(key => {

            if (
                permissions[key] !==
                undefined
            ) {

                result[key] =
                    Boolean(
                        permissions[key]
                    );
            }

        });

    }

    return result;
}

// ============================================================
// NORMALIZE ADMINS
// ============================================================

admins =
    Array.isArray(admins)
        ? admins
            .filter(
                admin =>
                    admin &&
                    admin.name
            )
            .map(
                (admin, index) => ({

                    name:
                        String(
                            admin.name
                        ).trim(),

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
                                : "admin"
                        ),

                    isMaster:
                        admin.isMaster === true ||
                        index === 0,

                    permissions:
                        normalizePermissions(
                            admin.permissions
                        ),

                    roomIds:
                        Array.isArray(
                            admin.roomIds
                        )
                            ? admin.roomIds
                            : [],

                    rooms:
                        Array.isArray(
                            admin.rooms
                        )
                            ? admin.rooms
                            : []
                })
            )
        : [];

// ============================================================
// ENSURE FIRST ADMIN IS MASTER
// ============================================================

if (
    admins.length > 0 &&
    !admins.some(
        admin =>
            admin.isMaster === true ||
            admin.role === "master"
    )
) {

    admins[0].isMaster = true;

    admins[0].role =
        "master";
}

saveJSON(
    "admins.json",
    admins
);

// ============================================================
// ROOM NORMALIZATION
// ============================================================

function normalizeRoom(room) {

    const source =
        room &&
        typeof room === "object"
            ? room
            : {};

    const settings =
        source.settings &&
        typeof source.settings === "object"
            ? source.settings
            : {};

    return {

        id:
            String(
                source.id ||
                makeId("room")
            ),

        name:
            String(
                source.name ||
                "غرفة جديدة"
            )
                .trim()
                .slice(
                    0,
                    MAX_ROOM_NAME_LENGTH
                ),

        description:
            String(
                source.description ||
                ""
            )
                .trim()
                .slice(
                    0,
                    MAX_ROOM_DESCRIPTION_LENGTH
                ),

        enabled:
            source.enabled !== false,

        createdAt:
            source.createdAt ||
            Date.now(),

        updatedAt:
            source.updatedAt ||
            Date.now(),

        settings: {

            starsMode:
                settings.starsMode === true,

            chatLock:
                settings.chatLock === true,

            maintenance:
                settings.maintenance === true,

            protection:
                settings.protection !== false
        }
    };
}

// ============================================================
// NORMALIZE ALL ROOMS
// ============================================================

rooms =
    Array.isArray(rooms)
        ? rooms.map(
            normalizeRoom
        )
        : [];

// ============================================================
// ROOM DATA ENSURANCE
// ============================================================

function ensureRoomModeration(
    roomId
) {

    const id =
        String(roomId);

    if (
        !roomModeration[id] ||
        typeof roomModeration[id] !==
            "object"
    ) {

        roomModeration[id] = {};
    }

    if (
        !Array.isArray(
            roomModeration[id].banned
        )
    ) {

        roomModeration[id].banned = [];
    }

    if (
        !Array.isArray(
            roomModeration[id].muted
        )
    ) {

        roomModeration[id].muted = [];
    }

    if (
        !Array.isArray(
            roomModeration[id].kicked
        )
    ) {

        roomModeration[id].kicked = [];
    }

    if (
        !Array.isArray(
            roomModeration[id].disconnected
        )
    ) {

        roomModeration[id].disconnected = [];
    }

    return roomModeration[id];
}

// ============================================================
// ENSURE ROOM MESSAGES
// ============================================================

function ensureRoomMessages(
    roomId
) {

    const id =
        String(roomId);

    if (
        !Array.isArray(
            roomMessages[id]
        )
    ) {

        roomMessages[id] = [];
    }

    return roomMessages[id];
}

// ============================================================
// ENSURE ROOM STARS
// ============================================================

function ensureRoomStars(
    roomId
) {

    const id =
        String(roomId);

    if (
        !Array.isArray(
            roomStars[id]
        )
    ) {

        roomStars[id] = [];
    }

    return roomStars[id];
}

// ============================================================
// INITIALIZE ROOM DATA
// ============================================================

rooms.forEach(
    room => {

        ensureRoomModeration(
            room.id
        );

        ensureRoomMessages(
            room.id
        );

        ensureRoomStars(
            room.id
        );
    }
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

// ============================================================
// STRING HELPERS
// ============================================================

function cleanText(
    value,
    maxLength = 2000
) {

    return String(
        value === undefined ||
        value === null
            ? ""
            : value
    )
        .trim()
        .slice(
            0,
            maxLength
        );
}

// ============================================================
// USERNAME VALIDATION
// ============================================================

function validUsername(
    username
) {

    const name =
        cleanText(
            username,
            MAX_USERNAME_LENGTH
        );

    if (!name) {
        return false;
    }

    if (
        name.length >
        MAX_USERNAME_LENGTH
    ) {

        return false;
    }

    // منع تقليد رتب الإدارة
    if (
        name.includes("&") ||
        name.includes("@")
    ) {

        return false;
    }

    const lower =
        name.toLowerCase();

    const reserved = [

        "admin",

        "administrator",

        "master",

        "owner",

        "moderator",

        "mod",

        "system",

        "server",

        "mersal",

        "mersalchat"
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

// ============================================================
// IP
// ============================================================

function getIP(
    socket
) {

    const forwarded =
        socket.handshake
            ?.headers
            ?.["x-forwarded-for"];

    if (forwarded) {

        return String(
            forwarded
        )
            .split(",")[0]
            .trim();
    }

    return String(
        socket.handshake
            ?.address ||
        "unknown"
    );
}

// ============================================================
// DEVICE
// ============================================================

function getDevice(
    socket,
    data = {}
) {

    return String(
        data.deviceToken ||
        socket.handshake
            ?.headers
            ?.["user-agent"] ||
        "unknown"
    );
}

// ============================================================
// GET ROOM
// ============================================================

function getRoom(
    roomId
) {

    return rooms.find(
        room =>
            String(room.id) ===
            String(roomId)
    ) || null;
}

// ============================================================
// PUBLIC ROOM DATA
// ============================================================

function publicRoom(
    room
) {

    if (!room) {
        return null;
    }

    return {

        id:
            room.id,

        name:
            room.name,

        description:
            room.description,

        enabled:
            room.enabled !== false,

        createdAt:
            room.createdAt,

        settings: {

            starsMode:
                room.settings
                    ?.starsMode === true,

            chatLock:
                room.settings
                    ?.chatLock === true,

            maintenance:
                room.settings
                    ?.maintenance === true,

            protection:
                room.settings
                    ?.protection !== false
        }
    };
}

// ============================================================
// PUBLIC ROOMS
// ============================================================

function getPublicRooms() {

    return rooms
        .filter(
            room =>
                room.enabled !== false
        )
        .map(
            publicRoom
        );
}

// ============================================================
// FIND ADMIN
// ============================================================

function getAdminByName(
    name
) {

    const value =
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
                .toLowerCase() ===
            value
    ) || null;
}

// ============================================================
// MASTER ADMIN
// ============================================================

function isMasterAdmin(
    admin
) {

    if (!admin) {
        return false;
    }

    return (
        admin.isMaster === true ||
        admin.role === "master" ||
        admin.permissions
            ?.master === true
    );
}

// ============================================================
// ADMIN HAS ROOM ACCESS
// ============================================================

function adminHasRoomAccess(
    admin,
    roomId
) {

    if (!admin) {
        return false;
    }

    if (
        isMasterAdmin(
            admin
        )
    ) {

        return true;
    }

    const id =
        String(roomId);

    const roomIds =
        Array.isArray(
            admin.roomIds
        )
            ? admin.roomIds
            : [];

    const roomsList =
        Array.isArray(
            admin.rooms
        )
            ? admin.rooms
            : [];

    return (
        roomIds
            .map(
                String
            )
            .includes(id)
        ||
        roomsList
            .map(
                String
            )
            .includes(id)
    );
}

// ============================================================
// ADMIN HAS PERMISSION
// ============================================================

function adminHasPermission(
    admin,
    permission,
    roomId = null
) {

    if (!admin) {
        return false;
    }

    if (
        isMasterAdmin(
            admin
        )
    ) {

        return true;
    }

    if (
        roomId &&
        !adminHasRoomAccess(
            admin,
            roomId
        )
    ) {

        return false;
    }

    return (
        admin.permissions &&
        admin.permissions[
            permission
        ] === true
    );
}

// ============================================================
// SOCKET ADMIN
// ============================================================

function getSocketAdmin(
    socket
) {

    return (
        socket &&
        socket.adminData
            ? socket.adminData
            : null
    );
}

// ============================================================
// FIND USER BY SOCKET
// ============================================================

function getUser(
    socket
) {

    if (!socket) {
        return null;
    }

    return users.find(
        user =>
            user.id ===
            socket.id
    ) || null;
}

// ============================================================
// FIND USER BY SOCKET ID
// ============================================================

function getUserBySocket(
    socket
) {

    return getUser(
        socket
    );
}

// ============================================================
// FIND USER BY NAME
// ============================================================

function getUserByName(
    name
) {

    const value =
        String(
            name || ""
        )
            .trim()
            .toLowerCase();

    return users.find(
        user =>
            String(
                user.name
            )
                .toLowerCase() ===
            value
    ) || null;
}

// ============================================================
// FIND USER BY IP
// ============================================================

function getUserByIP(
    ip
) {

    return users.find(
        user =>
            String(
                user.ip
            ) ===
            String(ip)
    ) || null;
}

// ============================================================
// GET USER SOCKET
// ============================================================

function getUserSocket(
    user
) {

    if (!user) {
        return null;
    }

    return io.sockets
        .sockets
        .get(
            user.id
        ) || null;
}

// ============================================================
// PUBLIC USER DATA
// ============================================================

function publicUser(
    user
) {

    if (!user) {
        return null;
    }

    return {

        id:
            user.id,

        name:
            user.name,

        prefix:
            user.prefix || "",

        roomId:
            user.roomId || null,

        online:
            true
    };
}

// ============================================================
// ADMIN USER DATA
// ============================================================

function adminUserData(
    user
) {

    if (!user) {
        return null;
    }

    return {

        id:
            user.id,

        name:
            user.name,

        prefix:
            user.prefix || "",

        roomId:
            user.roomId || null,

        ip:
            user.ip,

        device:
            user.device,

        userAgent:
            user.userAgent,

        connectedAt:
            user.connectedAt
    };
}

// ============================================================
// GET USERS IN ROOM
// ============================================================

function getRoomUsers(
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
            publicUser
        );
}

// ============================================================
// ROOM MODERATION NAME MATCH
// ============================================================

function moderationName(
    item
) {

    if (
        typeof item ===
        "string"
    ) {

        return item;
    }

    if (
        item &&
        typeof item ===
        "object"
    ) {

        return item.name ||
            item.username ||
            "";
    }

    return "";
}

// ============================================================
// CHECK ROOM MODERATION
// ============================================================

function roomModerationHas(
    roomId,
    type,
    username
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    const list =
        Array.isArray(
            moderation[type]
        )
            ? moderation[type]
            : [];

    const target =
        String(
            username || ""
        )
            .toLowerCase();

    return list.some(
        item =>
            String(
                moderationName(
                    item
                )
            )
                .toLowerCase() ===
            target
    );
}

// ============================================================
// ADD ROOM MODERATION
// ============================================================

function addRoomModeration(
    roomId,
    type,
    username,
    by
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    if (
        !Array.isArray(
            moderation[type]
        )
    ) {

        moderation[type] = [];
    }

    const exists =
        roomModerationHas(
            roomId,
            type,
            username
        );

    if (!exists) {

        moderation[type]
            .push({

                name:
                    username,

                by:
                    by || "system",

                time:
                    Date.now()
            });
    }

    saveJSON(
        "roomModeration.json",
        roomModeration
    );
}

// ============================================================
// REMOVE ROOM MODERATION
// ============================================================

function removeRoomModeration(
    roomId,
    type,
    username
) {

    const moderation =
        ensureRoomModeration(
            roomId
        );

    const target =
        String(
            username || ""
        )
            .toLowerCase();

    moderation[type] =
        (
            Array.isArray(
                moderation[type]
            )
                ? moderation[type]
                : []
        ).filter(
            item =>
                String(
                    moderationName(
                        item
                    )
                )
                    .toLowerCase() !==
                target
        );

    saveJSON(
        "roomModeration.json",
        roomModeration
    );
}

// ============================================================
// ROOM NOTICE
// ============================================================

function roomNotice(
    roomId,
    message,
    type = "system"
) {

    io.to(
        `room:${roomId}`
    ).emit(
        "room notice",
        {

            roomId:
                String(
                    roomId
                ),

            message:
                String(
                    message
                ),

            type,

            timestamp:
                Date.now()
        }
    );
}

// ============================================================
// ROOM USERS UPDATE
// ============================================================

function emitRoomUsers(
    roomId
) {

    io.to(
        `room:${roomId}`
    ).emit(
        "room users",
        getRoomUsers(
            roomId
        )
    );
}

// ============================================================
// ONLINE USERS UPDATE
// ============================================================

function emitOnlineUsers() {

    const names =
        users.map(
            user =>
                user.name
        );

    io.emit(
        "online users",
        names
    );

    io.emit(
        "online users data",
        users.map(
            publicUser
        )
    );
}

// ============================================================
// STATS
// ============================================================

function emitStats(
    targetSocket = null
) {

    const stats = {

        onlineUsers:
            users.length,

        bannedUsers:
            bannedUsers.length,

        admins:
            admins.length,

        rooms:
            rooms.length,

        globalDisconnect:
            globalDisconnect,

        globalChatLocked:
            globalChatLocked,

        globalPrivateLocked:
            globalPrivateLocked,

        globalMaintenance:
            globalMaintenance,

        globalStarsMode:
            globalStarsMode
    };

    if (targetSocket) {

        targetSocket.emit(
            "server stats",
            stats
        );

        return;
    }

    io.emit(
        "server stats",
        stats
    );
}

// ============================================================
// LOGGING
// ============================================================

function addLog(
    message,
    roomId = null,
    by = null
) {

    const entry = {

        id:
            makeId("log"),

        message:
            String(
                message
            ),

        roomId:
            roomId
                ? String(
                    roomId
                )
                : null,

        by:
            by || null,

        timestamp:
            Date.now(),

        time:
            new Date()
                .toLocaleString(
                    "nb-NO"
                )
    };

    logs.unshift(
        entry
    );

    if (
        logs.length >
        5000
    ) {

        logs =
            logs.slice(
                0,
                5000
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

    console.log(
        entry.message
    );
}

// ============================================================
// GLOBAL BAN CHECK
// ============================================================

function isGloballyBanned(
    user
) {

    if (!user) {
        return false;
    }

    const name =
        String(
            user.name || ""
        )
            .toLowerCase();

    const ip =
        String(
            user.ip || ""
        );

    return bannedUsers.some(
        item => {

            if (
                typeof item ===
                "string"
            ) {

                return (
                    item
                        .toLowerCase() ===
                    name
                );
            }

            if (
                !item ||
                typeof item !==
                "object"
            ) {

                return false;
            }

            return (
                (
                    item.name &&
                    String(
                        item.name
                    )
                        .toLowerCase() ===
                    name
                )
                ||
                (
                    item.ip &&
                    String(
                        item.ip
                    ) ===
                    ip
                )
            );
        }
    );
}

// ============================================================
// GLOBAL MUTE CHECK
// ============================================================

function isGloballyMuted(
    user
) {

    if (!user) {
        return false;
    }

    const name =
        String(
            user.name || ""
        )
            .toLowerCase();

    return mutedUsers.some(
        item => {

            const value =
                typeof item ===
                "string"
                    ? item
                    : item?.name;

            return (
                String(
                    value || ""
                )
                    .toLowerCase() ===
                name
            );
        }
    );
}

// ============================================================
// DEVICE BAN CHECK
// ============================================================

function isDeviceBanned(
    device
) {

    const target =
        String(
            device || ""
        );

    return deviceBannedUsers.some(
        item => {

            if (
                typeof item ===
                "string"
            ) {

                return (
                    item ===
                    target
                );
            }

            return (
                String(
                    item?.device ||
                    item?.deviceToken ||
                    ""
                ) ===
                target
            );
        }
    );
}

// ============================================================
// ROOM BAN CHECK
//
// THIS IS COMPLETELY SEPARATE
// FROM GLOBAL bannedUsers.
// ============================================================

function isRoomBanned(
    roomId,
    username
) {

    return roomModerationHas(
        roomId,
        "banned",
        username
    );
}

// ============================================================
// ROOM MUTED CHECK
// ============================================================

function isRoomMuted(
    roomId,
    username
) {

    return roomModerationHas(
        roomId,
        "muted",
        username
    );
}

// ============================================================
// ROOM DISCONNECTED CHECK
// ============================================================

function isRoomDisconnected(
    roomId,
    username
) {

    return roomModerationHas(
        roomId,
        "disconnected",
        username
    );
}

// ============================================================
// ROOM KICKED CHECK
// ============================================================

function isRoomKicked(
    roomId,
    username
) {

    return roomModerationHas(
        roomId,
        "kicked",
        username
    );
}

// ============================================================
// REMOVE USER FROM SOCKET ROOM
// ============================================================

function removeSocketFromRoom(
    socket,
    roomId
) {

    if (!socket) {
        return;
    }

    socket.leave(
        `room:${roomId}`
    );

    if (
        Array.isArray(
            socket.openRooms
        )
    ) {

        socket.openRooms =
            socket.openRooms.filter(
                id =>
                    String(id) !==
                    String(roomId)
            );
    }

    const user =
        getUser(
            socket
        );

    if (
        user &&
        String(
            user.roomId
        ) ===
        String(roomId)
    ) {

        user.roomId =
            null;
    }
}

// ============================================================
// ADD SOCKET TO ROOM
// ============================================================

function addSocketToRoom(
    socket,
    roomId
) {

    if (!socket) {
        return false;
    }

    const id =
        String(roomId);

    if (
        !Array.isArray(
            socket.openRooms
        )
    ) {

        socket.openRooms = [];
    }

    if (
        socket.openRooms
            .includes(id)
    ) {

        return true;
    }

    if (
        socket.openRooms.length >=
        MAX_OPEN_ROOMS
    ) {

        return false;
    }

    socket.join(
        `room:${id}`
    );

    socket.openRooms.push(
        id
    );

    return true;
}

// ============================================================
// SAVE ALL DATA
// ============================================================

function saveAllData() {

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
}

// ============================================================
// BASIC ROUTES
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.json({

            ok: true,

            service:
                "Mersal Chat",

            users:
                users.length,

            rooms:
                rooms.length,

            time:
                Date.now()
        });
    }
);

// ============================================================
// PUBLIC ROOMS API
// ============================================================

app.get(
    "/api/rooms",
    (req, res) => {

        res.json(
            getPublicRooms()
        );
    }
);

// ============================================================
// ADMIN CHECK API
// ============================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            online:
                users.length,

            rooms:
                rooms.length,

            maintenance:
                globalMaintenance,

            chatLocked:
                globalChatLocked,

            privateLocked:
                globalPrivateLocked,

            globalDisconnect:
                globalDisconnect
        });
    }
);

// ============================================================
// PART 1 ENDS HERE
// ============================================================
// DO NOT ADD SERVER START HERE.
//
// PART 2 CONTINUES DIRECTLY AFTER THIS LINE.
// ============================================================
// ============================================================
// MERSAL CHAT - SERVER.JS
// PART 2 / 3
// ============================================================

// ============================================================
// SOCKET.IO
// ============================================================

io.on(
    "connection",
    socket => {

        // ====================================================
        // SOCKET INITIAL STATE
        // ====================================================

        socket.username = null;

        socket.adminData = null;

        socket.openRooms = [];

        socket.currentRoom = null;

        // ====================================================
        // CHECK ADMIN
        // ====================================================

        socket.on(
            "check admin",
            name => {

                const admin =
                    getAdminByName(
                        name
                    );

                socket.emit(
                    "admin check result",
                    Boolean(admin)
                );
            }
        );

        // ====================================================
        // ADMIN PANEL LOGIN
        // ====================================================

        socket.on(
            "admin panel login",
            data => {

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const password =
                    String(
                        data?.password ||
                        ""
                    );

                const admin =
                    getAdminByName(
                        name
                    );

                if (
                    !admin ||
                    admin.password !==
                    password
                ) {

                    socket.emit(
                        "admin login failed"
                    );

                    return;
                }

                socket.adminData = {

                    name:
                        admin.name,

                    role:
                        admin.role,

                    isMaster:
                        isMasterAdmin(
                            admin
                        ),

                    permissions:
                        normalizePermissions(
                            admin.permissions
                        ),

                    roomIds:
                        Array.isArray(
                            admin.roomIds
                        )
                            ? admin.roomIds
                            : [],

                    rooms:
                        Array.isArray(
                            admin.rooms
                        )
                            ? admin.rooms
                            : []
                };

                socket.emit(
                    "admin login success",
                    {

                        name:
                            admin.name,

                        role:
                            admin.role,

                        isMaster:
                            isMasterAdmin(
                                admin
                            ),

                        permissions:
                            normalizePermissions(
                                admin.permissions
                            ),

                        roomIds:
                            admin.roomIds || []
                    }
                );

                emitStats(
                    socket
                );

                socket.emit(
                    "admin online users",
                    users.map(
                        adminUserData
                    )
                );

                socket.emit(
                    "admin logs",
                    logs
                );

                emitAdminRooms(
                    socket
                );

                addLog(
                    `👑 تم تسجيل دخول الأدمن ${admin.name}`
                );
            }
        );

        // ====================================================
        // ADMIN ONLINE USERS
        // ====================================================

        socket.on(
            "get admin users",
            () => {

                if (
                    !getSocketAdmin(
                        socket
                    )
                ) {

                    return;
                }

                socket.emit(
                    "admin online users",
                    users.map(
                        adminUserData
                    )
                );

                emitStats(
                    socket
                );
            }
        );

        // ====================================================
        // ADMIN STATS
        // ====================================================

        socket.on(
            "get stats",
            () => {

                if (
                    !getSocketAdmin(
                        socket
                    )
                ) {

                    return;
                }

                emitStats(
                    socket
                );
            }
        );

        // ====================================================
        // ADMIN LOGS
        // ====================================================

        socket.on(
            "get logs",
            () => {

                if (
                    !getSocketAdmin(
                        socket
                    )
                ) {

                    return;
                }

                socket.emit(
                    "admin logs",
                    logs
                );
            }
        );

        // ====================================================
        // GET ROOMS FOR ADMIN
        // ====================================================

        socket.on(
            "get rooms",
            () => {

                if (
                    !getSocketAdmin(
                        socket
                    )
                ) {

                    return;
                }

                emitAdminRooms(
                    socket
                );
            }
        );

        // ====================================================
        // ADMIN ROOM LIST
        // ====================================================

        function emitAdminRooms(
            targetSocket
        ) {

            const admin =
                getSocketAdmin(
                    targetSocket
                );

            if (!admin) {
                return;
            }

            let list = [];

            if (
                isMasterAdmin(
                    admin
                )
            ) {

                list =
                    rooms.map(
                        publicRoom
                    );

            } else {

                list =
                    rooms
                        .filter(
                            room =>
                                adminHasRoomAccess(
                                    admin,
                                    room.id
                                )
                        )
                        .map(
                            publicRoom
                        );
            }

            targetSocket.emit(
                "admin rooms",
                list
            );

            targetSocket.emit(
                "rooms updated",
                list
            );
        }

        // ====================================================
        // CREATE ROOM
        // ====================================================

        socket.on(
            "create room",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {

                    socket.emit(
                        "room error",
                        "❌ يجب تسجيل الدخول كأدمن"
                    );

                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "rooms"
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية إنشاء الغرف"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        MAX_ROOM_NAME_LENGTH
                    );

                const description =
                    cleanText(
                        data?.description,
                        MAX_ROOM_DESCRIPTION_LENGTH
                    );

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

                    updatedAt:
                        Date.now(),

                    settings: {

                        starsMode:
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

                ensureRoomModeration(
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

                emitAdminRooms(
                    socket
                );

                addLog(
                    `🏠 تم إنشاء الغرفة ${room.name}`,
                    room.id,
                    admin.name
                );
            }
        );

        // ====================================================
        // DELETE ROOM
        // ====================================================

        socket.on(
            "delete room",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {

                    socket.emit(
                        "room error",
                        "❌ يجب تسجيل الدخول كأدمن"
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
                    !adminHasPermission(
                        admin,
                        "rooms",
                        roomId
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية حذف هذه الغرفة"
                    );

                    return;
                }

                // إخراج المستخدمين من الغرفة
                users
                    .filter(
                        user =>
                            String(
                                user.roomId
                            ) === roomId
                    )
                    .forEach(
                        user => {

                            const target =
                                getUserSocket(
                                    user
                                );

                            if (
                                target
                            ) {

                                target.leave(
                                    `room:${roomId}`
                                );

                                if (
                                    Array.isArray(
                                        target.openRooms
                                    )
                                ) {

                                    target.openRooms =
                                        target.openRooms.filter(
                                            id =>
                                                String(id) !==
                                                roomId
                                        );
                                }

                                if (
                                    String(
                                        user.roomId
                                    ) === roomId
                                ) {

                                    user.roomId =
                                        null;
                                }

                                target.emit(
                                    "room deleted",
                                    {
                                        roomId
                                    }
                                );
                            }
                        }
                    );

                rooms =
                    rooms.filter(
                        item =>
                            String(
                                item.id
                            ) !== roomId
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

                // إزالة الغرفة من تعيينات الأدمن
                admins.forEach(
                    item => {

                        if (
                            Array.isArray(
                                item.roomIds
                            )
                        ) {

                            item.roomIds =
                                item.roomIds.filter(
                                    id =>
                                        String(id) !==
                                        roomId
                                );
                        }

                        if (
                            Array.isArray(
                                item.rooms
                            )
                        ) {

                            item.rooms =
                                item.rooms.filter(
                                    id =>
                                        String(id) !==
                                        roomId
                                );
                        }
                    }
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

                saveJSON(
                    "admins.json",
                    admins
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
                    "admin rooms",
                    getPublicRooms()
                );

                emitOnlineUsers();

                emitStats();

                addLog(
                    `🗑️ تم حذف الغرفة ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // EDIT ROOM
        // ====================================================

        socket.on(
            "edit room",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {

                    socket.emit(
                        "room error",
                        "❌ يجب تسجيل الدخول كأدمن"
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
                    !adminHasPermission(
                        admin,
                        "rooms",
                        roomId
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية تعديل هذه الغرفة"
                    );

                    return;
                }

                const newName =
                    data?.name !== undefined
                        ? cleanText(
                            data.name,
                            MAX_ROOM_NAME_LENGTH
                        )
                        : room.name;

                const newDescription =
                    data?.description !== undefined
                        ? cleanText(
                            data.description,
                            MAX_ROOM_DESCRIPTION_LENGTH
                        )
                        : room.description;

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
                            ) !== roomId
                            &&
                            item.name
                                .toLowerCase() ===
                            newName.toLowerCase()
                    );

                if (duplicate) {

                    socket.emit(
                        "room error",
                        "⚠️ اسم الغرفة مستخدم"
                    );

                    return;
                }

                room.name =
                    newName;

                room.description =
                    newDescription;

                room.updatedAt =
                    Date.now();

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

                emitAdminRooms(
                    socket
                );

                addLog(
                    `✏️ تم تعديل الغرفة ${room.name}`,
                    room.id,
                    admin.name
                );
            }
        );

        // ====================================================
        // ENABLE / DISABLE ROOM
        // ====================================================

        socket.on(
            "set room enabled",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
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
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "rooms",
                        roomId
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية إدارة هذه الغرفة"
                    );

                    return;
                }

                room.enabled =
                    data?.enabled !== false;

                room.updatedAt =
                    Date.now();

                saveJSON(
                    "rooms.json",
                    rooms
                );

                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );

                roomNotice(
                    roomId,
                    room.enabled
                        ? "🟢 تم فتح الغرفة"
                        : "🔴 تم إغلاق الغرفة",
                    "room-setting"
                );

                addLog(
                    room.enabled
                        ? `🟢 تم فتح ${room.name}`
                        : `🔴 تم إغلاق ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM SETTINGS
        // ====================================================

        socket.on(
            "set room setting",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const setting =
                    String(
                        data?.setting ||
                        ""
                    );

                const value =
                    Boolean(
                        data?.value
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "roomSettings",
                        roomId
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية إعدادات هذه الغرفة"
                    );

                    return;
                }

                const allowed = [

                    "starsMode",

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
                        "room error",
                        "❌ إعداد غير صالح"
                    );

                    return;
                }

                room.settings[
                    setting
                ] = value;

                room.updatedAt =
                    Date.now();

                saveJSON(
                    "rooms.json",
                    rooms
                );

                io.to(
                    `room:${roomId}`
                ).emit(
                    "room setting changed",
                    {

                        roomId,

                        setting,

                        value
                    }
                );

                io.emit(
                    "rooms updated",
                    getPublicRooms()
                );

                addLog(
                    `⚙️ ${room.name}: ${setting} = ${value}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ASSIGN ADMIN TO ROOM
        // ====================================================

        socket.on(
            "assign room admin",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (
                    !admin ||
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ هذه العملية للـ Master فقط"
                    );

                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const adminName =
                    cleanText(
                        data?.adminName,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                const targetAdmin =
                    getAdminByName(
                        adminName
                    );

                if (!room) {

                    socket.emit(
                        "room error",
                        "❌ الغرفة غير موجودة"
                    );

                    return;
                }

                if (!targetAdmin) {

                    socket.emit(
                        "room error",
                        "❌ الأدمن غير موجود"
                    );

                    return;
                }

                if (
                    !Array.isArray(
                        targetAdmin.roomIds
                    )
                ) {

                    targetAdmin.roomIds =
                        [];
                }

                if (
                    !targetAdmin.roomIds
                        .map(String)
                        .includes(
                            roomId
                        )
                ) {

                    targetAdmin.roomIds
                        .push(
                            roomId
                        );
                }

                saveJSON(
                    "admins.json",
                    admins
                );

                emitAdminRooms(
                    socket
                );

                io.emit(
                    "room admin updated",
                    {

                        roomId,

                        adminName,

                        assigned:
                            true
                    }
                );

                addLog(
                    `👑 تم تعيين ${adminName} لإدارة ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // REMOVE ADMIN FROM ROOM
        // ====================================================

        socket.on(
            "remove room admin",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (
                    !admin ||
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const adminName =
                    cleanText(
                        data?.adminName,
                        100
                    );

                const targetAdmin =
                    getAdminByName(
                        adminName
                    );

                if (!targetAdmin) {
                    return;
                }

                targetAdmin.roomIds =
                    (
                        Array.isArray(
                            targetAdmin.roomIds
                        )
                            ? targetAdmin.roomIds
                            : []
                    ).filter(
                        id =>
                            String(id) !==
                            roomId
                    );

                targetAdmin.rooms =
                    (
                        Array.isArray(
                            targetAdmin.rooms
                        )
                            ? targetAdmin.rooms
                            : []
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
                    "room admin updated",
                    {

                        roomId,

                        adminName,

                        assigned:
                            false
                    }
                );

                addLog(
                    `🗑️ تم إزالة ${adminName} من إدارة الغرفة`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // GET ROOM ADMINS
        // ====================================================

        socket.on(
            "get room admins",
            roomId => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const id =
                    String(
                        roomId ||
                        ""
                    );

                if (
                    !adminHasRoomAccess(
                        admin,
                        id
                    )
                ) {

                    return;
                }

                const list =
                    admins
                        .filter(
                            item =>
                                isMasterAdmin(
                                    item
                                )
                                ||
                                adminHasRoomAccess(
                                    item,
                                    id
                                )
                        )
                        .map(
                            item => ({
                                name:
                                    item.name,

                                role:
                                    item.role,

                                isMaster:
                                    isMasterAdmin(
                                        item
                                    )
                            })
                        );

                socket.emit(
                    "room admins updated",
                    {

                        roomId:
                            id,

                        admins:
                            list
                    }
                );
            }
        );

        // ====================================================
        // ADD ADMIN
        // ====================================================

        socket.on(
            "add admin",
            data => {

                const currentAdmin =
                    getSocketAdmin(
                        socket
                    );

                if (
                    !currentAdmin ||
                    !isMasterAdmin(
                        currentAdmin
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية إضافة أدمن"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const password =
                    String(
                        data?.password ||
                        ""
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
                        item =>
                            item.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⚠️ هذا الأدمن موجود مسبقًا"
                    );

                    return;
                }

                const permissions =
                    normalizePermissions(
                        data?.permissions
                    );

                const newAdmin = {

                    name,

                    password,

                    role:
                        "admin",

                    isMaster:
                        false,

                    permissions,

                    roomIds: [],

                    rooms: []
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
                    {

                        name:
                            newAdmin.name,

                        role:
                            newAdmin.role,

                        permissions:
                            newAdmin.permissions
                    }
                );

                io.emit(
                    "admins updated",
                    admins.map(
                        item => ({

                            name:
                                item.name,

                            role:
                                item.role,

                            permissions:
                                item.permissions,

                            roomIds:
                                item.roomIds || []
                        })
                    )
                );

                emitStats();

                addLog(
                    `👑 تمت إضافة الأدمن ${name}`,
                    null,
                    currentAdmin.name
                );
            }
        );

        // ====================================================
        // REMOVE ADMIN
        // ====================================================

        socket.on(
            "remove admin",
            data => {

                const currentAdmin =
                    getSocketAdmin(
                        socket
                    );

                if (
                    !currentAdmin ||
                    !isMasterAdmin(
                        currentAdmin
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية إزالة الأدمن"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getAdminByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ الأدمن غير موجود"
                    );

                    return;
                }

                if (
                    isMasterAdmin(
                        target
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا يمكن إزالة الـ Master"
                    );

                    return;
                }

                admins =
                    admins.filter(
                        item =>
                            item.name
                                .toLowerCase() !==
                            name.toLowerCase()
                    );

                saveJSON(
                    "admins.json",
                    admins
                );

                io.emit(
                    "admins updated",
                    admins.map(
                        item => ({

                            name:
                                item.name,

                            role:
                                item.role,

                            permissions:
                                item.permissions,

                            roomIds:
                                item.roomIds || []
                        })
                    )
                );

                addLog(
                    `🗑️ تمت إزالة الأدمن ${name}`,
                    null,
                    currentAdmin.name
                );
            }
        );

        // ====================================================
        // VIEW USER
        // ====================================================

        socket.on(
            "view user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "viewUserInfo"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية عرض معلومات المستخدم"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ المستخدم غير متصل"
                    );

                    return;
                }

                socket.emit(
                    "user info",
                    {

                        name:
                            target.name,

                        ip:
                            target.ip,

                        device:
                            target.device,

                        userAgent:
                            target.userAgent,

                        room:
                            target.roomId
                                ? getRoom(
                                    target.roomId
                                )?.name ||
                                target.roomId
                                : null,

                        connectedAt:
                            target.connectedAt
                    }
                );
            }
        );

        // ====================================================
        // GLOBAL KICK
        // ====================================================

        socket.on(
            "kick user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "kick"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية الطرد"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ المستخدم غير موجود"
                    );

                    return;
                }

                const targetSocket =
                    getUserSocket(
                        target
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
                    `👢 تم طرد ${target.name}`,
                    null,
                    admin.name
                );
            }
        );

        // ====================================================
        // GLOBAL BAN
        //
        // IMPORTANT:
        // This event is ONLY global.
        //
        // Room ban uses:
        // "ban room user"
        //
        // Therefore room ban can NEVER call
        // this handler.
        // ====================================================

        socket.on(
            "ban user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "ban"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية الحظر العام"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ المستخدم غير موجود"
                    );

                    return;
                }

                const already =
                    bannedUsers.some(
                        item => {

                            const n =
                                typeof item ===
                                "string"
                                    ? item
                                    : item?.name;

                            return (
                                String(
                                    n || ""
                                )
                                    .toLowerCase() ===
                                target.name
                                    .toLowerCase()
                            );
                        }
                    );

                if (!already) {

                    bannedUsers.push({

                        name:
                            target.name,

                        ip:
                            target.ip,

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

                const targetSocket =
                    getUserSocket(
                        target
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

                addLog(
                    `🚫 تم حظر ${target.name} من الدردشة العامة`,
                    null,
                    admin.name
                );

                emitStats();
            }
        );

        // ====================================================
        // GLOBAL UNBAN
        // ====================================================

        socket.on(
            "unban user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "unban"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية فك الحظر"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                bannedUsers =
                    bannedUsers.filter(
                        item => {

                            const n =
                                typeof item ===
                                "string"
                                    ? item
                                    : item?.name;

                            return (
                                String(
                                    n || ""
                                )
                                    .toLowerCase() !==
                                name.toLowerCase()
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
                        name
                    }
                );

                addLog(
                    `🔓 تم فك حظر ${name}`,
                    null,
                    admin.name
                );

                emitStats();
            }
        );

        // ====================================================
        // GLOBAL MUTE
        // ====================================================

        socket.on(
            "mute user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "mute"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية الكتم"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ المستخدم غير موجود"
                    );

                    return;
                }

                const exists =
                    isGloballyMuted(
                        target
                    );

                if (!exists) {

                    mutedUsers.push({

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

                io.emit(
                    "user muted",
                    {
                        name:
                            target.name
                    }
                );

                addLog(
                    `🔇 تم كتم ${target.name}`,
                    null,
                    admin.name
                );
            }
        );

        // ====================================================
        // GLOBAL UNMUTE
        // ====================================================

        socket.on(
            "unmute user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "unmute"
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية فك الكتم"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                mutedUsers =
                    mutedUsers.filter(
                        item => {

                            const n =
                                typeof item ===
                                "string"
                                    ? item
                                    : item?.name;

                            return (
                                String(
                                    n || ""
                                )
                                    .toLowerCase() !==
                                name.toLowerCase()
                            );
                        }
                    );

                saveJSON(
                    "muted.json",
                    mutedUsers
                );

                io.emit(
                    "user unmuted",
                    {
                        name
                    }
                );

                addLog(
                    `🔊 تم فك كتم ${name}`,
                    null,
                    admin.name
                );
            }
        );

        // ====================================================
        // GLOBAL DISCONNECT
        // ====================================================

        socket.on(
            "disconnect user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "disconnect"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية الفصل"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name,
                        100
                    );

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "admin error",
                        "❌ المستخدم غير موجود"
                    );

                    return;
                }

                const targetSocket =
                    getUserSocket(
                        target
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "disconnected",
                        "⛔ تم فصلك من الدردشة"
                    );

                    targetSocket.disconnect(
                        true
                    );
                }

                addLog(
                    `⛔ تم فصل ${target.name}`,
                    null,
                    admin.name
                );
            }
        );

        // ====================================================
        // GLOBAL GIVE STAR
        // ====================================================

        socket.on(
            "give star",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "stars"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية النجوم"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                if (!name) {
                    return;
                }

                if (
                    !stars.some(
                        item =>
                            String(
                                item
                            ).toLowerCase() ===
                            name.toLowerCase()
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

        // ====================================================
        // GLOBAL REMOVE STAR
        // ====================================================

        socket.on(
            "remove star",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "stars"
                    )
                ) {

                    socket.emit(
                        "admin error",
                        "⛔ لا تملك صلاحية النجوم"
                    );

                    return;
                }

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                stars =
                    stars.filter(
                        item =>
                            String(
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

        // ====================================================
        // ROOM BAN
        //
        // THIS IS THE IMPORTANT FIX.
        //
        // It NEVER touches bannedUsers.
        // It only modifies:
        //
        // roomModeration[roomId].banned
        // ====================================================

        socket.on(
            "ban room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
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
                    !adminHasPermission(
                        admin,
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

                const target =
                    getUserByName(
                        name
                    );

                if (!target) {

                    socket.emit(
                        "room error",
                        "❌ المستخدم غير موجود"
                    );

                    return;
                }

                // يجب أن يكون الهدف داخل نفس الغرفة
                if (
                    String(
                        target.roomId
                    ) !== roomId
                ) {

                    socket.emit(
                        "room error",
                        "❌ المستخدم ليس داخل هذه الغرفة"
                    );

                    return;
                }

                addRoomModeration(
                    roomId,
                    "banned",
                    target.name,
                    admin.name
                );

                const targetSocket =
                    getUserSocket(
                        target
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "room banned",
                        {

                            roomId,

                            message:
                                `🚫 تم حظرك من الغرفة ${room.name}`
                        }
                    );

                    removeSocketFromRoom(
                        targetSocket,
                        roomId
                    );

                    if (
                        String(
                            target.roomId
                        ) === roomId
                    ) {

                        target.roomId =
                            null;
                    }
                }

                roomNotice(
                    roomId,
                    `🚫 تم حظر ${target.name} من الغرفة`,
                    "ban"
                );

                emitRoomUsers(
                    roomId
                );

                addLog(
                    `🚫 تم حظر ${target.name} من الغرفة ${room.name}`,
                    roomId,
                    admin.name
                );

                // مهم: لا يوجد أي تعديل على bannedUsers هنا.
            }
        );

        // ====================================================
        // ROOM UNBAN
        // ====================================================

        socket.on(
            "unban room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "unban",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية فك الحظر في هذه الغرفة"
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

                addLog(
                    `🔓 تم فك حظر ${name} من الغرفة ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM MUTE
        // ====================================================

        socket.on(
            "mute room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
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

                const target =
                    getUserByName(
                        name
                    );

                if (
                    !target ||
                    String(
                        target.roomId
                    ) !== roomId
                ) {

                    socket.emit(
                        "room error",
                        "❌ المستخدم ليس داخل هذه الغرفة"
                    );

                    return;
                }

                addRoomModeration(
                    roomId,
                    "muted",
                    target.name,
                    admin.name
                );

                const targetSocket =
                    getUserSocket(
                        target
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "room muted",
                        {
                            roomId,
                            message:
                                "🔇 تم كتمك في هذه الغرفة"
                        }
                    );
                }

                roomNotice(
                    roomId,
                    `🔇 تم كتم ${target.name}`,
                    "mute"
                );

                addLog(
                    `🔇 تم كتم ${target.name} في ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM UNMUTE
        // ====================================================

        socket.on(
            "unmute room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                if (
                    !adminHasPermission(
                        admin,
                        "unmute",
                        roomId
                    )
                    &&
                    !isMasterAdmin(
                        admin
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية فك الكتم"
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

                addLog(
                    `🔊 تم فك كتم ${name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM KICK
        // ====================================================

        socket.on(
            "kick room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
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

                const target =
                    getUserByName(
                        name
                    );

                if (
                    !target ||
                    String(
                        target.roomId
                    ) !== roomId
                ) {

                    socket.emit(
                        "room error",
                        "❌ المستخدم ليس داخل هذه الغرفة"
                    );

                    return;
                }

                addRoomModeration(
                    roomId,
                    "kicked",
                    target.name,
                    admin.name
                );

                const targetSocket =
                    getUserSocket(
                        target
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "room kicked",
                        {

                            roomId,

                            message:
                                "👢 تم طردك من الغرفة"
                        }
                    );

                    removeSocketFromRoom(
                        targetSocket,
                        roomId
                    );

                    if (
                        String(
                            target.roomId
                        ) === roomId
                    ) {

                        target.roomId =
                            null;
                    }
                }

                roomNotice(
                    roomId,
                    `👢 تم طرد ${target.name} من الغرفة`,
                    "kick"
                );

                emitRoomUsers(
                    roomId
                );

                addLog(
                    `👢 تم طرد ${target.name} من ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM DISCONNECT
        // ====================================================

        socket.on(
            "disconnect room user",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
                        "disconnect",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية الفصل في هذه الغرفة"
                    );

                    return;
                }

                const target =
                    getUserByName(
                        name
                    );

                if (
                    !target ||
                    String(
                        target.roomId
                    ) !== roomId
                ) {

                    return;
                }

                addRoomModeration(
                    roomId,
                    "disconnected",
                    target.name,
                    admin.name
                );

                const targetSocket =
                    getUserSocket(
                        target
                    );

                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "room disconnected",
                        {

                            roomId,

                            message:
                                "⛔ تم فصلك من هذه الغرفة"
                        }
                    );

                    removeSocketFromRoom(
                        targetSocket,
                        roomId
                    );

                    if (
                        String(
                            target.roomId
                        ) === roomId
                    ) {

                        target.roomId =
                            null;
                    }
                }

                roomNotice(
                    roomId,
                    `⛔ تم فصل ${target.name} من الغرفة`,
                    "disconnect"
                );

                emitRoomUsers(
                    roomId
                );

                addLog(
                    `⛔ تم فصل ${target.name} من ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM GIVE STAR
        // ====================================================

        socket.on(
            "give room star",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                const room =
                    getRoom(
                        roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    !adminHasPermission(
                        admin,
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

                const list =
                    ensureRoomStars(
                        roomId
                    );

                if (
                    !list.some(
                        item =>
                            String(
                                item
                            ).toLowerCase() ===
                            name.toLowerCase()
                    )
                ) {

                    list.push(
                        name
                    );
                }

                saveJSON(
                    "roomStars.json",
                    roomStars
                );

                io.to(
                    `room:${roomId}`
                ).emit(
                    "room stars updated",
                    {

                        roomId,

                        stars:
                            list
                    }
                );

                addLog(
                    `⭐ تم إعطاء نجمة لـ ${name} في ${room.name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM REMOVE STAR
        // ====================================================

        socket.on(
            "remove room star",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const name =
                    cleanText(
                        data?.name ||
                        data?.username,
                        100
                    );

                if (
                    !adminHasPermission(
                        admin,
                        "stars",
                        roomId
                    )
                ) {

                    return;
                }

                const list =
                    ensureRoomStars(
                        roomId
                    );

                roomStars[roomId] =
                    list.filter(
                        item =>
                            String(
                                item
                            ).toLowerCase() !==
                            name.toLowerCase()
                    );

                saveJSON(
                    "roomStars.json",
                    roomStars
                );

                io.to(
                    `room:${roomId}`
                ).emit(
                    "room stars updated",
                    {

                        roomId,

                        stars:
                            roomStars[
                                roomId
                            ]
                    }
                );

                addLog(
                    `⭐ تم إزالة نجمة ${name}`,
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ROOM CLEAR MESSAGES
        // ====================================================

        socket.on(
            "clear room messages",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                if (
                    !adminHasPermission(
                        admin,
                        "clear",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية مسح رسائل الغرفة"
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
                    "room messages cleared",
                    {
                        roomId
                    }
                );

                addLog(
                    "🧹 تم مسح رسائل الغرفة",
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // DELETE ROOM MESSAGE
        // ====================================================

        socket.on(
            "delete room message",
            data => {

                const admin =
                    getSocketAdmin(
                        socket
                    );

                if (!admin) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                const messageId =
                    String(
                        data?.messageId ||
                        ""
                    );

                if (
                    !adminHasPermission(
                        admin,
                        "deleteMessage",
                        roomId
                    )
                ) {

                    socket.emit(
                        "room error",
                        "⛔ لا تملك صلاحية حذف الرسالة"
                    );

                    return;
                }

                const list =
                    ensureRoomMessages(
                        roomId
                    );

                roomMessages[
                    roomId
                ] =
                    list.filter(
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
                    "room message deleted",
                    {

                        roomId,

                        messageId
                    }
                );

                addLog(
                    "🗑️ تم حذف رسالة",
                    roomId,
                    admin.name
                );
            }
        );

        // ====================================================
        // ADMIN LOGOUT
        // ====================================================

        socket.on(
            "admin logout",
            () => {

                socket.adminData =
                    null;
            }
        );

        // ====================================================
        // PART 2 CONTINUES IN PART 3
        // ====================================================
    }
);

// ============================================================
// END OF PART 2
// ============================================================
// PART 3 MUST BE ADDED AFTER THIS LINE.
// ============================================================
// ============================================================
// MERSAL CHAT - SERVER.JS
// PART 3 / 3
// ============================================================

// ============================================================
// USER CONNECTION / LOGIN / ROOMS / CHAT / PRIVATE
// ============================================================

io.on(
    "connection",
    socket => {

        // ====================================================
        // LOGIN / JOIN WEBSITE
        // ====================================================

        socket.on(
            "join",
            data => {

                const username =
                    cleanText(
                        data?.username,
                        MAX_USERNAME_LENGTH
                    );

                if (!username) {

                    socket.emit(
                        "banned",
                        "❌ اكتب اسم المستخدم"
                    );

                    return;
                }

                // --------------------------------------------
                // منع الأسماء المحجوزة
                // --------------------------------------------

                const lowerName =
                    username.toLowerCase();

                if (
                    lowerName === "&" ||
                    lowerName === "@" ||
                    lowerName.startsWith("&") ||
                    lowerName.startsWith("@")
                ) {

                    socket.emit(
                        "banned",
                        "⛔ هذا الاسم غير مسموح"
                    );

                    return;
                }

                // --------------------------------------------
                // منع تقليد أسماء الأدمن
                // --------------------------------------------

                const adminWithSameName =
                    getAdminByName(
                        username
                    );

                if (
                    adminWithSameName
                ) {

                    const password =
                        String(
                            data?.adminPassword ||
                            ""
                        );

                    if (
                        password !==
                        String(
                            adminWithSameName.password ||
                            ""
                        )
                    ) {

                        socket.emit(
                            "banned",
                            "🚫 هذا الاسم محجوز"
                        );

                        return;
                    }

                    socket.adminData =
                        adminWithSameName;
                }

                // --------------------------------------------
                // منع الاسم المكرر
                // --------------------------------------------

                const duplicate =
                    users.some(
                        user =>
                            String(
                                user.name ||
                                user.username ||
                                ""
                            ).toLowerCase() ===
                            lowerName
                    );

                if (duplicate) {

                    socket.emit(
                        "banned",
                        "⚠️ الاسم مستخدم حاليًا"
                    );

                    return;
                }

                // --------------------------------------------
                // IP
                // --------------------------------------------

                const ip =
                    String(
                        socket.handshake.address ||
                        ""
                    );

                // --------------------------------------------
                // DEVICE
                // --------------------------------------------

                const device =
                    String(
                        data?.deviceToken ||
                        socket.handshake.headers[
                            "user-agent"
                        ] ||
                        ""
                    );

                // --------------------------------------------
                // GLOBAL DEVICE BAN
                // --------------------------------------------

                if (
                    isDeviceBanned(
                        device
                    )
                ) {

                    socket.emit(
                        "banned",
                        "⛔ جهازك محظور"
                    );

                    return;
                }

                // --------------------------------------------
                // GLOBAL BAN
                // --------------------------------------------

                if (
                    isGloballyBanned(
                        username,
                        ip
                    )
                ) {

                    socket.emit(
                        "banned",
                        "🚫 أنت محظور من الدردشة"
                    );

                    return;
                }

                // --------------------------------------------
                // USER
                // --------------------------------------------

                const admin =
                    socket.adminData ||
                    getAdminByName(
                        username
                    );

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

                    userAgent:
                        String(
                            socket.handshake.headers[
                                "user-agent"
                            ] ||
                            ""
                        ),

                    isAdmin:
                        Boolean(
                            admin
                        ),

                    role:
                        admin
                            ? (
                                isMasterAdmin(
                                    admin
                                )
                                    ? "master"
                                    : "moderator"
                            )
                            : "user",

                    roomId:
                        null,

                    connectedAt:
                        Date.now()
                };

                users.push(
                    user
                );

                socket.username =
                    username;

                socket.userId =
                    user.id;

                socket.openRooms =
                    [];

                socket.currentRoom =
                    null;

                // --------------------------------------------
                // LOGIN SUCCESS
                // --------------------------------------------

                socket.emit(
                    "login success",
                    publicUser(
                        user
                    )
                );

                // --------------------------------------------
                // SEND ROOMS
                // --------------------------------------------

                socket.emit(
                    "rooms",
                    getPublicRooms()
                );

                socket.emit(
                    "room list",
                    getPublicRooms()
                );

                // --------------------------------------------
                // ONLINE USERS
                // --------------------------------------------

                emitOnlineUsers();

                // --------------------------------------------
                // LOG
                // --------------------------------------------

                addLog(
                    `👤 ${username} دخل الدردشة`
                );
            }
        );

        // ====================================================
        // GET ROOMS
        // ====================================================

        socket.on(
            "get rooms",
            () => {

                socket.emit(
                    "rooms",
                    getPublicRooms()
                );

                socket.emit(
                    "room list",
                    getPublicRooms()
                );
            }
        );

        // ====================================================
        // JOIN / OPEN ROOM
        //
        // Maximum 3 open rooms.
        // ====================================================

        socket.on(
            "join room",
            data => {

                const user =
                    getUserBySocket(
                        socket
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
                        "⛔ هذه الغرفة متوقفة حاليًا"
                    );

                    return;
                }

                ensureRoomModeration(
                    roomId
                );

                ensureRoomMessages(
                    roomId
                );

                ensureRoomStars(
                    roomId
                );

                // --------------------------------------------
                // ROOM BAN
                // --------------------------------------------

                if (
                    isRoomBanned(
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

                // --------------------------------------------
                // ROOM DISCONNECT
                // --------------------------------------------

                if (
                    isRoomDisconnected(
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

                // --------------------------------------------
                // MAINTENANCE
                // --------------------------------------------

                if (
                    room.settings?.maintenance
                    &&
                    !user.isAdmin
                ) {

                    socket.emit(
                        "room error",
                        "🛠️ الغرفة في وضع الصيانة"
                    );

                    return;
                }

                // --------------------------------------------
                // MAX 3 OPEN ROOMS
                // --------------------------------------------

                if (
                    !Array.isArray(
                        socket.openRooms
                    )
                ) {

                    socket.openRooms =
                        [];
                }

                const alreadyOpen =
                    socket.openRooms
                        .map(String)
                        .includes(
                            String(roomId)
                        );

                if (
                    !alreadyOpen &&
                    socket.openRooms.length >=
                    MAX_OPEN_ROOMS
                ) {

                    socket.emit(
                        "room error",
                        "⚠️ يمكنك فتح 3 غرف فقط في نفس الوقت"
                    );

                    return;
                }

                // --------------------------------------------
                // ADD ROOM
                // --------------------------------------------

                if (!alreadyOpen) {

                    socket.openRooms.push(
                        roomId
                    );

                    socket.join(
                        `room:${roomId}`
                    );
                }

                // --------------------------------------------
                // CURRENT ROOM
                // --------------------------------------------

                socket.currentRoom =
                    roomId;

                user.roomId =
                    roomId;

                // --------------------------------------------
                // IS ROOM ADMIN?
                // --------------------------------------------

                const admin =
                    getSocketAdmin(
                        socket
                    );

                const roomAdmin =
                    Boolean(
                        admin &&
                        adminHasRoomAccess(
                            admin,
                            roomId
                        )
                    );

                // --------------------------------------------
                // ROOM JOINED
                // --------------------------------------------

                socket.emit(
                    "room joined",
                    {

                        room,

                        roomId,

                        username:
                            user.name,

                        isAdmin:
                            roomAdmin,

                        isMaster:
                            Boolean(
                                admin &&
                                isMasterAdmin(
                                    admin
                                )
                            ),

                        muted:
                            isRoomMuted(
                                roomId,
                                user.name
                            ),

                        settings:
                            room.settings,

                        stars:
                            ensureRoomStars(
                                roomId
                            )
                    }
                );

                // --------------------------------------------
                // ROOM HISTORY
                // --------------------------------------------

                socket.emit(
                    "room history",
                    {

                        roomId,

                        messages:
                            ensureRoomMessages(
                                roomId
                            )
                    }
                );

                // --------------------------------------------
                // ADMIN NOTICE
                // --------------------------------------------

                if (
                    roomAdmin &&
                    user.name
                ) {

                    socket.emit(
                        "room notice",
                        {

                            roomId,

                            type:
                                "admin assigned",

                            message:
                                `✨ تم توكيل ${user.name}`,

                            timestamp:
                                Date.now()
                        }
                    );
                }

                // --------------------------------------------
                // ROOM USERS
                // --------------------------------------------

                emitRoomUsers(
                    roomId
                );

                // --------------------------------------------
                // ROOM STARS
                // --------------------------------------------

                socket.emit(
                    "room stars updated",
                    {

                        roomId,

                        stars:
                            ensureRoomStars(
                                roomId
                            )
                    }
                );

                addLog(
                    `🚪 ${user.name} دخل الغرفة ${room.name}`,
                    roomId,
                    user.name
                );
            }
        );

        // ====================================================
        // SWITCH CURRENT ROOM
        // ====================================================

        socket.on(
            "switch room",
            data => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        ""
                    );

                if (
                    !Array.isArray(
                        socket.openRooms
                    )
                ) {
                    return;
                }

                if (
                    !socket.openRooms
                        .map(String)
                        .includes(
                            roomId
                        )
                ) {

                    socket.emit(
                        "room error",
                        "❌ هذه الغرفة ليست مفتوحة"
                    );

                    return;
                }

                socket.currentRoom =
                    roomId;

                user.roomId =
                    roomId;

                socket.emit(
                    "room switched",
                    {
                        roomId
                    }
                );

                emitRoomUsers(
                    roomId
                );
            }
        );

        // ====================================================
        // LEAVE / CLOSE ROOM
        // ====================================================

        socket.on(
            "leave room",
            data => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                if (!roomId) {
                    return;
                }

                socket.leave(
                    `room:${roomId}`
                );

                socket.openRooms =
                    (
                        Array.isArray(
                            socket.openRooms
                        )
                            ? socket.openRooms
                            : []
                    ).filter(
                        id =>
                            String(id) !==
                            roomId
                    );

                if (
                    String(
                        socket.currentRoom
                    ) === roomId
                ) {

                    socket.currentRoom =
                        socket.openRooms.length
                            ? String(
                                socket.openRooms[
                                    socket.openRooms.length - 1
                                ]
                            )
                            : null;

                    user.roomId =
                        socket.currentRoom;
                }

                emitRoomUsers(
                    roomId
                );

                socket.emit(
                    "room left",
                    {
                        roomId
                    }
                );
            }
        );

        // ====================================================
        // GET ROOM USERS
        // ====================================================

        socket.on(
            "get room users",
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

                socket.emit(
                    "room users",
                    getRoomUsers(
                        roomId
                    )
                );
            }
        );

        // ====================================================
        // PUBLIC ROOM CHAT
        // ====================================================

        socket.on(
            "chat message",
            data => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

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

                // --------------------------------------------
                // GLOBAL DISCONNECT
                // --------------------------------------------

                if (
                    globalDisconnect &&
                    !user.isAdmin
                ) {

                    socket.emit(
                        "chat error",
                        "⛔ أنت مفصول عن الدردشة العامة"
                    );

                    return;
                }

                // --------------------------------------------
                // ROOM BAN
                // --------------------------------------------

                if (
                    isRoomBanned(
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

                // --------------------------------------------
                // ROOM MUTE
                // --------------------------------------------

                if (
                    isRoomMuted(
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

                // --------------------------------------------
                // ROOM MAINTENANCE
                // --------------------------------------------

                if (
                    room.settings?.maintenance
                    &&
                    !user.isAdmin
                ) {

                    socket.emit(
                        "chat error",
                        "🛠️ الغرفة في وضع الصيانة"
                    );

                    return;
                }

                // --------------------------------------------
                // ROOM CHAT LOCK
                // --------------------------------------------

                if (
                    room.settings?.chatLock
                    &&
                    !user.isAdmin
                ) {

                    socket.emit(
                        "chat error",
                        "🔒 الدردشة مقفلة في هذه الغرفة"
                    );

                    return;
                }

                // --------------------------------------------
                // ROOM STARS MODE
                // --------------------------------------------

                if (
                    room.settings?.starsMode
                    &&
                    !user.isAdmin
                ) {

                    const roomStarList =
                        ensureRoomStars(
                            roomId
                        );

                    const hasStar =
                        roomStarList.some(
                            name =>
                                String(
                                    name
                                ).toLowerCase() ===
                                String(
                                    user.name
                                ).toLowerCase()
                        );

                    if (!hasStar) {

                        socket.emit(
                            "chat error",
                            "⭐ الكتابة لأصحاب النجمة فقط"
                        );

                        return;
                    }
                }

                // --------------------------------------------
                // MESSAGE
                // --------------------------------------------

                const message =
                    cleanText(
                        data?.message,
                        MAX_MESSAGE_LENGTH
                    );

                if (!message) {
                    return;
                }

                const payload = {

                    id:
                        makeId(
                            "msg"
                        ),

                    roomId,

                    username:
                        user.name,

                    name:
                        user.name,

                    color:
                        user.color,

                    message,

                    reply:
                        data?.reply ||
                        null,

                    timestamp:
                        Date.now()
                };

                // --------------------------------------------
                // SAVE HISTORY
                // --------------------------------------------

                const history =
                    ensureRoomMessages(
                        roomId
                    );

                history.push(
                    payload
                );

                if (
                    history.length > 500
                ) {

                    history.splice(
                        0,
                        history.length -
                        500
                    );
                }

                saveJSON(
                    "roomMessages.json",
                    roomMessages
                );

                // --------------------------------------------
                // SEND TO ROOM ONLY
                // --------------------------------------------

                io.to(
                    `room:${roomId}`
                ).emit(
                    "chat message",
                    payload
                );
            }
        );

        // ====================================================
        // ROOM TYPING
        // ====================================================

        socket.on(
            "room typing",
            data => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                const roomId =
                    String(
                        data?.roomId ||
                        socket.currentRoom ||
                        ""
                    );

                if (!roomId) {
                    return;
                }

                socket.to(
                    `room:${roomId}`
                ).emit(
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
        );

        // ====================================================
        // PRIVATE MESSAGE
        // ====================================================

        socket.on(
            "private message",
            data => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                if (
                    globalPrivateLocked &&
                    !user.isAdmin
                ) {

                    socket.emit(
                        "private error",
                        "🔒 المحادثات الخاصة مقفلة"
                    );

                    return;
                }

                const message =
                    cleanText(
                        data?.message,
                        MAX_MESSAGE_LENGTH
                    );

                if (!message) {
                    return;
                }

                let targetSocket =
                    null;

                const targetId =
                    String(
                        data?.to ||
                        data?.socketId ||
                        ""
                    );

                if (
                    targetId
                ) {

                    targetSocket =
                        io.sockets.sockets.get(
                            targetId
                        );
                }

                // إذا أرسل الاسم بدل socket id
                if (
                    !targetSocket &&
                    data?.username
                ) {

                    const targetUser =
                        getUserByName(
                            data.username
                        );

                    if (
                        targetUser
                    ) {

                        targetSocket =
                            getUserSocket(
                                targetUser
                            );
                    }
                }

                if (!targetSocket) {

                    socket.emit(
                        "private error",
                        "❌ المستخدم غير متصل"
                    );

                    return;
                }

                if (
                    targetSocket.id ===
                    socket.id
                ) {

                    return;
                }

                const privatePayload = {

                    id:
                        makeId(
                            "pm"
                        ),

                    from:
                        socket.id,

                    fromName:
                        user.name,

                    username:
                        user.name,

                    to:
                        targetSocket.id,

                    toName:
                        targetSocket.username,

                    message,

                    reply:
                        data?.reply ||
                        null,

                    timestamp:
                        Date.now()
                };

                // الطرف المستقبل
                targetSocket.emit(
                    "private message",
                    privatePayload
                );

                // الطرف المرسل أيضًا
                socket.emit(
                    "private message",
                    privatePayload
                );
            }
        );

        // ====================================================
        // GET CURRENT USER
        // ====================================================

        socket.on(
            "get current user",
            () => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                socket.emit(
                    "current user",
                    publicUser(
                        user
                    )
                );
            }
        );

        // ====================================================
        // GLOBAL CONTROL STATE
        // ====================================================

        socket.on(
            "get global state",
            () => {

                socket.emit(
                    "global state",
                    {

                        chatLocked:
                            globalChatLocked,

                        privateLocked:
                            globalPrivateLocked,

                        maintenance:
                            globalMaintenance,

                        starsMode:
                            globalStarsMode,

                        disconnected:
                            globalDisconnect
                    }
                );
            }
        );

        // ====================================================
        // DISCONNECT
        // ====================================================

        socket.on(
            "disconnect",
            () => {

                const user =
                    getUserBySocket(
                        socket
                    );

                if (!user) {
                    return;
                }

                const openedRooms =
                    Array.isArray(
                        socket.openRooms
                    )
                        ? [
                            ...socket.openRooms
                        ]
                        : [];

                openedRooms.forEach(
                    roomId => {

                        socket.leave(
                            `room:${roomId}`
                        );

                        emitRoomUsers(
                            roomId
                        );
                    }
                );

                users =
                    users.filter(
                        item =>
                            item.id !==
                            socket.id
                    );

                emitOnlineUsers();

                addLog(
                    `👋 ${user.name} خرج من الدردشة`
                );
            }
        );
    }
);

// ============================================================
// GLOBAL CONTROL PAGE
// ============================================================

app.get(
    "/global-control-7xK9",
    (req, res) => {

        res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>Mersal Global Control</title>

<style>

*{
box-sizing:border-box;
}

body{
margin:0;
background:#090b10;
color:#fff;
font-family:Arial,sans-serif;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
padding:20px;
}

.box{
width:100%;
max-width:500px;
background:#151922;
border:1px solid #303746;
border-radius:20px;
padding:25px;
box-shadow:0 20px 60px rgba(0,0,0,.5);
}

h1{
text-align:center;
margin-top:0;
}

input{
width:100%;
padding:14px;
border-radius:10px;
border:1px solid #444;
background:#0d1016;
color:#fff;
font-size:16px;
margin-bottom:15px;
}

button{
width:100%;
padding:14px;
border:0;
border-radius:10px;
margin-top:10px;
font-size:16px;
font-weight:bold;
cursor:pointer;
}

.red{
background:#b52a2a;
color:#fff;
}

.green{
background:#27844a;
color:#fff;
}

.gray{
background:#333b48;
color:#fff;
}

#panel{
display:none;
}

.status{
padding:14px;
border-radius:10px;
background:#0d1016;
margin:15px 0;
text-align:center;
}

</style>

</head>

<body>

<div class="box">

<h1>🌐 Mersal Global Control</h1>

<div id="login">

<input
id="password"
type="password"
placeholder="كلمة المرور"
autocomplete="off"
>

<button
class="gray"
onclick="login()"
>
دخول
</button>

</div>

<div id="panel">

<div
id="status"
class="status"
>
جارٍ التحميل...
</div>

<button
class="red"
onclick="setDisconnect(true)"
>
⛔ فصل الدردشة العامة
</button>

<button
class="green"
onclick="setDisconnect(false)"
>
🔓 إلغاء الفصل
</button>

<button
class="red"
onclick="setChatLock(true)"
>
🔒 قفل الدردشة العامة
</button>

<button
class="green"
onclick="setChatLock(false)"
>
🔓 إلغاء قفل الدردشة
</button>

</div>

</div>

<script>

let token="";

function login(){

const password =
document.getElementById(
"password"
).value;

fetch(
"/global-control-7xK9/login",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
password
})
}
)
.then(r=>r.json())
.then(data=>{

if(!data.success){

alert(
"❌ كلمة المرور غير صحيحة"
);

return;
}

token =
data.token;

document.getElementById(
"login"
).style.display="none";

document.getElementById(
"panel"
).style.display="block";

updateStatus();

})
.catch(()=>{

alert(
"❌ حدث خطأ في الاتصال"
);

});

}

function setDisconnect(value){

fetch(
"/global-control-7xK9/action",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({

token,

action:
"disconnect",

value

})
}
)
.then(r=>r.json())
.then(()=>updateStatus());

}

function setChatLock(value){

fetch(
"/global-control-7xK9/action",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({

token,

action:
"chatLock",

value

})
}
)
.then(r=>r.json())
.then(()=>updateStatus());

}

function updateStatus(){

fetch(
"/api/status"
)
.then(r=>r.json())
.then(data=>{

document.getElementById(
"status"
).innerHTML =

"👥 المتصلون: " +
(data.onlineUsers || 0) +

"<br><br>" +

"⛔ الفصل العام: " +
(data.globalDisconnect
? "مفعّل"
: "غير مفعّل") +

"<br>" +

"🔒 قفل الدردشة: " +
(data.globalChatLocked
? "مفعّل"
: "غير مفعّل");

});

}

</script>

</body>

</html>`);
    }
);

// ============================================================
// GLOBAL CONTROL LOGIN
// ============================================================

const globalSessions =
    new Set();

app.post(
    "/global-control-7xK9/login",
    (req, res) => {

        const password =
            String(
                req.body?.password ||
                ""
            );

        if (
            password !==
            GLOBAL_CONTROL_PASSWORD
        ) {

            return res.json({
                success:false
            });
        }

        const token =
            makeId(
                "global"
            );

        globalSessions.add(
            token
        );

        res.json({

            success:true,

            token
        });
    }
);

// ============================================================
// GLOBAL CONTROL ACTION
// ============================================================

app.post(
    "/global-control-7xK9/action",
    (req, res) => {

        const token =
            String(
                req.body?.token ||
                ""
            );

        if (
            !globalSessions.has(
                token
            )
        ) {

            return res.status(
                401
            ).json({

                success:false,

                message:
                    "Unauthorized"
            });
        }

        const action =
            String(
                req.body?.action ||
                ""
            );

        const value =
            Boolean(
                req.body?.value
            );

        if (
            action ===
            "disconnect"
        ) {

            globalDisconnect =
                value;

            io.emit(
                "global disconnect changed",
                {
                    value
                }
            );

            addLog(
                value
                    ? "⛔ تم فصل الدردشة العامة"
                    : "🔓 تم إلغاء فصل الدردشة العامة"
            );
        }

        if (
            action ===
            "chatLock"
        ) {

            globalChatLocked =
                value;

            io.emit(
                "global chat lock changed",
                {
                    value
                }
            );

            addLog(
                value
                    ? "🔒 تم قفل الدردشة العامة"
                    : "🔓 تم إلغاء قفل الدردشة العامة"
            );
        }

        res.json({

            success:true,

            globalDisconnect,

            globalChatLocked
        });
    }
);

// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(
            404
        ).send(
            "Mersal Chat - 404"
        );
    }
);

// ============================================================
// START SERVER
// ============================================================

const PORT =
    process.env.PORT ||
    3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🚀 Mersal Chat running on port ${PORT}`
        );

        console.log(
            "🏠 Rooms system: ON"
        );

        console.log(
            "🛡️ Room moderation: ON"
        );

        console.log(
            "⭐ Per-room stars: ON"
        );

        console.log(
            "🌐 Global control: ON"
        );
    }
);

// ============================================================
// END OF SERVER.JS
// ============================================================
