const socket=io();

/* GLOBAL */

let adminPermissions={};

/* ELEMENTS */

const loginPage=document.getElementById("adminLogin");
const panel=document.getElementById("adminPanel");
const onlineUsers=document.getElementById("onlineUsers");
const logsBox=document.getElementById("logsBox");

/* LOGIN */

function loginAdmin(){

const name=document
.getElementById("adminName")
.value.trim();

const password=document
.getElementById("adminPass")
.value.trim();

if(!name||!password){

alert("أدخل البيانات");
return;

}

socket.emit(
"admin panel login",
{
name,
password
}
);

}

/* LOGIN EVENTS */

socket.on(
"admin login success",
data=>{

adminPermissions=
data.permissions||{};

loginPage.style.display="none";
panel.style.display="flex";

addLog(
"✅ تم تسجيل الدخول"
);

});

socket.on(
"admin login failed",
()=>{

alert(
"❌ بيانات خاطئة"
);

});

/* USERS */

socket.on(
"admin online users",
users=>{

onlineUsers.innerHTML="";

users.forEach(user=>{

const div=
document.createElement("div");

div.className=
"user-card";

let buttons="";

/* INFO */

if(adminPermissions.viewUserInfo){

buttons+=`
<button onclick="viewUser('${user.id}')">
ℹ️ معلومات
</button>
`;

}

/* KICK */

if(adminPermissions.kick){

buttons+=`
<button onclick="kickUser('${user.id}')">
⚠️ طرد
</button>
`;

}

/* BAN */

if(adminPermissions.ban){

buttons+=`
<button onclick="banUser('${user.id}')">
🚫 حظر
</button>
`;

}

/* UNBAN */

if(adminPermissions.unban){

buttons+=`
<button onclick="unbanUser('${user.id}')">
🔓 فك حظر
</button>
`;

}

/* MUTE */

if(adminPermissions.mute){

buttons+=`
<button onclick="muteUser('${user.id}')">
🔇 كتم
</button>
`;

}
  /* STARS */

if(adminPermissions.stars){

buttons+=`
<button onclick="giveStar('${user.username}')">
⭐ نجمة
</button>
`;

buttons+=`
<button onclick="removeStar('${user.username}')">
⭐❌ سحب
</button>
`;

}

/* UNMUTE */

if(adminPermissions.unmute){

buttons+=`
<button onclick="unmuteUser('${user.id}')">
🔊 فك كتم
</button>
`;

}

/* DISCONNECT */

if(adminPermissions.disconnect){

buttons+=`
<button onclick="disconnectUser('${user.id}')">
⛔ فصل
</button>
`;

}

/* UNDISCONNECT */

if(adminPermissions.undisconnect){

buttons+=`
<button onclick="undisconnectUser('${user.id}')">
⛔🔓 فك فصل
</button>
`;

}

div.innerHTML=`

<div>
👤 ${user.username}
</div>

<div class="user-actions">
${buttons}
</div>

`;

onlineUsers.appendChild(div);

});

});

/* USER INFO */

function viewUser(id){

socket.emit(
"view user",
id
);

}

socket.on(
"user info",
user=>{

alert(

`👤 ${user.username}

🌐 ${user.ip}

📱 ${user.device}

🎨 ${user.color}

🆔 ${user.id}`

);

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

function unbanUser(id){

socket.emit(
"unban user",
id
);

}

function muteUser(id){

socket.emit(
"mute user",
id
);

}

function unmuteUser(id){

socket.emit(
"unmute user",
id
);

setTimeout(
loadMutedList,
500
);

}

function disconnectUser(id){

socket.emit(
"disconnect user",
id
);

}

function undisconnectUser(id){

socket.emit(
"undisconnect user",
id
);

}
/* CHAT CONTROL */

function unbanAll(){

socket.emit(
"unban all"
);

}

function unmuteAll(){

socket.emit(
"unmute all"
);

}

function undisconnectAll(){

socket.emit(
"undisconnect all"
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

function toggleMaintenance(){

socket.emit(
"maintenance mode"
);

}

/* ADD ADMIN */

function addAdmin(){

const name=
document.getElementById(
"newAdminName"
).value.trim();

const password=
document.getElementById(
"newAdminPassword"
).value.trim();

if(!name||!password){

alert(
"❌ أدخل البيانات"
);

return;

}

const permissions={

kick:
document.getElementById("permKick").checked,

ban:
document.getElementById("permBan").checked,

unban:
document.getElementById("permUnban").checked,

mute:
document.getElementById("permMute").checked,

unmute:
document.getElementById("permUnmute").checked,

disconnect:
document.getElementById("permDisconnect").checked,

undisconnect:true,

viewUserInfo:
document.getElementById("permViewUser").checked,

addAdmin:
document.getElementById("permAddAdmin").checked

};

socket.emit(
"add admin",
{
name,
password,
permissions
}
);

}

/* ADMINS LIST */

socket.on(
"admins list",
admins=>{

const box=
document.getElementById(
"adminsList"
);

box.innerHTML="";

admins.forEach(admin=>{

const div=
document.createElement(
"div"
);

div.className=
"user-card";

div.innerHTML=`

<div>
👮 ${admin.name}
</div>

<button onclick=
"removeAdmin('${admin.name}')">

🗑️ إزالة

</button>

`;

box.appendChild(div);

});

});

function removeAdmin(name){

if(!confirm(
`حذف ${name}?`
)) return;

socket.emit(
"remove admin",
name
);

}

/* LOGS */

function addLog(text){

const div=
document.createElement(
"div"
);

div.className=
"log-item";

div.innerText=text;

logsBox.prepend(div);

}

socket.on(
"new log",
log=>{

addLog(
log.message
);

});
async function loadBannedList(){

const res=
await fetch(
"/banned.json"
);

const data=
await res.json();

const box=
document.getElementById(
"bannedList"
);

if(!box)return;

box.innerHTML="";

data.forEach(ban=>{

const div=
document.createElement(
"div"
);

div.className=
"user-card";
div.innerHTML=`

<div>
🚫 ${ban.ip}
</div>

<button onclick="unbanIp('${ban.ip}')">
🔓 فك
</button>

`;




box.appendChild(div);

});

}

loadBannedList();
function unbanIp(ip){

socket.emit(
"unban ip",
ip
);

}
async function loadMutedList(){

const res=
await fetch(
"/muted.json"
);

const data=
await res.json();

const box=
document.getElementById(
"mutedList"
);

if(!box)return;

box.innerHTML="";

data.forEach(user=>{

const div=
document.createElement(
"div"
);

div.className=
"user-card";

div.innerHTML=`

<div>
🔇 ${user.username}
</div>

<button onclick="unmuteUser('${user.id}')">
🔊 فك
</button>

`;

box.appendChild(div);

});

}

loadMutedList();
async function loadDisconnectedList(){

const res=
await fetch(
"/deviceBanned.json"
);

const data=
await res.json();

const box=
document.getElementById(
"disconnectedList"
);

if(!box)return;

box.innerHTML="";

data.forEach(user=>{

const div=
document.createElement(
"div"
);

div.className=
"user-card";

div.innerHTML=`

<div>
⛔ ${user.username}
</div>

<button onclick="undisconnectDevice('${user.device}')">
🔓 فك
</button>

`;

box.appendChild(div);

});

}

function undisconnectDevice(device){

socket.emit(
"undisconnect device",
device
);

setTimeout(
loadDisconnectedList,
500
);

}

loadDisconnectedList();
function giveStar(username){

socket.emit(
"give star",
username
);

}

function removeStar(username){

socket.emit(
"remove star",
username
);

}
