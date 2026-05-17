const socket = io({

    transports:["websocket"],

    reconnection:true,

    reconnectionAttempts:999999,

    reconnectionDelay:500,

    timeout:10000

});

const ADMIN_NAME = "Admin";

let currentUser = "";

let selectedUser = null;

let currentColor = "#ff0000";

/* LOGIN */

function login(){

    const username =

    document
    .getElementById(
        "loginUsername"
    )
    .value
    .trim();

    const password =

    document
    .getElementById(
        "loginPassword"
    )
    .value
    .trim();

    if(!username){

        alert(
            "اكتب الاسم"
        );

        return;

    }

    currentUser =
    username;

    localStorage.setItem(
        "username",
        username
    );

    socket.emit(

        "join",

        {

            username,

            password,

            color:
            currentColor,

            browser:
            navigator.userAgent,

            device:
            navigator.platform

        }

    );

}

/* AUTO LOGIN */

window.onload = ()=>{

    const savedUser =

    localStorage.getItem(
        "username"
    );

    if(savedUser){

        document
        .getElementById(
            "loginUsername"
        )
        .value =
        savedUser;

    }

};

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
        "flex";

});

/* BANNED */

socket.on(

    "banned",

    (msg)=>{

        document
        .getElementById(
            "chatApp"
        )
        .style.display =
        "none";

        document
        .getElementById(
            "loginScreen"
        )
        .style.display =
        "flex";

        alert(msg);

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

            ${

            user.username ===
            ADMIN_NAME

            ?

            "⭐"

            :

            "👤"

            }

            ${user.username}

            `;

            div.onclick = ()=>{

                selectedUser =
                user;

                openUserMenu();

            };

            usersList.appendChild(
                div
            );

        });

});

/* SEND MESSAGE */

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

/* RECEIVE MESSAGE */

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
        color:${data.color};
        ">

        &lt;${data.username}&gt;

        </span>

        <div>

        ${data.message}

        </div>

        `;

        div.onclick = ()=>{

            selectedUser = {

                id:data.id,

                username:data.username,

                ip:data.ip,

                browser:data.browser,

                device:data.device

            };

            openUserMenu();

        };

        messages.appendChild(
            div
        );

        messages.scrollTop =

        messages.scrollHeight;

});

/* USERS */

function toggleUsers(){

    document
    .getElementById(
        "usersPopup"
    )
    .style.display =
    "flex";

}

/* USER MENU */

function openUserMenu(){

    document
    .getElementById(
        "userMenu"
    )
    .style.display =
    "flex";

    const isAdmin =

    currentUser ===
    ADMIN_NAME;

    document
    .getElementById(
        "adminOptions"
    )
    .style.display =

    isAdmin

    ?

    "block"

    :

    "none";

    document
    .getElementById(
        "userInfoBtn"
    )
    .style.display =

    isAdmin

    ?

    "block"

    :

    "none";

}

/* PRIVATE */

function openPrivate(){

    if(!selectedUser){

        return;

    }

    document
    .getElementById(
        "userMenu"
    )
    .style.display =
    "none";

    document
    .getElementById(
        "usersPopup"
    )
    .style.display =
    "none";

    document
    .getElementById(
        "privateTitle"
    )
    .innerHTML =

    `💬 مرسال خاص - ${selectedUser.username}`;

    document
    .getElementById(
        "privateBox"
    )
    .style.display =
    "flex";

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

    if(!message){

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

    <b style="
    color:gold;
    ">

    أنت

    </b>

    <br>

    ${message}

    `;

    box.appendChild(
        div
    );

    box.scrollTop =

    box.scrollHeight;

    input.value = "";

}

/* RECEIVE PRIVATE */

socket.on(

    "private message",

    (data)=>{

        document
        .getElementById(
            "privateBox"
        )
        .style.display =
        "flex";

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

        <b style="
        color:#00d0b4;
        ">

        ${data.from}

        </b>

        <br>

        ${data.message}

        `;

        box.appendChild(
            div
        );

        box.scrollTop =

        box.scrollHeight;

});

/* USER INFO */

function showUserInfo(){

    const shortBrowser =

    selectedUser.browser
    ?.includes("iPhone")

    ?

    "Chrome iPhone"

    :

    "Browser";

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
    ${shortBrowser}

    <br><br>

    Device:
    ${selectedUser.device || "Unknown"}

    `;

}

/* REPLY */

function replyUser(){

    document
    .getElementById(
        "messageInput"
    )
    .value +=

    `<${selectedUser.username}> `;

    closeAll();

}

/* KICK */

function kickUser(){

    socket.emit(

        "kick user",

        selectedUser.id

    );

    closeAll();

}

/* BAN */

function banUser(){

    socket.emit(

        "ban user",

        selectedUser.id

    );

    closeAll();

}

/* DISCONNECT */

function disconnectUser(){

    socket.emit(

        "disconnect user",

        selectedUser.id

    );

    closeAll();

}

/* CLOSE */

function closeAll(){

    document
    .querySelectorAll(
        ".popup-bg"
    )
    .forEach(p=>{

        p.style.display =
        "none";

    });

}

/* OUTSIDE CLICK */

document.addEventListener(

    "click",

    (e)=>{

        if(

        e.target.classList.contains(
            "popup-bg"
        )

        ){

            closeAll();

        }

});
