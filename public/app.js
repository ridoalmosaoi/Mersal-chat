const socket = io();


// =========================================================
// GLOBAL STATE
// =========================================================

let currentUser = null;
let currentColor = "#ffd700";

let currentRoom = null;
let roomsCache = [];

let openRooms = [];
let activeRoomId = null;

let currentPrivateUser = null;
let currentPrivateName = null;

let privateChats = {};
let privateUnread = {};

let replyData = null;

let usersCache = [];

let privateListMode = false;

let loginPending = false;

let toastTimer = null;


// =========================================================
// HELPERS
// =========================================================

const $ = id =>
    document.getElementById(id);


function escapeHtml(value){

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function showToast(text){

    const toast =
        $("toast");

    if(!toast){

        alert(text);

        return;
    }


    toast.textContent =
        text;

    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2200
        );

}


function getChatMessages(){

    return $("messages");

}


function getMessageInput(){

    return $("messageInput");

}


function getPrivateMessages(){

    return $("privateMessages");

}


function getPrivateInput(){

    return $("privateInput");

}


// =========================================================
// IPHONE / SAFARI VIEWPORT
// =========================================================

function updateChatViewport(){

    const viewport =
        window.visualViewport;

    const height =
        viewport
            ? viewport.height
            : window.innerHeight;


    document.documentElement
        .style
        .setProperty(
            "--app-height",
            `${height}px`
        );

}


updateChatViewport();


window.addEventListener(
    "resize",
    updateChatViewport
);


if(window.visualViewport){

    window.visualViewport.addEventListener(
        "resize",
        updateChatViewport
    );

}


// =========================================================
// IPHONE - PREVENT PAGE MOVEMENT
// =========================================================

function lockPagePosition(){

    window.scrollTo(
        0,
        0
    );

}


window.addEventListener(
    "scroll",
    lockPagePosition,
    {
        passive: true
    }
);


if(window.visualViewport){

    window.visualViewport.addEventListener(
        "scroll",
        lockPagePosition
    );

}


document.addEventListener(
    "focusin",
    function(e){

        if(
            e.target &&
            (
                e.target.id ===
                    "messageInput" ||

                e.target.id ===
                    "privateInput"
            )
        ){

            setTimeout(
                () => {
                    window.scrollTo(
                        0,
                        0
                    );
                },
                50
            );


            setTimeout(
                () => {
                    window.scrollTo(
                        0,
                        0
                    );
                },
                300
            );

        }

    }
);


// =========================================================
// KEEP CHAT BOTTOM
// =========================================================

function keepChatBottom(){

    requestAnimationFrame(
        () => {

            const messages =
                getChatMessages();

            if(messages){

                messages.scrollTop =
                    messages.scrollHeight;

            }


            const privateMessages =
                getPrivateMessages();

            if(privateMessages){

                privateMessages.scrollTop =
                    privateMessages.scrollHeight;

            }

        }
    );

}


// =========================================================
// LOGIN ELEMENTS
// =========================================================

const loginPage =
    $("loginPage");

const chatPage =
    $("chatPage");

const username =
    $("username");

const adminPassword =
    $("adminPassword");

const loginStatus =
    $("loginStatus");


// =========================================================
// ADMIN PASSWORD CHECK
// =========================================================

if(username){

    username.addEventListener(
        "input",
        () => {

            const name =
                username.value.trim();


            if(loginStatus){

                loginStatus.textContent =
                    "";

            }


            if(!name){

                if(adminPassword){

                    adminPassword.style.display =
                        "none";

                    adminPassword.value =
                        "";

                }

                return;
            }


            socket.emit(
                "check admin",
                name
            );

        }
    );

}


socket.on(
    "admin check result",
    isAdmin => {

        if(!adminPassword)
            return;


        if(isAdmin){

            adminPassword.style.display =
                "block";

        }else{

            adminPassword.style.display =
                "none";

            adminPassword.value =
                "";

        }

    }
);


// =========================================================
// COLORS
// =========================================================

document
    .querySelectorAll(
        ".color-option"
    )
    .forEach(
        element => {

            element.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".color-option"
                        )
                        .forEach(
                            x =>
                                x.classList.remove(
                                    "active-color"
                                )
                        );


                    element.classList.add(
                        "active-color"
                    );


                    currentColor =
                        element.dataset.color ||
                        "#ffd700";

                }
            );

        }
    );


// =========================================================
// LOGIN
// =========================================================

function setLoginStatus(
    text,
    error = false
){

    if(!loginStatus)
        return;


    loginStatus.textContent =
        text || "";


    loginStatus.style.color =
        error
            ? "#ff9d9d"
            : "#9dffca";

}


function joinChat(){

    if(loginPending)
        return;


    if(!username)
        return;


    const name =
        username.value.trim();


    if(!name){

        setLoginStatus(
            "اكتب اسمك أولاً",
            true
        );

        username.focus();

        return;
    }


    loginPending =
        true;


    setLoginStatus(
        "جارٍ الدخول...",
        false
    );


    socket.emit(
        "join",
        {
            username:
                name,

            adminPassword:
                adminPassword
                    ? adminPassword.value
                    : "",

            color:
                currentColor,

            deviceToken:
                navigator.userAgent
        }
    );

}


window.joinChat =
    joinChat;


// =========================================================
// LOGIN SUCCESS
// =========================================================

socket.on(
    "login success",
    data => {

        currentUser =
            username
                ? username.value.trim()
                : "";


        loginPending =
            false;


        if(loginPage){

            loginPage.style.display =
                "none";

        }


        if(chatPage){

            chatPage.style.display =
                "flex";

        }


        setLoginStatus(
            ""
        );


        createRoomInterface();


        showRoomSelection();


        updateChatViewport();

    }
);


// =========================================================
// LOGIN ERROR
// =========================================================

socket.on(
    "banned",
    msg => {

        loginPending =
            false;


        setLoginStatus(
            msg ||
            "تعذر الدخول",
            true
        );


        showToast(
            msg ||
            "تعذر تنفيذ العملية"
        );

    }
);


// =========================================================
// SOCKET CONNECTION
// =========================================================

socket.on(
    "connect",
    () => {

        if(!currentUser){

            setLoginStatus(
                ""
            );

        }

    }
);


socket.on(
    "disconnect",
    () => {

        if(currentUser){

            showToast(
                "⚠️ انقطع الاتصال بالخادم"
            );

        }

    }
);


// =========================================================
// ROOM INTERFACE
// =========================================================

let roomInterfaceCreated =
    false;


function createRoomInterface(){

    if(roomInterfaceCreated)
        return;


    roomInterfaceCreated =
        true;


    /*
       ننشئ شاشة الغرف
       من JavaScript حتى لا نحتاج
       إلى تعديل index.html الآن.
    */

    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.id =
        "roomSelection";


    wrapper.style.cssText = `
        position:fixed;
        inset:0;
        z-index:9999;
        background:#080808;
        color:white;
        display:none;
        flex-direction:column;
        overflow:hidden;
        direction:rtl;
    `;


    wrapper.innerHTML = `

        <div
            style="
                padding:22px 18px 10px;
                text-align:right;
            "
        >

            <div
                style="
                    font-size:32px;
                    font-weight:800;
                    color:white;
                "
            >
                🏠 غرف مرسال
            </div>


            <div
                style="
                    margin-top:6px;
                    color:#aaa;
                    font-size:18px;
                "
            >
                اختر الغرفة التي تريد الدخول إليها
            </div>

        </div>


        <div
            id="roomsContainer"
            style="
                flex:1;
                overflow-y:auto;
                padding:18px;
            "
        ></div>


        <div
            style="
                padding:15px 18px;
                color:#777;
                text-align:center;
                font-size:14px;
            "
        >
            🔥 Mersal Chat
        </div>

    `;


    document.body.appendChild(
        wrapper
    );

}


// =========================================================
// SHOW ROOM SELECTION
// =========================================================

function showRoomSelection(){

    createRoomInterface();


    const selection =
        $("roomSelection");


    if(!selection)
        return;


    selection.style.display =
        "flex";


    /*
       نخفي واجهة الدردشة مؤقتًا
       إلى أن يختار المستخدم غرفة.
    */

    if(chatPage){

        chatPage.style.visibility =
            "hidden";

    }


    renderRooms();

}


function hideRoomSelection(){

    const selection =
        $("roomSelection");


    if(selection){

        selection.style.display =
            "none";

    }


    if(chatPage){

        chatPage.style.visibility =
            "visible";

    }

}


// =========================================================
// RENDER ROOMS
// =========================================================

function renderRooms(){

    createRoomInterface();


    const container =
        $("roomsContainer");


    if(!container)
        return;


    container.innerHTML =
        "";


    const rooms =
        Array.isArray(
            roomsCache
        )
            ? roomsCache
            : [];


    if(!rooms.length){

        container.innerHTML = `

            <div
                style="
                    padding:40px 20px;
                    text-align:center;
                    color:#888;
                    font-size:18px;
                "
            >
                🏠 لا توجد غرف متاحة حالياً
            </div>

        `;

        return;
    }


    rooms.forEach(
        room => {

            if(
                room &&
                room.enabled === false
            ){

                return;

            }


            const card =
                document.createElement(
                    "button"
                );


            card.type =
                "button";


            card.style.cssText = `
                display:block;
                width:100%;
                margin-bottom:15px;
                padding:22px;
                border-radius:22px;
                border:1px solid #292929;
                background:#111;
                color:white;
                text-align:right;
                cursor:pointer;
                box-sizing:border-box;
            `;


            const name =
                escapeHtml(
                    room.name ||
                    "غرفة"
                );


            const description =
                escapeHtml(
                    room.description ||
                    "أهلاً وسهلاً بكم"
                );


            card.innerHTML = `

                <div
                    style="
                        font-size:28px;
                        font-weight:800;
                    "
                >
                    🏠 ${name}
                </div>


                <div
                    style="
                        margin-top:10px;
                        color:#aaa;
                        font-size:18px;
                    "
                >
                    ${description}
                </div>


                <div
                    style="
                        margin-top:16px;
                        color:#777;
                        font-size:15px;
                    "
                >
                    اضغط للدخول
                </div>

            `;


            card.addEventListener(
                "click",
                () => {

                    enterRoom(
                        room.id
                    );

                }
            );


            container.appendChild(
                card
            );

        }
    );

}


// =========================================================
// RECEIVE ROOMS
// =========================================================

socket.on(
    "rooms updated",
    rooms => {

        roomsCache =
            Array.isArray(
                rooms
            )
                ? rooms
                : [];


        renderRooms();

    }
);


// =========================================================
// ENTER ROOM
// =========================================================

function enterRoom(
    roomId
){

    if(!roomId)
        return;


    const room =
        roomsCache.find(
            r =>
                r.id === roomId
        );


    if(!room)
        return;


    /*
       نسمح بحد أقصى 3 غرف
       مفتوحة في نفس الوقت.
    */

    if(
        !openRooms.includes(
            roomId
        ) &&
        openRooms.length >= 3
    ){

        showToast(
            "⚠️ يمكنك فتح 3 غرف فقط"
        );

        return;

    }


    /*
       هذه هي النقطة المهمة:
       عند الضغط على الغرفة
       نرسل أمر السيرفر.
    */

    socket.emit(
        "join room",
        {
            roomId
        }
    );

}


// =========================================================
// ROOM JOINED
// =========================================================

socket.on(
    "room joined",
    data => {

        if(!data)
            return;


        const room =
            data.room;


        if(!room)
            return;


        currentRoom =
            room;


        activeRoomId =
            room.id;


        if(
            !openRooms.includes(
                room.id
            )
        ){

            openRooms.push(
                room.id
            );

        }


        hideRoomSelection();


        prepareRoomView(
            room
        );


        clearCurrentRoomMessages();


        showToast(
            `🏠 دخلت غرفة ${room.name}`
        );


        /*
           نطلب المستخدمين والبيانات
           الخاصة بالغرفة.
        */

        socket.emit(
            "get room users"
        );


        socket.emit(
            "get room moderation",
            room.id
        );


        socket.emit(
            "get room admins",
            room.id
        );

    }
);


// =========================================================
// ROOM ERROR
// =========================================================

socket.on(
    "room error",
    message => {

        showToast(
            message ||
            "❌ حدث خطأ في الغرفة"
        );

    }
);


// =========================================================
// ROOM DELETED
// =========================================================

socket.on(
    "room deleted",
    () => {

        const deletedId =
            activeRoomId;


        if(deletedId){

            openRooms =
                openRooms.filter(
                    id =>
                        id !==
                        deletedId
                );

        }


        currentRoom =
            null;

        activeRoomId =
            null;


        showRoomSelection();


        showToast(
            "🗑️ تم حذف الغرفة"
        );

    }
);


// =========================================================
// PREPARE ROOM VIEW
// =========================================================

function prepareRoomView(
    room
){

    const title =
        document.querySelector(
            ".top-title"
        );


    if(title){

        title.textContent =
            `🏠 ${room.name}`;

    }


    const input =
        getMessageInput();


    if(input){

        input.placeholder =
            `اكتب رسالتك في ${room.name}...`;

    }

}


// =========================================================
// CLEAR CURRENT ROOM
// =========================================================

function clearCurrentRoomMessages(){

    const messages =
        getChatMessages();


    if(messages){

        messages.innerHTML =
            "";

    }


    replyData =
        null;


    const replyBox =
        $("replyBox");


    if(replyBox){

        replyBox.style.display =
            "none";

    }

}
// =========================================================
// SEND PUBLIC MESSAGE
// =========================================================

function sendMessage(){

    const input =
        getMessageInput();


    if(!input)
        return;


    const message =
        input.value.trim();


    if(!message)
        return;


    if(!activeRoomId){

        showToast(
            "🏠 اختر غرفة أولاً"
        );

        return;
    }


    socket.emit(
        "chat message",
        {
            message,

            reply:
                replyData
        }
    );


    input.value =
        "";


    cancelReply();


    setTimeout(
        () => {

            input.focus();

        },
        20
    );

}


window.sendMessage =
    sendMessage;


// =========================================================
// ENTER KEY TO SEND
// =========================================================

document.addEventListener(
    "keydown",
    event => {

        const target =
            event.target;


        if(
            target &&
            target.id ===
                "messageInput"
        ){

            if(
                event.key ===
                    "Enter" &&
                !event.shiftKey
            ){

                event.preventDefault();

                sendMessage();

            }

        }

    }
);


// =========================================================
// RECEIVE PUBLIC MESSAGE
// =========================================================

socket.on(
    "chat message",
    data => {

        if(!data)
            return;


        const roomId =
            data.roomId ||
            activeRoomId;


        /*
           إذا كانت الرسالة لغرفة غير
           الغرفة الحالية، لا نعرضها
           في الغرفة الحالية.
        */

        if(
            roomId &&
            activeRoomId &&
            roomId !==
                activeRoomId
        ){

            return;

        }


        renderPublicMessage(
            data
        );

    }
);


// =========================================================
// RENDER PUBLIC MESSAGE
// =========================================================

function renderPublicMessage(
    data
){

    const messages =
        getChatMessages();


    if(!messages)
        return;


    const item =
        document.createElement(
            "div"
        );


    item.className =
        "mersal-message";


    item.dataset.messageId =
        data.id || "";


    const name =
        escapeHtml(
            data.name ||
            "مستخدم"
        );


    const text =
        escapeHtml(
            data.message ||
            ""
        );


    const time =
        escapeHtml(
            data.time ||
            ""
        );


    let replyHtml =
        "";


    if(data.reply){

        replyHtml = `

            <div
                style="
                    padding:8px 10px;
                    margin-bottom:8px;
                    border-right:3px solid #777;
                    background:#191919;
                    border-radius:8px;
                    color:#999;
                    font-size:13px;
                "
            >
                ↩️ ${escapeHtml(
                    data.reply.message ||
                    ""
                )}
            </div>

        `;

    }


    item.innerHTML = `

        <div
            class="message-content"
            style="
                padding:10px 13px;
            "
        >

            <div
                style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:10px;
                    margin-bottom:4px;
                "
            >

                <strong>
                    ${name}
                </strong>


                <span
                    style="
                        color:#777;
                        font-size:11px;
                    "
                >
                    ${time}
                </span>

            </div>


            ${replyHtml}


            <div
                class="message-text"
                style="
                    white-space:pre-wrap;
                    word-break:break-word;
                "
            >
                ${text}
            </div>

        </div>

    `;


    /*
       الضغط المطول على رسالة
       يفتح خيارات الرد والحذف
       في الجزء الثالث.
    */

    item.addEventListener(
        "contextmenu",
        event => {

            event.preventDefault();

            selectMessage(
                data
            );

        }
    );


    messages.appendChild(
        item
    );


    keepChatBottom();

}


// =========================================================
// SELECT MESSAGE
// =========================================================

let selectedMessage =
    null;


function selectMessage(
    data
){

    selectedMessage =
        data;


    showMessageActions(
        data
    );

}


// =========================================================
// MESSAGE ACTIONS
// =========================================================

function showMessageActions(
    data
){

    let menu =
        $("messageActions");


    if(!menu){

        menu =
            document.createElement(
                "div"
            );


        menu.id =
            "messageActions";


        menu.style.cssText = `
            position:fixed;
            left:15px;
            right:15px;
            bottom:90px;
            z-index:10001;
            background:#181818;
            border:1px solid #333;
            border-radius:18px;
            padding:12px;
            box-shadow:0 10px 40px rgba(0,0,0,.5);
            direction:rtl;
        `;


        document.body.appendChild(
            menu
        );

    }


    menu.innerHTML = `

        <button
            type="button"
            id="replyMessageButton"
            style="
                width:100%;
                padding:13px;
                border:0;
                border-radius:12px;
                background:#292929;
                color:white;
                margin-bottom:8px;
                font-size:16px;
            "
        >
            ↩️ رد
        </button>


        <button
            type="button"
            id="closeMessageActions"
            style="
                width:100%;
                padding:13px;
                border:0;
                border-radius:12px;
                background:#222;
                color:#aaa;
                font-size:16px;
            "
        >
            إلغاء
        </button>

    `;


    menu.style.display =
        "block";


    const replyButton =
        $("replyMessageButton");


    if(replyButton){

        replyButton.onclick =
            () => {

                startReply(
                    data
                );

                hideMessageActions();

            };

    }


    const closeButton =
        $("closeMessageActions");


    if(closeButton){

        closeButton.onclick =
            hideMessageActions;

    }

}


function hideMessageActions(){

    const menu =
        $("messageActions");


    if(menu){

        menu.style.display =
            "none";

    }

}


function startReply(
    data
){

    replyData = {

        id:
            data.id,

        name:
            data.name,

        message:
            data.message

    };


    let replyBox =
        $("replyBox");


    if(!replyBox){

        replyBox =
            document.createElement(
                "div"
            );


        replyBox.id =
            "replyBox";


        replyBox.style.cssText = `
            position:fixed;
            left:10px;
            right:10px;
            bottom:65px;
            z-index:9998;
            padding:10px 13px;
            background:#191919;
            border-right:3px solid #777;
            color:#bbb;
            border-radius:10px;
            direction:rtl;
        `;


        document.body.appendChild(
            replyBox
        );

    }


    replyBox.innerHTML = `

        <div
            style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
            "
        >

            <div>
                ↩️ الرد على
                <strong>
                    ${escapeHtml(
                        data.name
                    )}
                </strong>

                <div
                    style="
                        margin-top:3px;
                        color:#777;
                        font-size:13px;
                    "
                >
                    ${escapeHtml(
                        data.message
                    )}
                </div>
            </div>


            <button
                type="button"
                onclick="cancelReply()"
                style="
                    border:0;
                    background:transparent;
                    color:#aaa;
                    font-size:20px;
                "
            >
                ×
            </button>

        </div>

    `;


    replyBox.style.display =
        "block";


    const input =
        getMessageInput();


    if(input){

        input.focus();

    }

}


function cancelReply(){

    replyData =
        null;


    const replyBox =
        $("replyBox");


    if(replyBox){

        replyBox.style.display =
            "none";

    }

}


window.cancelReply =
    cancelReply;


// =========================================================
// ROOM TABS
// =========================================================

function renderRoomTabs(){

    let tabs =
        $("roomTabs");


    if(!tabs){

        tabs =
            document.createElement(
                "div"
            );


        tabs.id =
            "roomTabs";


        tabs.style.cssText = `
            display:flex;
            align-items:center;
            gap:7px;
            width:100%;
            overflow-x:auto;
            padding:8px 10px;
            box-sizing:border-box;
            background:#0b0b0b;
            border-bottom:1px solid #222;
            direction:rtl;
            scrollbar-width:none;
        `;


        const parent =
            chatPage ||
            document.body;


        parent.prepend(
            tabs
        );

    }


    tabs.innerHTML =
        "";


    openRooms.forEach(
        roomId => {

            const room =
                roomsCache.find(
                    r =>
                        r.id ===
                        roomId
                );


            if(!room)
                return;


            const tab =
                document.createElement(
                    "div"
                );


            tab.style.cssText = `
                display:flex;
                align-items:center;
                gap:7px;
                flex-shrink:0;
                padding:8px 10px;
                border-radius:12px;
                background:${
                    roomId === activeRoomId
                        ? "#333"
                        : "#171717"
                };
                color:white;
                border:1px solid ${
                    roomId === activeRoomId
                        ? "#555"
                        : "#252525"
                };
            `;


            const title =
                document.createElement(
                    "button"
                );


            title.type =
                "button";


            title.textContent =
                `🏠 ${room.name}`;


            title.style.cssText = `
                border:0;
                background:transparent;
                color:white;
                font-size:14px;
                padding:0;
            `;


            title.onclick =
                () => {

                    switchRoom(
                        roomId
                    );

                };


            const close =
                document.createElement(
                    "button"
                );


            close.type =
                "button";


            close.textContent =
                "×";


            close.style.cssText = `
                width:22px;
                height:22px;
                border:0;
                border-radius:50%;
                background:#252525;
                color:#aaa;
                font-size:17px;
                line-height:20px;
            `;


            close.onclick =
                event => {

                    event.stopPropagation();

                    closeRoom(
                        roomId
                    );

                };


            tab.appendChild(
                title
            );


            tab.appendChild(
                close
            );


            tabs.appendChild(
                tab
            );

        }
    );


    /*
       زر + لفتح غرفة أخرى
    */

    const add =
        document.createElement(
            "button"
        );


    add.type =
        "button";


    add.textContent =
        "＋";


    add.title =
        "فتح غرفة";


    add.style.cssText = `
        flex-shrink:0;
        width:42px;
        height:42px;
        border-radius:50%;
        border:1px solid #333;
        background:#202020;
        color:white;
        font-size:27px;
    `;


    add.onclick =
        () => {

            showRoomSelection();

        };


    tabs.appendChild(
        add
    );

}


// =========================================================
// SWITCH ROOM
// =========================================================

function switchRoom(
    roomId
){

    if(
        !openRooms.includes(
            roomId
        )
    ){

        enterRoom(
            roomId
        );

        return;

    }


    if(
        roomId ===
        activeRoomId
    ){

        return;

    }


    socket.emit(
        "join room",
        {
            roomId
        }
    );

}


function closeRoom(
    roomId
){

    if(!roomId)
        return;


    openRooms =
        openRooms.filter(
            id =>
                id !==
                roomId
        );


    /*
       إذا أغلقنا الغرفة الحالية،
       ننتقل إلى غرفة أخرى إن وجدت.
    */

    if(
        roomId ===
        activeRoomId
    ){

        if(openRooms.length){

            const nextRoom =
                openRooms[
                    openRooms.length - 1
                ];


            activeRoomId =
                null;


            currentRoom =
                null;


            socket.emit(
                "join room",
                {
                    roomId:
                        nextRoom
                }
            );

        }else{

            activeRoomId =
                null;

            currentRoom =
                null;


            showRoomSelection();

        }

    }


    renderRoomTabs();

}


window.switchRoom =
    switchRoom;


window.closeRoom =
    closeRoom;


// =========================================================
// WHEN ROOM CHANGES
// =========================================================

const originalPrepareRoomView =
    prepareRoomView;


prepareRoomView =
    function(room){

        currentRoom =
            room;


        activeRoomId =
            room.id;


        if(
            !openRooms.includes(
                room.id
            )
        ){

            openRooms.push(
                room.id
            );

        }


        originalPrepareRoomView(
            room
        );


        renderRoomTabs();

    };


// =========================================================
// ROOM USERS
// =========================================================

socket.on(
    "room users",
    users => {

        usersCache =
            Array.isArray(
                users
            )
                ? users
                : [];


        renderRoomUsers();

    }
);


// =========================================================
// RENDER ROOM USERS
// =========================================================

function renderRoomUsers(){

    let list =
        $("roomUsers");


    /*
       إذا لم يكن عندك roomUsers
       ننشئه تلقائيًا.
    */

    if(!list){

        list =
            document.createElement(
                "div"
            );


        list.id =
            "roomUsers";


        list.style.cssText = `
            position:fixed;
            top:80px;
            right:10px;
            width:220px;
            max-height:55vh;
            overflow-y:auto;
            z-index:9990;
            display:none;
            padding:10px;
            border-radius:15px;
            background:#111;
            border:1px solid #292929;
            direction:rtl;
            box-sizing:border-box;
        `;


        document.body.appendChild(
            list
        );

    }


    list.innerHTML = `

        <div
            style="
                font-weight:bold;
                padding:8px;
                border-bottom:1px solid #292929;
                margin-bottom:5px;
            "
        >
            👥 الموجودون
            (${usersCache.length})
        </div>

    `;


    usersCache.forEach(
        user => {

            const name =
                typeof user ===
                    "string"
                    ? user
                    : user.username;


            if(!name)
                return;


            const row =
                document.createElement(
                    "div"
                );


            row.style.cssText = `
                padding:9px 7px;
                color:#ddd;
                border-bottom:1px solid #1e1e1e;
            `;


            row.innerHTML = `
                👤
                ${escapeHtml(
                    name
                )}
            `;


            row.addEventListener(
                "click",
                () => {

                    openPrivateChat(
                        name
                    );

                }
            );


            list.appendChild(
                row
            );

        }
    );

}


// =========================================================
// PRIVATE CHAT
// =========================================================

function openPrivateChat(
    name
){

    if(!name)
        return;


    if(
        currentUser &&
        name ===
            currentUser
    ){

        showToast(
            "ℹ️ لا يمكنك فتح محادثة خاصة مع نفسك"
        );

        return;

    }


    currentPrivateUser =
        name;


    currentPrivateName =
        name;


    if(
        !privateChats[name]
    ){

        privateChats[name] =
            [];

    }


    if(
        !privateUnread[name]
    ){

        privateUnread[name] =
            0;

    }


    privateUnread[name] =
        0;


    createPrivateInterface();


    renderPrivateChat();


    showPrivateInterface();

}


window.openPrivateChat =
    openPrivateChat;


// =========================================================
// PRIVATE INTERFACE
// =========================================================

function createPrivateInterface(){

    if(
        $("privatePanel")
    ){

        return;

    }


    const panel =
        document.createElement(
            "div"
        );


    panel.id =
        "privatePanel";


    panel.style.cssText = `
        position:fixed;
        inset:0;
        z-index:10000;
        display:none;
        flex-direction:column;
        background:#080808;
        color:white;
        direction:rtl;
    `;


    panel.innerHTML = `

        <div
            style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding:15px;
                background:#111;
                border-bottom:1px solid #292929;
            "
        >

            <div>

                <div
                    style="
                        font-size:18px;
                        font-weight:bold;
                    "
                    id="privateTitle"
                >
                    💬 محادثة خاصة
                </div>


                <div
                    style="
                        color:#777;
                        font-size:13px;
                        margin-top:3px;
                    "
                >
                    أنت الآن في محادثة خاصة
                </div>

            </div>


            <button
                type="button"
                id="closePrivateButton"
                style="
                    width:40px;
                    height:40px;
                    border:0;
                    border-radius:50%;
                    background:#252525;
                    color:white;
                    font-size:22px;
                "
            >
                ×
            </button>

        </div>


        <div
            id="privateMessages"
            style="
                flex:1;
                overflow-y:auto;
                padding:15px;
            "
        ></div>


        <div
            style="
                display:flex;
                gap:8px;
                padding:10px;
                background:#111;
                border-top:1px solid #222;
            "
        >

            <input
                id="privateInput"
                type="text"
                autocomplete="off"
                placeholder="اكتب رسالة خاصة..."
                style="
                    flex:1;
                    min-width:0;
                    border:1px solid #333;
                    background:#181818;
                    color:white;
                    border-radius:14px;
                    padding:12px;
                    font-size:16px;
                    outline:none;
                "
            >


            <button
                type="button"
                id="privateSendButton"
                style="
                    width:52px;
                    border:0;
                    border-radius:14px;
                    background:#292929;
                    color:white;
                    font-size:20px;
                "
            >
                ➤
            </button>

        </div>

    `;


    document.body.appendChild(
        panel
    );


    const close =
        $("closePrivateButton");


    if(close){

        close.onclick =
            hidePrivateInterface;

    }


    const send =
        $("privateSendButton");


    if(send){

        send.onclick =
            sendPrivateMessage;

    }


    const input =
        $("privateInput");


    if(input){

        input.addEventListener(
            "keydown",
            event => {

                if(
                    event.key ===
                        "Enter"
                ){

                    event.preventDefault();

                    sendPrivateMessage();

                }

            }
        );

    }

}


// =========================================================
// SHOW PRIVATE
// =========================================================

function showPrivateInterface(){

    createPrivateInterface();


    const panel =
        $("privatePanel");


    if(panel){

        panel.style.display =
            "flex";

    }


    renderPrivateChat();


    const input =
        $("privateInput");


    if(input){

        setTimeout(
            () => {

                input.focus();

            },
            100
        );

    }

}


// =========================================================
// HIDE PRIVATE
// =========================================================

function hidePrivateInterface(){

    const panel =
        $("privatePanel");


    if(panel){

        panel.style.display =
            "none";

    }


    currentPrivateUser =
        null;

}


// =========================================================
// SEND PRIVATE MESSAGE
// =========================================================

function sendPrivateMessage(){

    if(!currentPrivateUser)
        return;


    const input =
        getPrivateInput();


    if(!input)
        return;


    const message =
        input.value.trim();


    if(!message)
        return;


    socket.emit(
        "private message",
        {
            to:
                currentPrivateUser,

            message
        }
    );


    input.value =
        "";


    setTimeout(
        () => {

            input.focus();

        },
        20
    );

}


window.sendPrivateMessage =
    sendPrivateMessage;


// =========================================================
// RECEIVE PRIVATE MESSAGE
// =========================================================

socket.on(
    "private message",
    data => {

        if(!data)
            return;


        const from =
            data.from;


        const to =
            data.to;


        let partner;


        if(
            from ===
                currentUser
        ){

            partner =
                to;

        }else{

            partner =
                from;

        }


        if(!partner)
            return;


        if(
            !privateChats[partner]
        ){

            privateChats[partner] =
                [];

        }


        privateChats[partner].push(
            data
        );


        if(
            currentPrivateUser !==
                partner
        ){

            privateUnread[partner] =
                (
                    privateUnread[
                        partner
                    ] ||
                    0
                ) + 1;


            showToast(
                `💬 رسالة خاصة من ${partner}`
            );

            updatePrivateNotification();

            return;

        }


        renderPrivateChat();

    }
);


// =========================================================
// PRIVATE NOTIFICATION
// =========================================================

socket.on(
    "private notification",
    data => {

        if(!data)
            return;


        if(
            data.from ===
                currentPrivateUser
        ){

            return;

        }


        const name =
            data.from;


        privateUnread[name] =
            (
                privateUnread[name] ||
                0
            ) + 1;


        updatePrivateNotification();

    }
);


// =========================================================
// RENDER PRIVATE CHAT
// =========================================================

function renderPrivateChat(){

    const box =
        getPrivateMessages();


    if(!box)
        return;


    box.innerHTML =
        "";


    if(!currentPrivateUser)
        return;


    const title =
        $("privateTitle");


    if(title){

        title.textContent =
            `💬 أنت الآن في محادثة خاصة مع ${currentPrivateUser}`;

    }


    const messages =
        privateChats[
            currentPrivateUser
        ] || [];


    messages.forEach(
        data => {

            const mine =
                data.from ===
                currentUser;


            const row =
                document.createElement(
                    "div"
                );


            row.style.cssText = `
                display:flex;
                justify-content:${
                    mine
                        ? "flex-start"
                        : "flex-end"
                };
                margin-bottom:9px;
            `;


            const bubble =
                document.createElement(
                    "div"
                );


            bubble.style.cssText = `
                max-width:82%;
                padding:10px 13px;
                border-radius:15px;
                background:${
                    mine
                        ? "#242424"
                        : "#151515"
                };
                border:1px solid #292929;
                color:white;
                word-break:break-word;
            `;


            bubble.innerHTML = `

                <div
                    style="
                        font-size:11px;
                        color:#777;
                        margin-bottom:4px;
                    "
                >
                    ${escapeHtml(
                        data.time || ""
                    )}
                </div>


                <div
                    style="
                        white-space:pre-wrap;
                    "
                >
                    ${escapeHtml(
                        data.message ||
                        ""
                    )}
                </div>

            `;


            row.appendChild(
                bubble
            );


            box.appendChild(
                row
            );

        }
    );


    keepChatBottom();

}


// =========================================================
// PRIVATE NOTIFICATION BADGE
// =========================================================

function updatePrivateNotification(){

    let total =
        0;


    Object.values(
        privateUnread
    ).forEach(
        count => {

            total +=
                Number(
                    count || 0
                );

        }
    );


    let badge =
        $("privateNotificationBadge");


    if(!badge){

        badge =
            document.createElement(
                "span"
            );


        badge.id =
            "privateNotificationBadge";


        badge.style.cssText = `
            position:fixed;
            top:70px;
            left:15px;
            z-index:9999;
            min-width:24px;
            height:24px;
            padding:0 7px;
            display:none;
            align-items:center;
            justify-content:center;
            border-radius:20px;
            background:#b00020;
            color:white;
            font-size:12px;
            font-weight:bold;
        `;


        document.body.appendChild(
            badge
        );

    }


    if(total > 0){

        badge.textContent =
            total > 99
                ? "99+"
                : total;


        badge.style.display =
            "flex";

    }else{

        badge.style.display =
            "none";

    }

}


// =========================================================
// PRIVATE ERROR
// =========================================================

socket.on(
    "private error",
    message => {

        showToast(
            message ||
            "❌ تعذر إرسال الرسالة الخاصة"
        );

    }
);


// =========================================================
// ROOM MODERATION NOTICES
// =========================================================

socket.on(
    "room moderation notice",
    data => {

        if(!data)
            return;


        if(
            data.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        showRoomNotice(
            data.message ||
            ""
        );

    }
);


function showRoomNotice(
    message
){

    const messages =
        getChatMessages();


    if(!messages)
        return;


    const notice =
        document.createElement(
            "div"
        );


    notice.style.cssText = `
        margin:8px auto;
        padding:8px 13px;
        width:max-content;
        max-width:90%;
        background:#1b1b1b;
        border:1px solid #333;
        border-radius:15px;
        color:#d0d0d0;
        text-align:center;
        font-size:13px;
    `;


    notice.textContent =
        message;


    messages.appendChild(
        notice
    );


    keepChatBottom();

}


// =========================================================
// ROOM NOTICE
// =========================================================

socket.on(
    "room notice",
    data => {

        if(!data)
            return;


        showRoomNotice(
            data.message ||
            ""
        );

    }
);


// =========================================================
// ADMIN ASSIGNED NOTICE
// =========================================================

socket.on(
    "room admins updated",
    data => {

        if(!data)
            return;


        if(
            data.roomId ===
            activeRoomId
        ){

            showRoomNotice(
                `👑 تم تحديث أدمن الغرفة`
            );

        }

    }
);


// =========================================================
// ROOM SETTINGS
// =========================================================

socket.on(
    "room setting changed",
    data => {

        if(!data)
            return;


        if(
            data.setting ===
                "starsMode"
        ){

            showToast(
                data.value
                    ? "⭐ تم تشغيل وضع النجوم"
                    : "⭐ تم إيقاف وضع النجوم"
            );

        }


        if(
            data.setting ===
                "chatLocked"
        ){

            showToast(
                data.value
                    ? "🔒 تم قفل الدردشة"
                    : "🔓 تم فتح الدردشة"
            );

        }


        if(
            data.setting ===
                "maintenance"
        ){

            showToast(
                data.value
                    ? "🛠️ الغرفة تحت الصيانة"
                    : "✅ انتهت الصيانة"
            );

        }

    }
);


// =========================================================
// ROOM STATUS
// =========================================================

socket.on(
    "room status",
    data => {

        if(!data)
            return;


        if(
            data.enabled === false
        ){

            showToast(
                "⛔ تم إيقاف هذه الغرفة"
            );


            showRoomSelection();

        }

    }
);
// =========================================================
// USER LIST BUTTON
// =========================================================

function toggleRoomUsers(){

    const list =
        $("roomUsers");

    if(!list)
        return;


    if(list.style.display === "none"){

        renderRoomUsers();

        list.style.display =
            "block";

    }else{

        list.style.display =
            "none";

    }

}


window.toggleRoomUsers =
    toggleRoomUsers;


// =========================================================
// PRIVATE LIST
// =========================================================

function showPrivateUsers(){

    let box =
        $("privateUsersList");


    if(!box){

        box =
            document.createElement(
                "div"
            );


        box.id =
            "privateUsersList";


        box.style.cssText = `
            position:fixed;
            inset:0;
            z-index:10002;
            display:none;
            background:#080808;
            color:white;
            direction:rtl;
            overflow-y:auto;
        `;


        document.body.appendChild(
            box
        );

    }


    box.innerHTML = `

        <div
            style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding:16px;
                background:#111;
                border-bottom:1px solid #292929;
            "
        >

            <strong
                style="
                    font-size:20px;
                "
            >
                💬 المحادثات الخاصة
            </strong>


            <button
                type="button"
                id="closePrivateUsers"
                style="
                    width:40px;
                    height:40px;
                    border:0;
                    border-radius:50%;
                    background:#252525;
                    color:white;
                    font-size:22px;
                "
            >
                ×
            </button>

        </div>


        <div
            id="privateUsersItems"
            style="
                padding:12px;
            "
        ></div>

    `;


    const items =
        $("privateUsersItems");


    Object.keys(
        privateChats
    ).forEach(
        name => {

            const row =
                document.createElement(
                    "button"
                );


            row.type =
                "button";


            row.style.cssText = `
                display:block;
                width:100%;
                padding:15px;
                margin-bottom:8px;
                border:1px solid #292929;
                border-radius:14px;
                background:#121212;
                color:white;
                text-align:right;
            `;


            const unread =
                privateUnread[name] ||
                0;


            row.innerHTML = `

                <div
                    style="
                        font-size:17px;
                        font-weight:bold;
                    "
                >
                    👤
                    ${escapeHtml(name)}

                    ${
                        unread
                            ? `
                                <span
                                    style="
                                        float:left;
                                        background:#b00020;
                                        border-radius:20px;
                                        padding:3px 8px;
                                        font-size:11px;
                                    "
                                >
                                    ${unread}
                                </span>
                            `
                            : ""
                    }

                </div>

            `;


            row.onclick =
                () => {

                    box.style.display =
                        "none";

                    openPrivateChat(
                        name
                    );

                };


            items.appendChild(
                row
            );

        }
    );


    if(
        !Object.keys(
            privateChats
        ).length
    ){

        items.innerHTML = `

            <div
                style="
                    padding:40px 10px;
                    text-align:center;
                    color:#777;
                "
            >
                لا توجد محادثات خاصة حتى الآن
            </div>

        `;

    }


    const close =
        $("closePrivateUsers");


    if(close){

        close.onclick =
            () => {

                box.style.display =
                    "none";

            };

    }


    box.style.display =
        "block";

}


window.showPrivateUsers =
    showPrivateUsers;


// =========================================================
// ADMIN / MODERATION PANEL INSIDE CHAT
// =========================================================

let roomAdminData = null;

let roomModerationData = null;


socket.on(
    "room admins",
    data => {

        roomAdminData =
            data || null;

    }
);


socket.on(
    "room moderation",
    data => {

        roomModerationData =
            data || null;

        applyRoomModerationState();

    }
);


// =========================================================
// APPLY ROOM MODERATION STATE
// =========================================================

function applyRoomModerationState(){

    if(!roomModerationData)
        return;


    if(
        roomModerationData.chatLocked
    ){

        disableMessageInput(
            "🔒 الدردشة مقفلة حاليًا"
        );

    }else{

        enableMessageInput();

    }


    if(
        roomModerationData.maintenance
    ){

        showRoomNotice(
            "🛠️ الغرفة تحت الصيانة حاليًا"
        );

    }

}


// =========================================================
// DISABLE MESSAGE INPUT
// =========================================================

function disableMessageInput(
    text
){

    const input =
        getMessageInput();


    if(input){

        input.disabled =
            true;

        input.placeholder =
            text ||
            "الدردشة مقفلة";

    }


    const buttons =
        document.querySelectorAll(
            "[data-send-message]"
        );


    buttons.forEach(
        button => {

            button.disabled =
                true;

        }
    );

}


// =========================================================
// ENABLE MESSAGE INPUT
// =========================================================

function enableMessageInput(){

    const input =
        getMessageInput();


    if(input){

        input.disabled =
            false;


        if(currentRoom){

            input.placeholder =
                `اكتب رسالتك في ${currentRoom.name}...`;

        }else{

            input.placeholder =
                "اكتب رسالتك...";

        }

    }


    const buttons =
        document.querySelectorAll(
            "[data-send-message]"
        );


    buttons.forEach(
        button => {

            button.disabled =
                false;

        }
    );

}


// =========================================================
// STAR MODE
// =========================================================

let roomStarsMode =
    false;


socket.on(
    "room stars mode",
    data => {

        if(!data)
            return;


        if(
            data.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        roomStarsMode =
            Boolean(
                data.enabled
            );


        updateStarsUI();

    }
);


function updateStarsUI(){

    const button =
        $("starButton");


    if(!button)
        return;


    if(roomStarsMode){

        button.style.display =
            "block";

    }else{

        button.style.display =
            "none";

    }

}


// =========================================================
// GIVE STAR
// =========================================================

function giveStar(
    username
){

    if(!username)
        return;


    if(!activeRoomId){

        showToast(
            "🏠 اختر غرفة أولاً"
        );

        return;

    }


    socket.emit(
        "give room star",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


window.giveStar =
    giveStar;


// =========================================================
// REMOVE STAR
// =========================================================

function removeStar(
    username
){

    if(!username)
        return;


    socket.emit(
        "remove room star",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


window.removeStar =
    removeStar;


// =========================================================
// STAR EVENTS
// =========================================================

socket.on(
    "room star given",
    data => {

        if(!data)
            return;


        showRoomNotice(
            `⭐ تم إعطاء نجمة لـ ${data.username}`
        );

    }
);


socket.on(
    "room star removed",
    data => {

        if(!data)
            return;


        showRoomNotice(
            `⭐ تم إزالة النجمة من ${data.username}`
        );

    }
);


// =========================================================
// MODERATION ACTIONS
// =========================================================

function roomKick(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room kick",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


function roomBan(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room ban",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


function roomMute(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room mute",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


function roomDisconnect(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room disconnect",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


function roomUnban(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room unban",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


function roomUnmute(
    username
){

    if(!activeRoomId)
        return;


    socket.emit(
        "room unmute",
        {
            roomId:
                activeRoomId,

            username
        }
    );

}


window.roomKick =
    roomKick;

window.roomBan =
    roomBan;

window.roomMute =
    roomMute;

window.roomDisconnect =
    roomDisconnect;

window.roomUnban =
    roomUnban;

window.roomUnmute =
    roomUnmute;


// =========================================================
// DELETE ROOM MESSAGE
// =========================================================

function deleteRoomMessage(
    messageId
){

    if(!messageId)
        return;


    if(!activeRoomId)
        return;


    socket.emit(
        "delete room message",
        {
            roomId:
                activeRoomId,

            messageId
        }
    );

}


window.deleteRoomMessage =
    deleteRoomMessage;


// =========================================================
// ROOM MESSAGE DELETED
// =========================================================

socket.on(
    "room message deleted",
    data => {

        if(!data)
            return;


        if(
            data.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        const element =
            document.querySelector(
                `[data-message-id="${CSS.escape(
                    String(
                        data.messageId ||
                        ""
                    )
                )}"]`
            );


        if(element){

            element.remove();

        }

    }
);


// =========================================================
// FORCE LEAVE ROOM
// =========================================================

socket.on(
    "room kicked",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        if(activeRoomId){

            openRooms =
                openRooms.filter(
                    id =>
                        id !==
                        activeRoomId
                );

        }


        currentRoom =
            null;

        activeRoomId =
            null;


        showRoomSelection();


        showToast(
            "👢 تم طردك من الغرفة"
        );

    }
);


socket.on(
    "room banned",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        openRooms = [];


        currentRoom =
            null;

        activeRoomId =
            null;


        showRoomSelection();


        showToast(
            "🚫 تم حظرك من هذه الغرفة"
        );

    }
);


socket.on(
    "room disconnected",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        openRooms = [];


        currentRoom =
            null;

        activeRoomId =
            null;


        showRoomSelection();


        showToast(
            "⛔ تم فصلك من الغرفة"
        );

    }
);


// =========================================================
// MUTE STATUS
// =========================================================

socket.on(
    "room muted",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        disableMessageInput(
            "🔇 أنت مكتوم في هذه الغرفة"
        );


        showToast(
            "🔇 تم كتمك في الغرفة"
        );

    }
);


socket.on(
    "room unmuted",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        enableMessageInput();


        showToast(
            "🔊 تم فك الكتم عنك"
        );

    }
);


// =========================================================
// ROOM SWITCH WITH SWIPE
// =========================================================

let touchStartX =
    0;

let touchStartY =
    0;


document.addEventListener(
    "touchstart",
    event => {

        if(
            !event.touches ||
            !event.touches.length
        ){

            return;

        }


        touchStartX =
            event.touches[0].clientX;


        touchStartY =
            event.touches[0].clientY;

    },
    {
        passive:true
    }
);


document.addEventListener(
    "touchend",
    event => {

        if(
            !event.changedTouches ||
            !event.changedTouches.length
        ){

            return;

        }


        const endX =
            event.changedTouches[0].clientX;


        const endY =
            event.changedTouches[0].clientY;


        const diffX =
            endX -
            touchStartX;


        const diffY =
            endY -
            touchStartY;


        /*
           إذا كانت الحركة عمودية
           نتركها للتمرير الطبيعي.
        */

        if(
            Math.abs(diffY) >
            Math.abs(diffX)
        ){

            return;

        }


        /*
           لا نعتبر الحركة Swipe
           إلا إذا كانت واضحة.
        */

        if(
            Math.abs(diffX) <
            70
        ){

            return;

        }


        if(
            openRooms.length <
            2
        ){

            return;

        }


        const index =
            openRooms.indexOf(
                activeRoomId
            );


        if(index < 0)
            return;


        let nextIndex;


        if(diffX < 0){

            /*
               سحب لليسار
            */

            nextIndex =
                index + 1;

        }else{

            /*
               سحب لليمين
            */

            nextIndex =
                index - 1;

        }


        if(
            nextIndex < 0 ||
            nextIndex >=
                openRooms.length
        ){

            return;

        }


        switchRoom(
            openRooms[
                nextIndex
            ]
        );

    },
    {
        passive:true
    }
);


// =========================================================
// ROOM LIST UPDATE
// =========================================================

socket.on(
    "rooms updated",
    rooms => {

        roomsCache =
            Array.isArray(
                rooms
            )
                ? rooms
                : [];


        /*
           إذا تم حذف غرفة
           وهي مفتوحة عند المستخدم،
           نغلقها.
        */

        openRooms =
            openRooms.filter(
                roomId =>
                    roomsCache.some(
                        room =>
                            room.id ===
                            roomId
                    )
            );


        if(
            activeRoomId &&
            !openRooms.includes(
                activeRoomId
            )
        ){

            activeRoomId =
                null;

            currentRoom =
                null;

            showRoomSelection();

        }


        renderRooms();

        renderRoomTabs();

    }
);


// =========================================================
// LOGIN / ROOM INITIAL LOAD
// =========================================================

socket.on(
    "login success",
    () => {

        /*
           السيرفر الجديد يرسل الغرف
           بعد تسجيل الدخول.
        */

        socket.emit(
            "get rooms"
        );

    }
);


// =========================================================
// GET ROOMS RESULT
// =========================================================

socket.on(
    "rooms list",
    rooms => {

        roomsCache =
            Array.isArray(
                rooms
            )
                ? rooms
                : [];


        renderRooms();

    }
);


// =========================================================
// ADMIN NOTICE
// =========================================================

socket.on(
    "admin assigned",
    data => {

        if(
            data?.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        showRoomNotice(
            "✨ تم توكيل Admin"
        );

    }
);


// =========================================================
// ROOM PROTECTION
// =========================================================

socket.on(
    "room protection",
    data => {

        if(!data)
            return;


        if(
            data.roomId &&
            data.roomId !==
                activeRoomId
        ){

            return;

        }


        showRoomNotice(
            data.enabled
                ? "🛡️ تم تفعيل حماية الغرفة"
                : "🛡️ تم إيقاف حماية الغرفة"
        );

    }
);


// =========================================================
// GENERAL SERVER MESSAGE
// =========================================================

socket.on(
    "server message",
    message => {

        if(message){

            showToast(
                message
            );

        }

    }
);


// =========================================================
// ERROR HANDLING
// =========================================================

socket.on(
    "error message",
    message => {

        showToast(
            message ||
            "❌ حدث خطأ"
        );

    }
);


// =========================================================
// BACK TO ROOMS
// =========================================================

function backToRooms(){

    currentRoom =
        null;

    activeRoomId =
        null;


    showRoomSelection();

}


window.backToRooms =
    backToRooms;


// =========================================================
// CLEANUP BEFORE PAGE CLOSE
// =========================================================

window.addEventListener(
    "beforeunload",
    () => {

        /*
           Socket.io يتولى فصل الاتصال
           تلقائيًا.
        */

    }
);


// =========================================================
// INITIAL UI
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        createRoomInterface();

        createPrivateInterface();

        updatePrivateNotification();

        updateChatViewport();

    }
);


// =========================================================
// FINAL STARTUP
// =========================================================

createRoomInterface();

createPrivateInterface();

updatePrivateNotification();

updateChatViewport();


// =========================================================
// END OF APP.JS
// =========================================================
