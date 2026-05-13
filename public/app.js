const socket = io({

    reconnection:true,

    reconnectionAttempts:999999,

    reconnectionDelay:1000,

    transports:["websocket"]

});

let currentUser = "";

let currentColor = "#ffd700";

let selectedUser = null;

const ADMIN_NAME = "Admin";

const ADMIN_PASSWORD = "admin771";

/* SELECT COLOR */

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

            color:currentColor,

            password

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
        "الاسم مستخدم حاليا"
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
        "usersCount"
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

        <span style="
        color:${user.color}
        ">

        ${user.username}

        </span>

        `;

        div.onclick = ()=>{

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

    "&amp;"

    :

    ""

    }

    ${data.username}

    &gt;

    </span>

    ${data.message}

    `;

    div.onclick = ()=>{

        selectedUser = {

            id:data.id,

            username:
            data.username

        };

        openUserMenu();

    };

    messages.appendChild(
        div
    );

    messages.scrollTop =

    messages.scrollHeight;

});

/* USERS POPUP */

function toggleUsers(){

    const popup =

    document
    .getElementById(
        "usersPopup"
    );

    if(

        popup.style.display ===
        "flex"

    ){

        popup.style.display =
        "none";

    }else{

        popup.style.display =
        "flex";

    }

}

/* SETTINGS */

function toggleSettings(){

    const popup =

    document
    .getElementById(
        "settingsPopup"
    );

    if(

        popup.style.display ===
        "flex"

    ){

        popup.style.display =
        "none";

    }else{

        popup.style.display =
        "flex";

    }

}

/* CLOSE POPUP */

document.addEventListener(

    "click",

    (e)=>{

    if(

        e.target.classList.contains(
            "users-popup"
        )

    ){

        e.target.style.display =
        "none";

    }

});

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

/* CLOSE MENU */

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

/* CLOSE MENU CLICK */

document.addEventListener(

    "click",

    (e)=>{

    const menu =

    document
    .getElementById(
        "userMenu"
    );

    if(

        !menu.contains(e.target)

    ){

        menu.style.display =
        "none";

    }

});
