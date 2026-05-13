const socket = io({

    reconnection:true,

    reconnectionAttempts:999999,

    reconnectionDelay:1000,

    transports:["websocket"]

});

const ADMIN_NAME = "Admin";

let currentUser = "";

let currentColor = "#ffd700";

let selectedUser = null;

let privateNotifications = 0;

/* COLOR */

function selectColor(color,el){

    currentColor = color;

    document
    .querySelectorAll(".color")
    .forEach(c=>{

        c.classList.remove(
            "active"
        );

    });

    el.classList.add(
        "active"
    );

}

/* LOGIN */

function login(){

    const username =

    document
    .getElementById(
        "loginUsername"
    )

    .value.trim();

    const password =

    document
    .getElementById(
        "loginPassword"
    )

    .value.trim();

    if(

        username === "" ||

        password === ""

    ){

        alert(
            "ادخل البيانات"
        );

        return;

    }

    currentUser = username;

    socket.emit(

        "join",

        {

            username,

            password,

            color:
            currentColor

        }

    );

}

/* LOGIN SUCCESS */

socket.on(

    "login success",

    ()=>{

    document
    .getElementById(
        "loginScreen"
    )

    .style.display =
    "none";

    document
    .getElementById(
        "chatApp"
    )

    .style.display =
    "block";

    if(

        currentUser !==
        ADMIN_NAME

    ){

        document
        .getElementById(
            "settingsButton"
        )

        .style.display =
        "none";

    }

});

/* NAME TAKEN */

socket.on(

    "name taken",

    ()=>{

    alert(
        "الاسم مستخدم"
    );

});

/* USERS */

socket.on(

    "online users",

    (users)=>{

    const list =

    document
    .getElementById(
        "usersList"
    );

    list.innerHTML = "";

    document
    .getElementById(
        "onlineCount"
    )

    .innerText =
    users.length;

    users.forEach(user=>{

        const div =

        document
        .createElement(
            "div"
        );

        div.className =
        "online-user";

        div.innerHTML = `

        ${

        user.username ===
        ADMIN_NAME

        ?

        "⭐"

        :

        "👤"

        }

        <span
        style="
        color:${user.color}
        ">

        ${user.username}

        </span>

        `;

        div.onclick = (e)=>{

            e.stopPropagation();

            selectedUser =
            user;

            openUserMenu();

        };

        list.appendChild(div);

    });

});

/* SEND */

function sendMessage(){

    const input =

    document
    .getElementById(
        "messageInput"
    );

    const message =
    input.value.trim();

    if(message === ""){

        return;

    }

    socket.emit(

        "chat message",

        {

            username:
            currentUser,

            color:
            currentColor,

            message

        }

    );

    input.value = "";

}

/* RECEIVE */

socket.on(

    "chat message",

    (data)=>{

    const messages =

    document
    .getElementById(
        "messages"
    );

    const div =

    document
    .createElement(
        "div"
    );

    div.className =
    "msg-line";

    div.innerHTML = `

    <span
    class="msg-name"
    style="
    color:${data.color}
    ">

    &lt;

    ${

    data.username ===
    ADMIN_NAME

    ?

    "&"

    :

    ""

    }

    ${data.username}

    &gt;

    </span>

    ${data.message}

    `;

    div.onclick = (e)=>{

        e.stopPropagation();

        selectedUser = {

            id:data.id,

            username:
            data.username,

            ip:data.ip,

            browser:
            data.browser,

            device:
            data.device

        };

        openUserMenu();

    };

    messages.appendChild(
        div
    );

    messages.scrollTop =

    messages.scrollHeight;

});

/* POPUPS */

function toggleUsers(){

    closeAllPopups();

    document
    .getElementById(
        "usersPopup"
    )

    .style.display =
    "flex";

}

function toggleSettings(){

    closeAllPopups();

    document
    .getElementById(
        "settingsPopup"
    )

    .style.display =
    "flex";

}

function closeAllPopups(){

    document
    .querySelectorAll(
        ".popup-bg"
    )

    .forEach(p=>{

        p.style.display =
        "none";

    });

}

/* MENU */

function openUserMenu(){

    const menu =

    document
    .getElementById(
        "userMenu"
    );

    menu.style.display =
    "block";

}

function closeMenu(){

    document
    .getElementById(
        "userMenu"
    )

    .style.display =
    "none";

}

/* REPLY */

function replyUser(){

    const input =

    document
    .getElementById(
        "messageInput"
    );

    input.value +=

    `<${selectedUser.username}> `;

    input.focus();

    closeMenu();

}

/* PRIVATE */

function openPrivate(){

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

    document
    .getElementById(
        "privateName"
    )

    .innerText =

    selectedUser.username;

    closeMenu();

}

function closePrivate(){

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "none";

}

function openPrivateList(){

    alert(
        "قريبا قائمة المحادثات الخاصة 🔥"
    );

}

/* SEND PRIVATE */

function sendPrivate(){

    const input =

    document
    .getElementById(
        "privateInput"
    );

    const message =
    input.value.trim();

    if(message === ""){

        return;

    }

    socket.emit(

        "private message",

        {

            to:
            selectedUser.id,

            from:
            currentUser,

            message

        }

    );

    addPrivateMessage(

        "أنت",

        message

    );

    input.value = "";

}

/* RECEIVE PRIVATE */

socket.on(

    "private message",

    (data)=>{

    privateNotifications++;

    const badge =

    document
    .getElementById(
        "privateCount"
    );

    badge.style.display =
    "flex";

    badge.innerText =
    privateNotifications;

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

    document
    .getElementById(
        "privateName"
    )

    .innerText =
    data.from;

    addPrivateMessage(

        data.from,

        data.message

    );

});

/* ADD PM */

function addPrivateMessage(

    name,

    msg

){

    const box =

    document
    .getElementById(
        "privateMessages"
    );

    const div =

    document
    .createElement(
        "div"
    );

    div.className =
    "private-message";

    div.innerHTML = `

    <b>

    ${name}

    </b>

    <br><br>

    ${msg}

    `;

    box.appendChild(div);

    box.scrollTop =

    box.scrollHeight;

}

/* USER INFO */

function showUserInfo(){

    if(

        currentUser !==
        ADMIN_NAME

    ){

        return;

    }

    document
    .getElementById(
        "userInfoPopup"
    )

    .style.display =
    "flex";

    document
    .getElementById(
        "userInfoContent"
    )

    .innerHTML = `

    الاسم:
    ${selectedUser.username}

    <br><br>

    IP:
    ${selectedUser.ip || "غير معروف"}

    <br><br>

    المتصفح:
    ${selectedUser.browser || "غير معروف"}

    <br><br>

    الجهاز:
    ${selectedUser.device || "غير معروف"}

    `;

    closeMenu();

}

/* ADMIN */

function kickUser(){

    socket.emit(

        "kick user",

        selectedUser.id

    );

    closeMenu();

}

function banUser(){

    socket.emit(

        "ban user",

        selectedUser.id

    );

    closeMenu();

}

function disconnectUser(){

    socket.emit(

        "disconnect user",

        selectedUser.id

    );

    closeMenu();

}

/* LISTS */

socket.on(

    "ban list",

    (list)=>{

    const box =

    document
    .getElementById(
        "banList"
    );

    box.innerHTML = "";

    list.forEach(user=>{

        const div =

        document
        .createElement(
            "div"
        );

        div.className =
        "admin-item";

        div.innerHTML = `

        ${user.username}

        <button
        class="admin-btn"
        onclick="unbanUser('${user.ip}')">

        فك حظر

        </button>

        `;

        box.appendChild(div);

    });

});

socket.on(

    "disconnect list",

    (list)=>{

    const box =

    document
    .getElementById(
        "disconnectList"
    );

    box.innerHTML = "";

    list.forEach(user=>{

        const div =

        document
        .createElement(
            "div"
        );

        div.className =
        "admin-item";

        div.innerHTML = `

        ${user.username}

        <button
        class="admin-btn"
        onclick="undisconnectUser('${user.id}')">

        فك فصل

        </button>

        `;

        box.appendChild(div);

    });

});

/* UNBAN */

function unbanUser(ip){

    socket.emit(
        "unban user",
        ip
    );

}

/* UNDISCONNECT */

function undisconnectUser(id){

    socket.emit(
        "undisconnect user",
        id
    );

}

/* CLOSE */

document.addEventListener(

    "click",

    ()=>{

    closeMenu();

    closeAllPopups();

});

document
.getElementById(
    "userMenu"
)

.addEventListener(

    "click",

    (e)=>{

    e.stopPropagation();

});

document
.querySelectorAll(
    ".popup-box"
)

.forEach(box=>{

    box.addEventListener(

        "click",

        (e)=>{

        e.stopPropagation();

    });

});

/* ENTER */

document.addEventListener(

    "keypress",

    (e)=>{

    if(e.key === "Enter"){

        if(

            document
            .getElementById(
                "chatApp"
            )

            .style.display
            === "none"

        ){

            login();

        }else{

            sendMessage();

        }

    }

});
