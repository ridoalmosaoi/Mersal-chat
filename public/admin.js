const socket = io();

let adminLogged = false;

/* LOGIN */

function loginAdmin(){

const name =

document
.getElementById(
"adminName"
)
.value
.trim();

const password =

document
.getElementById(
"adminPassword"
)
.value
.trim();

if(!name || !password){

alert(
"املأ المعلومات"
);

return;

}

socket.emit(

"admin panel login",

{

name:name,

password:password

}

);

}

/* LOGIN SUCCESS */

socket.on(

"admin login success",

()=>{

adminLogged = true;

document
.getElementById(
"adminLogin"
)
.style.display =
"none";

document
.getElementById(
"adminPanel"
)
.style.display =
"block";

alert(
"✅ تم تسجيل الدخول"
);

});

/* LOGIN FAILED */

socket.on(

"admin login failed",

()=>{

alert(
"❌ معلومات خاطئة"
);

});

/* ONLINE USERS */

socket.on(

"admin online users",

(users)=>{

const box =

document.getElementById(
"onlineUsers"
);

box.innerHTML = "";

users.forEach(user=>{

const div =
document.createElement("div");

div.className =
"user-card";

div.innerHTML = `

👤 ${user.username}

<br><br>

<button onclick="
kickUser('${user.id}')
">

⚠️ طرد

</button>

<button onclick="
banUser('${user.id}')
">

🚫 حظر

</button>

<button onclick="
disconnectUser('${user.id}')
">

⛔ فصل

</button>

`;

box.appendChild(div);

});

});

/* BANNED */

socket.on(

"admin banned users",

(list)=>{

const box =

document.getElementById(
"bannedUsers"
);

box.innerHTML = "";

list.forEach((ban,index)=>{

const div =
document.createElement("div");

div.className =
"user-card";

div.innerHTML = `

🚫 ${ban.username}

<br><br>

<button onclick="
unbanUser(${index})
">

✅ فك الحظر

</button>

`;

box.appendChild(div);

});

});

/* ADMINS */

socket.on(

"admins list",

(admins)=>{

const box =

document.getElementById(
"adminsList"
);

box.innerHTML = "";

admins.forEach((admin,index)=>{

const div =
document.createElement("div");

div.className =
"user-card";

div.innerHTML = `

👮 ${admin.name}

`;

box.appendChild(div);

});

});

/* SERVER INFO */

socket.on(

"server stats",

(stats)=>{

document.getElementById(
"serverInfo"
).innerHTML = `

👥 المتصلين:
${stats.onlineUsers}

<br><br>

🚫 المحظورين:
${stats.bannedUsers}

<br><br>

👮 الأدمنية:
${stats.admins}

`;

});

/* ACTIONS */

function kickUser(id){

socket.emit(
"kick user",
id
);

}

function banUser(id){

socket.emit(
"ban user",
id
);

}

function disconnectUser(id){

socket.emit(
"disconnect user",
id
);

}

function unbanUser(index){

socket.emit(
"unban user",
index
);

}

function clearChat(){

socket.emit(
"clear chat"
);

}

function toggleChatLock(){

socket.emit(
"toggle chat lock"
);

}

function togglePrivateLock(){

socket.emit(
"toggle private lock"
);

}

function maintenanceMode(){

socket.emit(
"maintenance mode"
);

}

/* ADD ADMIN */

function addAdmin(){

const name =

document
.getElementById(
"newAdminName"
)
.value
.trim();

const password =

document
.getElementById(
"newAdminPassword"
)
.value
.trim();

if(!name || !password){

return;

}

socket.emit(

"add admin",

{

name:name,

password:password

}

);

}
