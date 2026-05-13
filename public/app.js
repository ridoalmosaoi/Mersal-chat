const socket = io();

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

    if(!username || !password){

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

socket.on(

    "online users",

    (users)=>{

    const list =

    document
    .getElementById(
        "usersList"
    );

    list.innerHTML = "";

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

    messages.appendChild(div);

    messages.scrollTop =
    messages.scrollHeight;

});

/* USERS */

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

/* MENU */

function openUserMenu(){

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

    closeAll();

}

function openPrivateList(e){

    e.stopPropagation();

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

function closePrivate(e){

    e.stopPropagation();

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "none";

}

/* PRIVATE RECEIVE */

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

});

/* INFO */

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
