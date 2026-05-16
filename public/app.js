/* =========================
   بيانات المستخدم الحالي
========================= */

let currentPrivateUser = "Ahmed";

/* =========================
   فتح الخاص
========================= */

function openPrivateChat(username) {

    currentPrivateUser = username;

    const privateBox =
        document.getElementById("privateChatBox");

    privateBox.style.display = "block";

    document.getElementById("privateChatTitle").innerText =
        username;

    scrollMessagesToBottom();
}

/* =========================
   اغلاق الخاص
========================= */

function closePrivateChat() {

    document.getElementById("privateChatBox").style.display =
        "none";
}

/* =========================
   ارسال رسالة
========================= */

function sendPrivateMessage() {

    const input =
        document.getElementById("privateMessageInput");

    const messages =
        document.getElementById("privateMessages");

    const text =
        input.value.trim();

    /* منع الرسالة الفارغة */

    if(text === ""){

        return;
    }

    /* إنشاء الرسالة */

    const msg =
        document.createElement("div");

    msg.classList.add("message");

    msg.classList.add("my-message");

    msg.innerText = text;

    messages.appendChild(msg);

    /* تنظيف الانبوت */

    input.value = "";

    /* نزول تلقائي */

    scrollMessagesToBottom();

    /* رد وهمي للتجربة */

    fakeReply();
}

/* =========================
   رد وهمي للتجربة
========================= */

function fakeReply(){

    const messages =
        document.getElementById("privateMessages");

    const replies = [

        "هلا وغلا 😄",

        "شلونك",

        "تمام 🔥",

        "نورت الخاص",

        "هههه 😂",

        "اوكي 👍",

        "صار خير 😎"
    ];

    const randomReply =
        replies[Math.floor(Math.random() * replies.length)];

    setTimeout(() => {

        const reply =
            document.createElement("div");

        reply.classList.add("message");

        reply.innerText = randomReply;

        messages.appendChild(reply);

        scrollMessagesToBottom();

    }, 1200);
}

/* =========================
   النزول التلقائي
========================= */

function scrollMessagesToBottom(){

    const messages =
        document.getElementById("privateMessages");

    messages.scrollTop =
        messages.scrollHeight;
}

/* =========================
   ارسال بالإنتر
========================= */

document
.getElementById("privateMessageInput")
.addEventListener("keypress", function(event){

    if(event.key === "Enter"){

        sendPrivateMessage();
    }
});

/* =========================
   فتح خاص تجريبي
========================= */

openPrivateChat("Admin");

/* =========================
   بيانات وهمية للمستخدم
========================= */

function loadUserInfo(){

    console.log("تم تحميل معلومات المستخدم");
}

loadUserInfo();
