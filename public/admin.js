const socket = io();

/* =========================================================
   MERSAL ADMIN PANEL
   ========================================================= */

let adminPermissions = {};
let loggedIn = false;

/* =========================================================
   ELEMENTS
   ========================================================= */

const loginPage = document.getElementById("adminLogin");
const panel = document.getElementById("adminPanel");

const onlineUsers = document.getElementById("onlineUsers");
const logsBox = document.getElementById("logsBox");
const statsBox = document.getElementById("statsBox");

/* =========================================================
   HELPERS
   ========================================================= */

function el(id) {
    return document.getElementById(id);
}

function safeText(value) {
    return String(value ?? "");
}

function addLog(text) {

    if (!logsBox) return;

    const div = document.createElement("div");

    div.className = "log-item";
    div.innerText = safeText(text);

    logsBox.prepend(div);
}

/* =========================================================
   SOCKET STATUS
   ========================================================= */

socket.on("connect", () => {

    console.log("Mersal Admin connected:", socket.id);

});

socket.on("connect_error", error => {

    console.error("Admin Socket.IO error:", error);

    if (!loggedIn) {

        alert(
            "⚠️ تعذر الاتصال بالخادم.\n" +
            "أعد تحميل الصفحة وحاول مرة أخرى."
        );

    }

});

/* =========================================================
   LOGIN
   ========================================================= */

function loginAdmin() {

    const nameElement = el("adminName");
    const passwordElement = el("adminPass");

    if (!nameElement || !passwordElement) {

        alert("❌ حقول تسجيل الدخول غير موجودة.");

        return;
    }

    const name = nameElement.value.trim();
    const password = passwordElement.value.trim();

    if (!name || !password) {

        alert("❌ أدخل اسم الإدارة وكلمة السر.");

        return;
    }

    if (!socket.connected) {

        alert(
            "⚠️ الاتصال بالخادم لم يكتمل بعد.\n" +
            "انتظر ثانية ثم اضغط دخول."
        );

        return;
    }

    socket.emit(
        "admin panel login",
        {
            name: name,
            password: password
        }
    );

}

/*
   مهم جدًا لأن زر HTML يستخدم:
   onclick="loginAdmin()"
*/
window.loginAdmin = loginAdmin;

/* =========================================================
   LOGIN SUCCESS
   ========================================================= */

socket.on(
    "admin login success",
    data => {

        loggedIn = true;

        adminPermissions =
            data?.permissions || {};

        if (loginPage) {

            loginPage.style.display = "none";

        }

        if (panel) {

            panel.style.display = "flex";

        }

        addLog("✅ تم تسجيل الدخول إلى لوحة الإدارة");

        /*
           نطلب البيانات مرة ثانية للتأكد أن اللوحة
           تظهر حتى لو وصلت الأحداث بسرعة.
        */

        socket.emit("get online users");

        socket.emit("get stats");

        socket.emit("get logs");

        socket.emit("get admins");

    }
);

/* =========================================================
   LOGIN FAILED
   ========================================================= */

socket.on(
    "admin login failed",
    () => {

        loggedIn = false;

        alert("❌ اسم الإدارة أو كلمة السر غير صحيحة.");

    }
);

/* =========================================================
   ONLINE USERS
   ========================================================= */

socket.on(
    "admin online users",
    users => {

        renderUsers(users || []);

    }
);

function renderUsers(users) {

    if (!onlineUsers) return;

    onlineUsers.innerHTML = "";

    if (!users.length) {

        onlineUsers.innerHTML =
            "<div class='user-card'>لا يوجد مستخدمون متصلون حاليًا.</div>";

        return;
    }

    users.forEach(user => {

        const div =
            document.createElement("div");

        div.className = "user-card";

        let buttons = "";

        /* USER INFO */

        if (adminPermissions.viewUserInfo) {

            buttons += `
                <button onclick="viewUser('${safeText(user.id)}')">
                    ℹ️ معلومات
                </button>
            `;

        }

        /* KICK */

        if (adminPermissions.kick) {

            buttons += `
                <button onclick="kickUser('${safeText(user.id)}')">
                    ⚠️ طرد
                </button>
            `;

        }

        /* BAN */

        if (adminPermissions.ban) {

            buttons += `
                <button onclick="banUser('${safeText(user.id)}')">
                    🚫 حظر
                </button>
            `;

        }

        /* UNBAN */

        if (adminPermissions.unban) {

            buttons += `
                <button onclick="unbanUser('${safeText(user.id)}')">
                    🔓 فك حظر
                </button>
            `;

        }

        /* MUTE */

        if (adminPermissions.mute) {

            buttons += `
                <button onclick="muteUser('${safeText(user.id)}')">
                    🔇 كتم
                </button>
            `;

        }

        /* UNMUTE */

        if (adminPermissions.unmute) {

            buttons += `
                <button onclick="unmuteUser('${safeText(user.id)}')">
                    🔊 فك كتم
                </button>
            `;

        }

        /* DISCONNECT */

        if (adminPermissions.disconnect) {

            buttons += `
                <button onclick="disconnectUser('${safeText(user.id)}')">
                    ⛔ فصل
                </button>
            `;

        }

        /* UNDISCONNECT */

        if (adminPermissions.undisconnect) {

            buttons += `
                <button onclick="undisconnectUser('${safeText(user.id)}')">
                    ⛔🔓 فك فصل
                </button>
            `;

        }

        /* STARS */

        if (adminPermissions.stars) {

            buttons += `
                <button onclick="giveStar('${safeText(user.username)}')">
                    ⭐ نجمة
                </button>

                <button onclick="removeStar('${safeText(user.username)}')">
                    ⭐❌ سحب النجمة
                </button>
            `;

        }

        div.innerHTML = `
            <div>
                👤 ${safeText(user.username)}
            </div>

            <div class="user-actions">
                ${buttons}
            </div>
        `;

        onlineUsers.appendChild(div);

    });

}

/* =========================================================
   USER INFO
   ========================================================= */

function viewUser(id) {

    socket.emit(
        "view user",
        id
    );

}

window.viewUser = viewUser;

socket.on(
    "user info",
    user => {

        if (!user) return;

        alert(
            `👤 ${user.username}\n\n` +
            `🌐 ${user.ip}\n\n` +
            `📱 ${user.device}\n\n` +
            `🎨 ${user.color}\n\n` +
            `🆔 ${user.id}`
        );

    }
);

/* =========================================================
   USER ACTIONS
   ========================================================= */

function kickUser(id) {

    socket.emit(
        "kick user",
        id
    );

}

window.kickUser = kickUser;


function banUser(id) {

    socket.emit(
        "ban user",
        id
    );

}

window.banUser = banUser;


function unbanUser(id) {

    socket.emit(
        "unban user",
        id
    );

}

window.unbanUser = unbanUser;


function muteUser(id) {

    socket.emit(
        "mute user",
        id
    );

}

window.muteUser = muteUser;


function unmuteUser(id) {

    socket.emit(
        "unmute user",
        id
    );

    setTimeout(
        loadMutedList,
        500
    );

}

window.unmuteUser = unmuteUser;


function disconnectUser(id) {

    socket.emit(
        "disconnect user",
        id
    );

}

window.disconnectUser = disconnectUser;


function undisconnectUser(id) {

    socket.emit(
        "undisconnect user",
        id
    );

    setTimeout(
        loadDisconnectedList,
        500
    );

}

window.undisconnectUser = undisconnectUser;

/* =========================================================
   STARS
   ========================================================= */

function giveStar(username) {

    socket.emit(
        "give star",
        username
    );

}

window.giveStar = giveStar;


function removeStar(username) {

    socket.emit(
        "remove star",
        username
    );

}

window.removeStar = removeStar;

/* =========================================================
   CHAT CONTROLS
   ========================================================= */

function unbanAll() {

    socket.emit("unban all");

    setTimeout(
        loadBannedList,
        500
    );

}

window.unbanAll = unbanAll;


function unmuteAll() {

    socket.emit("unmute all");

    setTimeout(
        loadMutedList,
        500
    );

}

window.unmuteAll = unmuteAll;


function undisconnectAll() {

    socket.emit("undisconnect all");

    setTimeout(
        loadDisconnectedList,
        500
    );

}

window.undisconnectAll = undisconnectAll;


function clearChat() {

    socket.emit("clear chat");

}

window.clearChat = clearChat;


function toggleChatLock() {

    socket.emit("toggle chat lock");

}

window.toggleChatLock = toggleChatLock;


function togglePrivateLock() {

    socket.emit("toggle private lock");

}

window.togglePrivateLock = togglePrivateLock;


function toggleMaintenance() {

    socket.emit("maintenance mode");

}

window.toggleMaintenance = toggleMaintenance;


function toggleStarsMode() {

    socket.emit("toggle stars mode");

}

window.toggleStarsMode = toggleStarsMode;

/* =========================================================
   ADD ADMIN
   ========================================================= */

function getChecked(id) {

    const element = el(id);

    return element
        ? element.checked
        : false;

}

function addAdmin() {

    const name =
        el("newAdminName")?.value.trim() || "";

    const password =
        el("newAdminPassword")?.value.trim() || "";

    if (!name || !password) {

        alert("❌ أدخل اسم الأدمن وكلمة السر.");

        return;
    }

    const permissions = {

        kick:
            getChecked("permKick"),

        ban:
            getChecked("permBan"),

        unban:
            getChecked("permUnban"),

        mute:
            getChecked("permMute"),

        unmute:
            getChecked("permUnmute"),

        disconnect:
            getChecked("permDisconnect"),

        undisconnect: true,

        deleteMessage:
            getChecked("permDeleteMessage"),

        viewUserInfo:
            getChecked("permViewUser"),

        stars:
            getChecked("permStars"),

        chatLock:
            getChecked("permChatLock"),

        privateLock:
            getChecked("permPrivateLock"),

        maintenance:
            getChecked("permMaintenance"),

        protection:
            getChecked("permProtection"),

        addAdmin:
            getChecked("permAddAdmin")

    };

    socket.emit(
        "add admin",
        {
            name,
            password,
            permissions
        }
    );

}

window.addAdmin = addAdmin;

/* =========================================================
   ADMIN EVENTS
   ========================================================= */

socket.on(
    "admin added",
    () => {

        alert("✅ تمت إضافة الأدمن.");

        socket.emit("get admins");

    }
);


socket.on(
    "admin exists",
    () => {

        alert("⚠️ هذا الأدمن موجود مسبقًا.");

    }
);


/* =========================================================
   ADMINS LIST
   ========================================================= */

socket.on(
    "admins list",
    admins => {

        const box =
            el("adminsList");

        if (!box) return;

        box.innerHTML = "";

        (admins || []).forEach(admin => {

            const div =
                document.createElement("div");

            div.className =
                "user-card";

            div.innerHTML = `
                <div>
                    👮 ${safeText(admin.name)}
                </div>

                <button
                    onclick="removeAdmin('${safeText(admin.name)}')"
                >
                    🗑️ إزالة
                </button>
            `;

            box.appendChild(div);

        });

    }
);


function removeAdmin(name) {

    if (
        !confirm(
            `هل تريد حذف الأدمن ${name}؟`
        )
    ) {

        return;
    }

    socket.emit(
        "remove admin",
        name
    );

}

window.removeAdmin = removeAdmin;

/* =========================================================
   STATS
   ========================================================= */

socket.on(
    "server stats",
    stats => {

        if (!statsBox) return;

        statsBox.innerHTML = `
            👥 المتصلون:
            <strong>${stats?.onlineUsers ?? 0}</strong>
            &nbsp;&nbsp;

            🚫 المحظورون:
            <strong>${stats?.bannedUsers ?? 0}</strong>
            &nbsp;&nbsp;

            👮 الأدمنية:
            <strong>${stats?.admins ?? 0}</strong>
        `;

    }
);

/* =========================================================
   LOGS
   ========================================================= */

socket.on(
    "new log",
    log => {

        if (!log) return;

        addLog(
            log.message ||
            log.text ||
            ""
        );

    }
);

socket.on(
    "admin logs",
    logs => {

        if (!logsBox) return;

        logsBox.innerHTML = "";

        (logs || []).forEach(log => {

            addLog(
                log.message ||
                log.text ||
                ""
            );

        });

    }
);

/* =========================================================
   BANNED LIST
   ========================================================= */

async function loadBannedList() {

    const box =
        el("bannedList");

    if (!box) return;

    try {

        const response =
            await fetch(
                "/banned.json",
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                "HTTP " + response.status
            );

        }

        const data =
            await response.json();

        box.innerHTML = "";

        (data || []).forEach(ban => {

            const div =
                document.createElement("div");

            div.className =
                "user-card";

            div.innerHTML = `
                <div>
                    🚫 ${safeText(ban.ip)}
                </div>

                <button
                    onclick="unbanIp('${safeText(ban.ip)}')"
                >
                    🔓 فك
                </button>
            `;

            box.appendChild(div);

        });

    } catch (error) {

        console.error(
            "Banned list error:",
            error
        );

    }

}


function unbanIp(ip) {

    socket.emit(
        "unban ip",
        ip
    );

    setTimeout(
        loadBannedList,
        500
    );

}

window.unbanIp = unbanIp;

/* =========================================================
   MUTED LIST
   ========================================================= */

async function loadMutedList() {

    const box =
        el("mutedList");

    if (!box) return;

    try {

        const response =
            await fetch(
                "/muted.json",
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                "HTTP " + response.status
            );

        }

        const data =
            await response.json();

        box.innerHTML = "";

        (data || []).forEach(user => {

            const div =
                document.createElement("div");

            div.className =
                "user-card";

            div.innerHTML = `
                <div>
                    🔇 ${safeText(user.username)}
                </div>

                <button
                    onclick="unmuteUser('${safeText(user.id)}')"
                >
                    🔊 فك
                </button>
            `;

            box.appendChild(div);

        });

    } catch (error) {

        console.error(
            "Muted list error:",
            error
        );

    }

}

/* =========================================================
   DISCONNECTED LIST
   ========================================================= */

async function loadDisconnectedList() {

    const box =
        el("disconnectedList");

    if (!box) return;

    try {

        const response =
            await fetch(
                "/deviceBanned.json",
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                "HTTP " + response.status
            );

        }

        const data =
            await response.json();

        box.innerHTML = "";

        (data || []).forEach(user => {

            const div =
                document.createElement("div");

            div.className =
                "user-card";

            div.innerHTML = `
                <div>
                    ⛔ ${safeText(user.username)}
                </div>

                <button
                    onclick="undisconnectDevice('${safeText(user.device)}')"
                >
                    🔓 فك
                </button>
            `;

            box.appendChild(div);

        });

    } catch (error) {

        console.error(
            "Disconnected list error:",
            error
        );

    }

}


function undisconnectDevice(device) {

    socket.emit(
        "undisconnect device",
        device
    );

    setTimeout(
        loadDisconnectedList,
        500
    );

}

window.undisconnectDevice =
    undisconnectDevice;

/* =========================================================
   INITIAL LOAD
   ========================================================= */

loadBannedList();
loadMutedList();
loadDisconnectedList();

/*
   لا نحاول تسجيل الدخول تلقائيًا.
   المستخدم يدخل a / a بنفسه.
*/

console.log(
    "✅ Mersal admin.js loaded correctly"
);
