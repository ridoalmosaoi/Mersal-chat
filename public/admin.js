const socket = io();

/* =========================================================
   GLOBAL
========================================================= */

let adminPermissions = {};
let assignedRooms = [];
let roomPermissions = {};
let isMasterAdmin = false;

let selectedAdminName = null;


/* =========================================================
   ELEMENTS
========================================================= */

const loginPage =
    document.getElementById("adminLogin");

const panel =
    document.getElementById("adminPanel");

const onlineUsers =
    document.getElementById("onlineUsers");

const logsBox =
    document.getElementById("logsBox");


/* =========================================================
   ADMIN LOGIN
========================================================= */

function loginAdmin() {

    const name =
        document
            .getElementById("adminName")
            ?.value
            .trim();

    const password =
        document
            .getElementById("adminPass")
            ?.value
            .trim();

    if (!name || !password) {

        alert(
            "❌ أدخل اسم الأدمن وكلمة السر"
        );

        return;
    }

    socket.emit(
        "admin panel login",
        {
            name,
            password
        }
    );
}


/* =========================================================
   LOGIN SUCCESS
========================================================= */

socket.on(
    "admin login success",
    data => {

        adminPermissions =
            data?.permissions || {};

        assignedRooms =
            data?.assignedRooms || [];

        roomPermissions =
            data?.roomPermissions || {};

        isMasterAdmin =
            data?.isMaster === true;


        if (loginPage) {

            loginPage.style.display =
                "none";

        }


        if (panel) {

            panel.style.display =
                "flex";

        }


        addLog(
            "✅ تم تسجيل الدخول"
        );


        requestRooms();

        requestAdmins();

    }
);


/* =========================================================
   LOGIN FAILED
========================================================= */

socket.on(
    "admin login failed",
    () => {

        alert(
            "❌ بيانات تسجيل الدخول غير صحيحة"
        );

    }
);


/* =========================================================
   ROOM PERMISSIONS
========================================================= */

socket.on(
    "admin room permissions",
    data => {

        assignedRooms =
            data?.assignedRooms || [];

        roomPermissions =
            data?.roomPermissions || {};

        isMasterAdmin =
            data?.isMaster === true;


        renderRoomPermissions();

    }
);


/* =========================================================
   USERS
========================================================= */

socket.on(
    "admin online users",
    users => {

        if (!onlineUsers) {
            return;
        }


        onlineUsers.innerHTML = "";


        users.forEach(
            user => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-card";


                let buttons = "";


                /* INFO */

                if (
                    adminPermissions
                        .viewUserInfo
                ) {

                    buttons += `
<button onclick="viewUser('${escapeAttr(user.id)}')">
ℹ️ معلومات
</button>
`;

                }


                /*
                   KICK
                   Room ID is selected
                   from admin room selector.
                */

                if (
                    adminPermissions.kick
                ) {

                    buttons += `
<button onclick="kickUser('${escapeAttr(user.id)}')">
👢 طرد
</button>
`;

                }


                /* BAN */

                if (
                    adminPermissions.ban
                ) {

                    buttons += `
<button onclick="banUser('${escapeAttr(user.id)}')">
🚫 حظر
</button>
`;

                }


                /* UNBAN */

                if (
                    adminPermissions.unban
                ) {

                    buttons += `
<button onclick="unbanUser('${escapeAttr(user.id)}')">
🔓 فك حظر
</button>
`;

                }


                /* MUTE */

                if (
                    adminPermissions.mute
                ) {

                    buttons += `
<button onclick="muteUser('${escapeAttr(user.id)}')">
🔇 كتم
</button>
`;

                }


                /* UNMUTE */

                if (
                    adminPermissions.unmute
                ) {

                    buttons += `
<button onclick="unmuteUser('${escapeAttr(user.id)}')">
🔊 فك كتم
</button>
`;

                }


                /* STARS */

                if (
                    adminPermissions.stars
                ) {

                    buttons += `
<button onclick="giveStar('${escapeAttr(user.username)}')">
⭐ نجمة
</button>
`;

                    buttons += `
<button onclick="removeStar('${escapeAttr(user.username)}')">
⭐❌ سحب
</button>
`;

                }


                /* DISCONNECT */

                if (
                    adminPermissions.disconnect
                ) {

                    buttons += `
<button onclick="disconnectUser('${escapeAttr(user.id)}')">
⛔ فصل
</button>
`;

                }


                /* UNDISCONNECT */

                if (
                    adminPermissions.undisconnect
                ) {

                    buttons += `
<button onclick="undisconnectUser('${escapeAttr(user.id)}')">
⛔🔓 فك فصل
</button>
`;

                }


                div.innerHTML = `

<div>
👤 <strong>${escapeHtml(user.username)}</strong>
</div>

<div class="user-actions">

${buttons}

</div>

`;


                onlineUsers.appendChild(
                    div
                );

            }
        );

    }
);


/* =========================================================
   USER INFO
========================================================= */

function viewUser(id) {

    socket.emit(
        "view user",
        id
    );

}


socket.on(
    "user info",
    user => {

        alert(

`👤 ${user.username}

🌐 ${user.ip}

📱 ${user.device}

🎨 ${user.color}

🆔 ${user.id}`

        );

    }
);


/* =========================================================
   CURRENT SELECTED ROOM
========================================================= */

function getSelectedRoomId() {

    const select =
        document.getElementById(
            "adminRoomSelect"
        );


    if (
        select &&
        select.value
    ) {

        return String(
            select.value
        );

    }


    /*
       If there is only one room,
       use it automatically.
    */

    if (
        assignedRooms.length === 1
    ) {

        return String(
            assignedRooms[0]
        );

    }


    return null;
}


/* =========================================================
   ACTIONS
========================================================= */

function kickUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "kick user",
        {
            id,
            roomId
        }
    );

}


function banUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "ban user",
        {
            id,
            roomId
        }
    );

}


function unbanUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "unban user",
        {
            id,
            roomId
        }
    );

}


function muteUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "mute user",
        {
            id,
            roomId
        }
    );

}


function unmuteUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "unmute user",
        {
            id,
            roomId
        }
    );


    setTimeout(
        loadMutedList,
        500
    );

}


function disconnectUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "disconnect user",
        {
            id,
            roomId
        }
    );

}


function undisconnectUser(id) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "undisconnect user",
        {
            id,
            roomId
        }
    );

}


/* =========================================================
   STARS
========================================================= */

function giveStar(
    username
) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "give star",
        {
            username,
            roomId
        }
    );

}


function removeStar(
    username
) {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "remove star",
        {
            username,
            roomId
        }
    );

}


/* =========================================================
   CHAT CONTROL
========================================================= */

function unbanAll() {

    socket.emit(
        "unban all"
    );

}


function unmuteAll() {

    socket.emit(
        "unmute all"
    );

}


function undisconnectAll() {

    socket.emit(
        "undisconnect all"
    );

}


function clearChat() {

    const roomId =
        getSelectedRoomId();


    if (roomId) {

        socket.emit(
            "clear chat",
            {
                roomId
            }
        );

        return;
    }


    socket.emit(
        "clear chat"
    );

}


function toggleChatLock() {

    const roomId =
        getSelectedRoomId();


    if (roomId) {

        socket.emit(
            "toggle room chat lock",
            roomId
        );

        return;
    }


    socket.emit(
        "toggle chat lock"
    );

}


function togglePrivateLock() {

    socket.emit(
        "toggle private lock"
    );

}


function toggleMaintenance() {

    const roomId =
        getSelectedRoomId();


    if (roomId) {

        socket.emit(
            "toggle room maintenance",
            roomId
        );

        return;
    }


    socket.emit(
        "maintenance mode"
    );

}


function toggleStarsMode() {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "toggle room stars",
        roomId
    );

}


function toggleProtection() {

    const roomId =
        getSelectedRoomId();


    if (!roomId) {

        alert(
            "⚠️ اختر الغرفة أولًا"
        );

        return;
    }


    socket.emit(
        "toggle room protection",
        roomId
    );

}


/* =========================================================
   ADD ADMIN
========================================================= */

function addAdmin() {

    const name =
        document
            .getElementById(
                "newAdminName"
            )
            ?.value
            .trim();


    const password =
        document
            .getElementById(
                "newAdminPassword"
            )
            ?.value
            .trim();


    if (
        !name ||
        !password
    ) {

        alert(
            "❌ أدخل اسم الأدمن وكلمة السر"
        );

        return;

    }


    const permissions = {

        kick:
            getChecked(
                "permKick"
            ),

        ban:
            getChecked(
                "permBan"
            ),

        unban:
            getChecked(
                "permUnban"
            ),

        mute:
            getChecked(
                "permMute"
            ),

        unmute:
            getChecked(
                "permUnmute"
            ),

        stars:
            getChecked(
                "permStars"
            ),

        disconnect:
            getChecked(
                "permDisconnect"
            ),

        undisconnect:
            true,

        viewUserInfo:
            getChecked(
                "permViewUser"
            ),

        addAdmin:
            getChecked(
                "permAddAdmin"
            ),

        chatLock:
            getChecked(
                "permChatLock"
            ),

        maintenance:
            getChecked(
                "permMaintenance"
            ),

        protection:
            getChecked(
                "permProtection"
            ),

        deleteMessage:
            getChecked(
                "permDeleteMessage"
            )

    };


    const selected =
        getSelectedAssignedRooms();


    const permissionsPerRoom =
        buildRoomPermissions();


    socket.emit(
        "add admin",
        {

            name,

            password,

            permissions,

            assignedRooms:
                selected,

            roomPermissions:
                permissionsPerRoom

        }
    );

}


/* =========================================================
   GET CHECKBOX
========================================================= */

function getChecked(id) {

    const el =
        document.getElementById(
            id
        );

    return !!el?.checked;

}


/* =========================================================
   ADMINS LIST
========================================================= */

function requestAdmins() {

    /*
       Current server sends admins list
       after login/add/remove.
       Requesting is harmless.
    */

    socket.emit(
        "request admins"
    );

}


socket.on(
    "admins list",
    admins => {

        const box =
            document.getElementById(
                "adminsList"
            );


        if (!box) {
            return;
        }


        box.innerHTML = "";


        admins.forEach(
            admin => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-card";


                const rooms =
                    Array.isArray(
                        admin.assignedRooms
                    )
                        ? admin.assignedRooms
                        : [];


                div.innerHTML = `

<div>

👮 <strong>
${escapeHtml(admin.name)}
</strong>

<br>

<small>
🏠 ${rooms.length} غرفة
</small>

</div>

<div class="user-actions">

<button onclick="selectAdminRooms('${escapeAttr(admin.name)}')">
🏠 الغرف والصلاحيات
</button>

<button onclick="removeAdmin('${escapeAttr(admin.name)}')">
🗑️ إزالة
</button>

</div>

`;


                box.appendChild(
                    div
                );

            }
        );

    }
);


/* =========================================================
   SELECT ADMIN
========================================================= */

function selectAdminRooms(
    name
) {

    selectedAdminName =
        name;


    const admin =
        window.__mersalAdmins?.find(
            item =>
                item.name ===
                name
        );


    if (!admin) {

        alert(
            "❌ لم يتم العثور على الأدمن"
        );

        return;
    }


    showAdminRoomEditor(
        admin
    );

}


/* =========================================================
   STORE ADMINS
========================================================= */

socket.on(
    "admins list",
    admins => {

        window.__mersalAdmins =
            admins;

    }
);


/* =========================================================
   ROOM LIST
========================================================= */

function requestRooms() {

    socket.emit(
        "get admin rooms"
    );

}


socket.on(
    "admin rooms",
    rooms => {

        window.__mersalRooms =
            rooms;


        renderAdminRoomSelect(
            rooms
        );


        renderRoomEditorRooms(
            rooms
        );

    }
);


/* =========================================================
   ROOM SELECT
========================================================= */

function renderAdminRoomSelect(
    rooms
) {

    let select =
        document.getElementById(
            "adminRoomSelect"
        );


    if (!select) {

        /*
           Create selector without
           changing existing admin.html.
        */

        const container =
            document.createElement(
                "div"
            );


        container.className =
            "admin-box";


        container.innerHTML = `

<h3>
🏠 الغرفة التي تريد إدارتها
</h3>

<select id="adminRoomSelect">
<option value="">
-- اختر الغرفة --
</option>
</select>

`;


        panel?.prepend(
            container
        );


        select =
            document.getElementById(
                "adminRoomSelect"
            );

    }


    if (!select) {
        return;
    }


    select.innerHTML = `

<option value="">
-- اختر الغرفة --
</option>

`;


    rooms.forEach(
        room => {

            if (
                !isMasterAdmin &&
                !assignedRooms.includes(
                    String(room.id)
                )
            ) {

                return;

            }


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                room.id;


            option.textContent =
                `🏠 ${room.name}`;


            select.appendChild(
                option
            );

        }
    );

}


/* =========================================================
   ROOM EDITOR
========================================================= */

function showAdminRoomEditor(
    admin
) {

    let box =
        document.getElementById(
            "adminRoomEditor"
        );


    if (!box) {

        box =
            document.createElement(
                "div"
            );


        box.id =
            "adminRoomEditor";


        box.className =
            "admin-box";


        panel?.prepend(
            box
        );

    }


    box.style.display =
        "block";


    box.innerHTML = `

<h2>
🛡️ إدارة غرف ${escapeHtml(admin.name)}
</h2>

<div id="adminRoomEditorRooms"></div>

<button
onclick="saveAdminRoomAssignment()"
class="login-btn">

💾 حفظ الغرف والصلاحيات

</button>

<button
onclick="closeAdminRoomEditor()">

❌ إغلاق

</button>

`;


    renderRoomEditorRooms(
        window.__mersalRooms ||
        []
    );

}


/* =========================================================
   RENDER ADMIN ROOM EDITOR
========================================================= */

function renderRoomEditorRooms(
    rooms
) {

    const box =
        document.getElementById(
            "adminRoomEditorRooms"
        );


    if (!box) {
        return;
    }


    box.innerHTML = "";


    if (
        !selectedAdminName
    ) {

        box.innerHTML =
            "<p>اختر أدمن أولًا.</p>";

        return;

    }


    const admin =
        window.__mersalAdmins?.find(
            item =>
                item.name ===
                selectedAdminName
        );


    if (!admin) {
        return;
    }


    const assigned =
        Array.isArray(
            admin.assignedRooms
        )
            ? admin.assignedRooms.map(
                String
            )
            : [];


    rooms.forEach(
        room => {

            const roomId =
                String(
                    room.id
                );


            const checked =
                assigned.includes(
                    roomId
                );


            const current =
                admin.roomPermissions &&
                admin.roomPermissions[
                    roomId
                ]
                    ? admin.roomPermissions[
                        roomId
                    ]
                    : {};


            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "user-card";


            div.innerHTML = `

<div>

<label>

<input
type="checkbox"
class="assigned-room"
data-room="${escapeAttr(roomId)}"
${checked ? "checked" : ""}>

<strong>
🏠 ${escapeHtml(room.name)}
</strong>

</label>

</div>

<div class="room-permission-grid">

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="kick"
${current.kick ? "checked" : ""}>

👢 طرد
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="ban"
${current.ban ? "checked" : ""}>

🚫 حظر
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="unban"
${current.unban ? "checked" : ""}>

🔓 فك حظر
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="mute"
${current.mute ? "checked" : ""}>

🔇 كتم
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="unmute"
${current.unmute ? "checked" : ""}>

🔊 فك كتم
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="disconnect"
${current.disconnect ? "checked" : ""}>

⛔ فصل
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="undisconnect"
${current.undisconnect ? "checked" : ""}>

⛔🔓 فك فصل
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="stars"
${current.stars ? "checked" : ""}>

⭐ النجوم
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="chatLock"
${current.chatLock ? "checked" : ""}>

🔒 قفل الدردشة
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="maintenance"
${current.maintenance ? "checked" : ""}>

🛠️ صيانة
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="protection"
${current.protection ? "checked" : ""}>

🛡️ حماية
</label>

<label>
<input
type="checkbox"
class="room-perm"
data-room="${escapeAttr(roomId)}"
data-perm="deleteMessage"
${current.deleteMessage ? "checked" : ""}>

🗑️ حذف الرسائل
</label>

</div>

`;


            box.appendChild(
                div
            );

        }
    );

}


/* =========================================================
   GET SELECTED ASSIGNED ROOMS
========================================================= */

function getSelectedAssignedRooms() {

    return [
        ...document.querySelectorAll(
            ".assigned-room:checked"
        )
    ].map(
        element =>
            String(
                element.dataset.room
            )
    );

}


/* =========================================================
   BUILD ROOM PERMISSIONS
========================================================= */

function buildRoomPermissions() {

    const result = {};


    document
        .querySelectorAll(
            ".room-perm"
        )
        .forEach(
            checkbox => {

                const roomId =
                    String(
                        checkbox.dataset.room
                    );


                const permission =
                    checkbox.dataset.perm;


                if (
                    !result[roomId]
                ) {

                    result[roomId] = {};

                }


                result[
                    roomId
                ][permission] =
                    checkbox.checked;

            }
        );


    return result;

}


/* =========================================================
   SAVE ADMIN ROOM ASSIGNMENT
========================================================= */

function saveAdminRoomAssignment() {

    if (
        !selectedAdminName
    ) {

        alert(
            "❌ اختر الأدمن أولًا"
        );

        return;
    }


    const assigned =
        getSelectedAssignedRooms();


    const permissions =
        buildRoomPermissions();


    socket.emit(
        "update admin rooms",
        {

            name:
                selectedAdminName,

            assignedRooms:
                assigned,

            roomPermissions:
                permissions

        }
    );


    alert(
        "✅ تم حفظ غرف وصلاحيات الأدمن"
    );

}


/* =========================================================
   CLOSE EDITOR
========================================================= */

function closeAdminRoomEditor() {

    const box =
        document.getElementById(
            "adminRoomEditor"
        );


    if (box) {

        box.style.display =
            "none";

    }


    selectedAdminName =
        null;

}


/* =========================================================
   ROOM MANAGEMENT
========================================================= */

const roomNameInput =
    document.getElementById(
        "roomName"
    );


const roomDescriptionInput =
    document.getElementById(
        "roomDescription"
    );


let editingRoomId = null;


/* =========================================================
   REQUEST ROOMS
========================================================= */

function requestRooms() {

    socket.emit(
        "get admin rooms"
    );

}


/* =========================================================
   ADMIN ROOMS
========================================================= */

socket.on(
    "admin rooms",
    rooms => {

        window.__mersalRooms =
            rooms;


        renderRoomsList(
            rooms
        );


        renderAdminRoomSelect(
            rooms
        );


        if (
            selectedAdminName
        ) {

            renderRoomEditorRooms(
                rooms
            );

        }

    }
);


/* =========================================================
   RENDER ROOMS LIST
========================================================= */

function renderRoomsList(
    rooms
) {

    const box =
        document.getElementById(
            "roomsList"
        );


    if (!box) {
        return;
    }


    box.innerHTML = "";


    rooms.forEach(
        room => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "user-card";


            const status =
                room.enabled !== false
                    ? "🟢 مفعلة"
                    : "🔴 معطلة";


            div.innerHTML = `

<div>

🏠 <strong>
${escapeHtml(room.name)}
</strong>

<br>

<small>
${escapeHtml(
    room.description ||
    "بدون وصف"
)}
</small>

<br>

${status}

</div>

<div class="user-actions">

<button onclick="editRoom(
'${escapeAttr(room.id)}',
'${escapeAttr(room.name)}',
'${escapeAttr(room.description || "")}'
)">
✏️ تعديل
</button>

<button onclick="toggleRoom(
'${escapeAttr(room.id)}'
)">
${room.enabled !== false
    ? "🔴 تعطيل"
    : "🟢 تفعيل"}
</button>

<button onclick="deleteRoom(
'${escapeAttr(room.id)}'
)">
🗑️ حذف
</button>

</div>

`;

            box.appendChild(
                div
            );

        }
    );

}


/* =========================================================
   SAVE ROOM
========================================================= */

function saveRoom() {

    const name =
        roomNameInput
            ?.value
            .trim();


    const description =
        roomDescriptionInput
            ?.value
            .trim();


    if (!name) {

        alert(
            "❌ اكتب اسم الغرفة"
        );

        return;
    }


    if (editingRoomId) {

        socket.emit(
            "update room",
            {

                id:
                    editingRoomId,

                name,

                description

            }
        );

    } else {

        socket.emit(
            "create room",
            {

                name,

                description

            }
        );

    }


    clearRoomForm();

}


/* =========================================================
   EDIT ROOM
========================================================= */

function editRoom(
    id,
    name,
    description
) {

    editingRoomId =
        id;


    if (
        roomNameInput
    ) {

        roomNameInput.value =
            name;

    }


    if (
        roomDescriptionInput
    ) {

        roomDescriptionInput.value =
            description;

    }


    const button =
        document.getElementById(
            "roomSaveButton"
        );


    if (button) {

        button.innerText =
            "💾 حفظ التعديل";

    }


    roomNameInput?.focus();

}


/* =========================================================
   CLEAR ROOM FORM
========================================================= */

function clearRoomForm() {

    editingRoomId =
        null;


    if (
        roomNameInput
    ) {

        roomNameInput.value =
            "";

    }


    if (
        roomDescriptionInput
    ) {

        roomDescriptionInput.value =
            "";

    }


    const button =
        document.getElementById(
            "roomSaveButton"
        );


    if (button) {

        button.innerText =
            "➕ إنشاء الغرفة";

    }

}


/* =========================================================
   TOGGLE ROOM
========================================================= */

function toggleRoom(
    id
) {

    socket.emit(
        "toggle room",
        id
    );

}


/* =========================================================
   DELETE ROOM
========================================================= */

function deleteRoom(
    id
) {

    if (
        !confirm(
            "هل تريد حذف هذه الغرفة؟"
        )
    ) {

        return;

    }


    socket.emit(
        "delete room",
        id
    );

}


/* =========================================================
   ROOM ERROR
========================================================= */

socket.on(
    "room error",
    message => {

        alert(
            message
        );

    }
);


/* =========================================================
   ROOM NOTICE
========================================================= */

socket.on(
    "room notice",
    data => {

        addLog(
            data.message
        );

    }
);


/* =========================================================
   LOGS
========================================================= */

function addLog(
    text
) {

    if (!logsBox) {
        return;
    }


    const div =
        document.createElement(
            "div"
        );


    div.className =
        "log-item";


    div.innerText =
        text;


    logsBox.prepend(
        div
    );

}


socket.on(
    "new log",
    log => {

        addLog(
            log.message
        );

    }
);


/* =========================================================
   BANNED LIST
========================================================= */

async function loadBannedList() {

    try {

        const res =
            await fetch(
                "/banned.json"
            );


        const data =
            await res.json();


        const box =
            document.getElementById(
                "bannedList"
            );


        if (!box) {
            return;
        }


        box.innerHTML =
            "";


        data.forEach(
            ban => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-card";


                div.innerHTML = `

<div>
🚫 ${escapeHtml(
    ban.ip
)}
</div>

<button onclick="unbanIp(
'${escapeAttr(ban.ip)}'
)">
🔓 فك
</button>

`;


                box.appendChild(
                    div
                );

            }
        );

    } catch (
        error
    ) {

        console.log(
            error
        );

    }

}


function unbanIp(
    ip
) {

    socket.emit(
        "unban ip",
        ip
    );


    setTimeout(
        loadBannedList,
        500
    );

}


loadBannedList();


/* =========================================================
   MUTED LIST
========================================================= */

async function loadMutedList() {

    try {

        const res =
            await fetch(
                "/muted.json"
            );


        const data =
            await res.json();


        const box =
            document.getElementById(
                "mutedList"
            );


        if (!box) {
            return;
        }


        box.innerHTML =
            "";


        data.forEach(
            user => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-card";


                div.innerHTML = `

<div>
🔇 ${escapeHtml(
    user.username
)}
</div>

<button onclick="unmuteUser(
'${escapeAttr(user.id)}'
)">
🔊 فك
</button>

`;


                box.appendChild(
                    div
                );

            }
        );

    } catch (
        error
    ) {

        console.log(
            error
        );

    }

}


loadMutedList();


/* =========================================================
   DISCONNECTED LIST
========================================================= */

async function loadDisconnectedList() {

    try {

        const res =
            await fetch(
                "/deviceBanned.json"
            );


        const data =
            await res.json();


        const box =
            document.getElementById(
                "disconnectedList"
            );


        if (!box) {
            return;
        }


        box.innerHTML =
            "";


        data.forEach(
            user => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-card";


                div.innerHTML = `

<div>
⛔ ${escapeHtml(
    user.username
)}
</div>

<button onclick="undisconnectDevice(
'${escapeAttr(user.device)}'
)">
🔓 فك
</button>

`;


                box.appendChild(
                    div
                );

            }
        );

    } catch (
        error
    ) {

        console.log(
            error
        );

    }

}


function undisconnectDevice(
    device
) {

    /*
       Legacy endpoint compatibility.
    */

    socket.emit(
        "undisconnect device",
        device
    );


    setTimeout(
        loadDisconnectedList,
        500
    );

}


loadDisconnectedList();


/* =========================================================
   UTILITIES
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


function escapeAttr(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /'/g,
            "\\'"
        )
        .replace(
            /"/g,
            "&quot;"
        );

}


/* =========================================================
   AUTO ROOM PERMISSION UI
========================================================= */

function renderRoomPermissions() {

    /*
       This function is intentionally
       lightweight because the main
       room editor is generated when
       selecting an admin.
    */

    const select =
        document.getElementById(
            "adminRoomSelect"
        );


    if (!select) {
        return;
    }


    [...select.options]
        .forEach(
            option => {

                if (
                    !option.value
                ) {
                    return;
                }


                const allowed =
                    isMasterAdmin ||
                    assignedRooms.includes(
                        String(
                            option.value
                        )
                    );


                option.disabled =
                    !allowed;

            }
        );

}


/* =========================================================
   SOCKET RECONNECT
========================================================= */

socket.on(
    "connect",
    () => {

        /*
           If the admin is already
           logged in, ask server for
           fresh room information.
        */

        if (
            panel &&
            panel.style.display !==
            "none"
        ) {

            requestRooms();

        }

    }
);
