const socket = io({

    transports:["websocket"],

    reconnection:true,

    reconnectionAttempts:99999,

    reconnectionDelay:1000

});

const ADMIN_NAME = "Admin";

let currentUser = "";

let currentColor = "#ffd700";

let selectedUser = null;

let privateNotifications = 0;

/* COLORS */

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

        <span style="
        color:${user.color}
        ">

        ${

        user.username ===
        ADMIN_NAME

        ?

        "⭐"

        :

        "👤"

        }

        ${user.username}

        </span>

        `;

        div.onclick = (event)=>{

            event.stopPropagation();

            selectedUser =
            user;

            openUserMenu(event);

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

    div.onclick = (event)=>{

        event.stopPropagation();

        selectedUser =
        data;

        openUserMenu(event);

    };

    messages.appendChild(div);

    messages.scrollTop =

    messages.scrollHeight;

});

/* USERS */

function toggleUsers(event){

    event.stopPropagation();

    closeAll();

    document
    .getElementById(
        "usersPopup"
    )

    .style.display =
    "flex";

}

/* SETTINGS */

function toggleSettings(event){

    event.stopPropagation();

    closeAll();

    document
    .getElementById(
        "settingsPopup"
    )

    .style.display =
    "flex";

}

/* MENU */

function openUserMenu(event){

    if(event){

        event.stopPropagation();

    }

    const menu =

    document
    .getElementById(
        "userMenu"
    );

    menu.style.display =
    "block";

    if(

        currentUser !==
        ADMIN_NAME

    ){

        document
        .getElementById(
            "adminOptions"
        )

        .style.display =
        "none";

        document
        .getElementById(
            "userInfoButton"
        )

        .style.display =
        "none";

    }else{

        document
        .getElementById(
            "adminOptions"
        )

        .style.display =
        "block";

        document
        .getElementById(
            "userInfoButton"
        )

        .style.display =
        "block";

    }

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

}

function openPrivateList(event){

    event.stopPropagation();

    closeAll();

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

    privateNotifications = 0;

    document
    .getElementById(
        "privateCount"
    )

    .style.display =
    "none";

}

function closePrivate(event){

    event.stopPropagation();

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "none";

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

    input.value = "";

}

/* PRIVATE RECEIVE */

socket.on(

    "private message",

    ()=>{

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

});

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

/* ADMIN */

function banUser(){

    socket.emit(

        "ban user",

        selectedUser.id

    );

    closeAll();

}

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

    document
    .getElementById(
        "userMenu"
    )

    .style.display =
    "none";

}

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

document
.getElementById(
    "userMenu"
)

.addEventListener(

    "click",

    (e)=>{

    e.stopPropagation();

});
