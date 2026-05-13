const socket = io({

    transports:["websocket"]

});

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

    if(!username){

        alert("اكتب الاسم");

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

});

/* NAME TAKEN */

socket.on(

    "name taken",

    ()=>{

    alert(
        "الاسم مستخدم"
    );

});

/* ONLINE USERS */

socket.on(

    "online users",

    (users)=>{

    const usersList =

    document
    .getElementById(
        "usersList"
    );

    if(!usersList){

        return;

    }

    usersList.innerHTML = "";

    users.forEach(user=>{

        const div =

        document
        .createElement(
            "div"
        );

        div.className =
        "online-user";

        div.innerHTML = `

        <span style="
        color:${user.color}
        ">

        👤 ${user.username}

        </span>

        `;

        div.onclick = (e)=>{

            e.stopPropagation();

            selectedUser =
            user;

            openUserMenu();

        };

        usersList.appendChild(
            div
        );

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

    if(!message){

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

    if(!messages){

        return;

    }

    const div =

    document
    .createElement(
        "div"
    );

    div.className =
    "msg-line";

    div.innerHTML = `

    <span
    style="
    color:${data.color};
    font-weight:bold;
    ">

    &lt;${data.username}&gt;

    </span>

    ${data.message}

    `;

    div.onclick = (e)=>{

        e.stopPropagation();

        selectedUser =
        data;

        openUserMenu();

    };

    messages.appendChild(
        div
    );

    messages.scrollTop =

    messages.scrollHeight;

});

/* USERS POPUP */

function toggleUsers(e){

    e.stopPropagation();

    closeAll();

    document
    .getElementById(
        "usersPopup"
    )

    .style.display =
    "flex";

}

/* SETTINGS */

function toggleSettings(e){

    e.stopPropagation();

    closeAll();

    document
    .getElementById(
        "settingsPopup"
    )

    .style.display =
    "flex";

}

/* PRIVATE */

function openPrivateList(e){

    e.stopPropagation();

    closeAll();

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

}

function closePrivate(e){

    e.stopPropagation();

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "none";

}

/* USER MENU */

function openUserMenu(){

    const menu =

    document
    .getElementById(
        "userMenu"
    );

    menu.style.display =
    "block";

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

    closeAll();

}

/* PRIVATE MESSAGE */

function openPrivate(){

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

    closeAll();

}

/* USER INFO */

function showUserInfo(){

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
    ${selectedUser.ip || "Unknown"}

    <br><br>

    Browser:
    ${selectedUser.browser || "Unknown"}

    <br><br>

    Device:
    ${selectedUser.device || "Unknown"}

    `;

}

/* BAN */

function banUser(){

    if(!selectedUser){

        return;

    }

    socket.emit(

        "ban user",

        selectedUser.id

    );

    closeAll();

}

/* DISCONNECT */

function disconnectUser(){

    if(!selectedUser){

        return;

    }

    socket.emit(

        "disconnect user",

        selectedUser.id

    );

    closeAll();

}

/* CLOSE ALL */

function closeAll(){

    document
    .querySelectorAll(
        ".popup-bg"
    )

    .forEach(p=>{

        p.style.display =
        "none";

    });

    document
    .getElementById(
        "userMenu"
    )

    .style.display =
    "none";

}

/* CLICK OUTSIDE */

document.addEventListener(

    "click",

    ()=>{

    closeAll();

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
