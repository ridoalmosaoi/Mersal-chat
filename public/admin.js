const socket = io();

let adminLogged = false;

/* LOGIN */

function loginAdmin(){

const token =

document
.getElementById(
"adminToken"
)
.value
.trim();

if(token !== "MERSAL_ADMIN_2026"){

alert(
"توكن الإدارة خطأ 🚫"
);

return;

}

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

socket.emit(
"admin panel login"
);

}

/* CONNECT */

socket.on(

"connect",

()=>{

console.log(
"Admin Connected ✅"
);

if(adminLogged){

socket.emit(
"admin panel login"
);

}

});

/* ONLINE USERS */

socket.on(

"admin online users",

(users)=>{

const box =

document.getElementById(
"onlineUsers"
);

if(!box){
return;
}

box.innerHTML = "";

if(users.length <= 0){

box.innerHTML = `

<div class="user-card">

لا يوجد متصلين 😎

</div>

`;

return;

}

users.forEach(user=>{

const div =

document.createElement(
"div"
);

div.className =
"user-card";

div.innerHTML = `

👤 ${user.username}

<br>

🌐 ${user.ip}

<br>

💻 ${user.device || "Unknown"}

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

⛔ فصل كلي

</button>

`;

box.appendChild(
div
);

});

});

/* BANNED USERS */

socket.on(

"admin banned users",

(list)=>{

const box =

document.getElementById(
"bannedUsers"
);

if(!box){
return;
}

box.innerHTML = "";

if(list.length <= 0){

box.innerHTML = `

<div class="user-card">

لا يوجد محظورين 😎

</div>

`;

return;

}

list.forEach((ban,index)=>{

const div =

document.createElement(
"div"
);

div.className =
"user-card";

div.innerHTML = `

👤 ${ban.username}

<br>

🌐 ${ban.ip}

<br>

🚫 ${

ban.fullDisconnect

?

"فصل كلي"

:

"حظر"

}

<br><br>

<button onclick="
unbanUser(${index})
">

✅ فك الحظر

</button>

`;

box.appendChild(
div
);

});

});

/* ADMINS */

let admins = [];

/* ADD ADMIN */

function addAdmin(){

const input =

document.getElementById(
"newAdminName"
);

const name =
input.value.trim();

if(!name){
return;
}

admins.push(name);

input.value = "";

renderAdmins();

}

/* RENDER ADMINS */

function renderAdmins(){

const box =

document.getElementById(
"adminsList"
);

if(!box){
return;
}

box.innerHTML = "";

if(admins.length <= 0){

box.innerHTML = `

<div class="user-card">

لا يوجد أدمنية 👀

</div>

`;

return;

}

admins.forEach((admin,index)=>{

const div =

document.createElement(
"div"
);

div.className =
"user-card";

div.innerHTML = `

👮 ${admin}

<br><br>

<button onclick="
removeAdmin(${index})
">

❌ حذف

</button>

`;

box.appendChild(
div
);

});

}

/* REMOVE ADMIN */

function removeAdmin(index){

admins.splice(index,1);

renderAdmins();

}

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

/* SETTINGS */

function toggleChatLock(){

socket.emit(
"toggle chat lock"
);

alert(
"تم تغيير حالة العام 😎"
);

}

function togglePrivateLock(){

socket.emit(
"toggle private lock"
);

alert(
"تم تغيير حالة الخاص 😎"
);

}

function clearChat(){

socket.emit(
"clear chat"
);

alert(
"تم تنظيف الشات 🧹"
);

}

function maintenanceMode(){

socket.emit(
"maintenance mode"
);

alert(
"تم تشغيل وضع الصيانة 🛠️"
);

}

/* SERVER INFO */

socket.on(

"server stats",

(stats)=>{

const box =

document.getElementById(
"serverInfo"
);

if(!box){
return;
}

box.innerHTML = `

🟢 السيرفر يعمل

<br><br>

👥 المتصلين:
${stats.onlineUsers}

<br><br>

🚫 المحظورين:
${stats.bannedUsers}

`;

});

/* AUTO REFRESH */

setInterval(()=>{

if(adminLogged){

socket.emit(
"admin panel login"
);

}

},5000);
