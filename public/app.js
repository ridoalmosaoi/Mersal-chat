const socket = io({

    reconnection:true,

    reconnectionAttempts:999999,

    reconnectionDelay:1000,

    reconnectionDelayMax:5000,

    timeout:20000,

    transports:[
        "websocket"
    ]

});

let currentUser = "";

let selectedUser = null;

let privateCount = 0;

/* ADMIN */

const ADMIN_NAME =
"Admin";

const ADMIN_PASSWORD =
"admin771";

/* AUTO SAVE */

window.onload = ()=>{

    const savedUser =

    localStorage.getItem(
        "chatUsername"
    );

    const savedPass =

    localStorage.getItem(
        "chatPassword"
    );

    if(savedUser){

        document
        .getElementById(
            "loginUsername"
        )

        .value =
        savedUser;

    }

    if(savedPass){

        document
        .getElementById(
            "loginPassword"
        )

        .value =
        savedPass;

    }

};

/* LOGIN */

function login(){

    const username =

    document
    .getElementById(
        "loginUsername"
    )

    .value;

    const password =

    document
    .getElementById(
        "loginPassword"
    )

    .value;

    if(

        username.trim() === "" ||

        password.trim() === ""

    ){

        alert(
            "ادخل البيانات"
        );

        return;

    }

    currentUser =
    username;

    localStorage.setItem(

        "chatUsername",

        username

    );

    localStorage.setItem(

        "chatPassword",

        password

    );

    if(

        currentUser ===
        ADMIN_NAME &&

        password ===
        ADMIN_PASSWORD

    ){

        document
        .getElementById(
            "adminOptions"
        )

        .style.display =
        "block";

    }else{

        document
        .getElementById(
            "adminOptions"
        )

        .style.display =
        "none";

    }

    socket.emit(

        "join",

        {
            username
        }

    );

}

/* NAME TAKEN */

socket.on(

    "name taken",

    ()=>{

    alert(
        "الاسم داخل الآن"
    );

});

/* BANNED */

socket.on(

    "banned",

    ()=>{

    alert(
        "تم حظرك من الشات"
    );

    location.reload();

});

/* ONLINE USERS */

socket.on(

    "online users",

    (users)=>{

    if(

        document
        .getElementById(
            "chatApp"
        )

        .style.display
        !== "block"

    ){

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

    }

    const online =

    document
    .getElementById(
        "onlineList"
    );

    online.innerHTML = `

        <div style="
        color:#ff9900;
        font-weight:bold;
        margin-bottom:10px;
        ">

        المتصلين
        (${users.length})

        </div>

    `;

    users.forEach(user=>{

        const div =

        document
        .createElement(
            "div"
        );

        div.classList.add(
            "online-user"
        );

        div.innerHTML = `

        ${

        user.username ===
        ADMIN_NAME

        ?

        "<span style='color:#ff4444'>&amp;</span>"

        :

        ""

        }

        ${user.username}

        `;

        div.onclick = (e)=>{

            selectedUser =
            user;

            openMenu(e);

        };

        online.appendChild(
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
    input.value;

    if(
        message.trim() === ""
    ){

        return;

    }

    socket.emit(

        "chat message",

        {

            username:
            currentUser,

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

    div.classList.add(
        "message"
    );

    if(

        data.username ===
        currentUser

    ){

        div.classList.add(
            "my-message"
        );

    }

    div.innerHTML = `

        <div class="username">

        ${

        data.username ===
        ADMIN_NAME

        ?

        "<span style='color:#ff4444'>&amp;</span>"

        :

        ""

        }

        ${data.username}

        </div>

        <div class="text">

        ${data.message}

        </div>

        <div class="time">

        ${data.time}

        </div>

    `;

    div.onclick = (e)=>{

        selectedUser = {

            id:data.id,

            username:
            data.username

        };

        openMenu(e);

    };

    messages.appendChild(
        div
    );

    messages.scrollTop =

    messages.scrollHeight;

});

/* SYSTEM */

socket.on(

    "system",

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

    div.style.color =
    "#00ff66";

    div.style.marginBottom =
    "10px";

    div.innerText =
    data.text;

    messages.appendChild(
        div
    );

});

/* MENU */

function openMenu(e){

    const menu =

    document
    .getElementById(
        "userMenu"
    );

    menu.style.display =
    "block";

    menu.style.left =
    e.pageX + "px";

    menu.style.top =
    e.pageY + "px";

}

/* CLOSE MENU */

function closeMenus(){

    document
    .getElementById(
        "userMenu"
    )

    .style.display =
    "none";

}

/* COPY */

function copyUsername(){

    navigator.clipboard
    .writeText(

        selectedUser.username

    );

    closeMenus();

}

/* PRIVATE */

function openPrivate(){

    privateCount = 0;

    document
    .getElementById(
        "privateBadge"
    )

    .style.display =
    "none";

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "flex";

    if(selectedUser){

        document
        .getElementById(
            "privateName"
        )

        .innerText =

        selectedUser.username;

    }

    closeMenus();

}

function closePrivate(){

    document
    .getElementById(
        "privateBox"
    )

    .style.display =
    "none";

}

function sendPrivate(){

    const input =

    document
    .getElementById(
        "privateInput"
    );

    const message =
    input.value;

    if(
        message.trim() === ""
    ){

        return;

    }

    socket.emit(

        "private message",

        {

            toSocket:
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

    privateCount++;

    document
    .getElementById(
        "privateBadge"
    )

    .innerText =
    privateCount;

    document
    .getElementById(
        "privateBadge"
    )

    .style.display =
    "flex";

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

    div.style.marginBottom =
    "10px";

    div.innerHTML = `

        <b style="
        color:#ff9900
        ">

        ${name}

        </b>

        <br>

        ${msg}

    `;

    box.appendChild(
        div
    );

    box.scrollTop =

    box.scrollHeight;

}

/* ADMIN */

function kickUser(){

    socket.emit(

        "kick user",

        selectedUser.id

    );

    closeMenus();

}

function banUser(){

    socket.emit(

        "ban user",

        {

            id:
            selectedUser.id

        }

    );

    closeMenus();

}

function disconnectUser(){

    socket.emit(

        "disconnect user",

        selectedUser.id

    );

    closeMenus();

}

/* RECONNECT */

socket.on(

    "connect",

    ()=>{

    if(currentUser !== ""){

        socket.emit(

            "join",

            {

                username:
                currentUser

            }

        );

    }

});

/* ENTER */

document.addEventListener(

    "keypress",

    (e)=>{

    if(
        e.key === "Enter"
    ){

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

/* HIDE MENU */

document.addEventListener(

    "click",

    ()=>{

    document
    .getElementById(
        "userMenu"
    )

    .style.display =
    "none";

});
