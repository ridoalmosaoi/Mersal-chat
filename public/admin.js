const socket=io();

/* GLOBAL */

window.adminPermissions={};

/* ELEMENTS */

const loginPage=
document.getElementById("adminLogin");

const panel=
document.getElementById("adminPanel");

const onlineUsers=
document.getElementById("onlineUsers");

const logsBox=
document.getElementById("logsBox");

const statsBox=
document.getElementById("statsBox");

/* LOGIN */

function loginAdmin(){

const name=
document.getElementById(
"adminName"
).value.trim();

const password=
document.getElementById(
"adminPass"
).value.trim();

if(
!name||
!password
){

alert(
"أدخل البيانات"
);

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

/* LOGIN SUCCESS */

socket.on(

"admin login success",

data=>{

window.adminPermissions=
data.permissions||{};

loginPage.style.display=
"none";

panel.style.display=
"flex";

addLog(
"✅ تم تسجيل الدخول"
);

});

/* LOGIN FAILED */

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
document.createElement(
"div"
);

div.className=
"user-card";

let buttons="";

/* INFO */

if(
window.adminPermissions.viewUserInfo
){

buttons+=`

<button
onclick=
"viewUser('${user.id}')"
>

ℹ️ معلومات

</button>

`;

}

/* KICK */

if(
window.adminPermissions.kick
){

buttons+=`

<button
onclick=
"kickUser('${user.id}')"
>

⚠️ طرد

</button>

`;

}

/* BAN */

if(
window.adminPermissions.ban
){

buttons+=`

<button
onclick=
"banUser('${user.id}')"
>

🚫 حظر

</button>

`;

}

/* MUTE */

if(
window.adminPermissions.mute
){

buttons+=`

<button
onclick=
"muteUser('${user.id}')"
>

🔇 كتم

</button>

`;

}

/* DEVICE */

if(
window.adminPermissions.disconnect
){

buttons+=`

<button
onclick=
"disconnectUser('${user.id}')"
>

⛔ فصل

</button>

`;

}

div.innerHTML=`

<div>

👤
${user.username}

</div>

<div>

${buttons}

</div>

`;

onlineUsers.appendChild(
div
);

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

🎨 ${user.color}`

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

function muteUser(id){

socket.emit(
"mute user",
id
);

}

function disconnectUser(id){

socket.emit(
"disconnect user",
id
);

}

/* ADD ADMIN */

function addAdmin(){

const name=

document
.getElementById(
"newAdminName"
)
.value.trim();

const password=

document
.getElementById(
"newAdminPassword"
)
.value.trim();

if(
!name||
!password
){

alert(
"❌ أدخل البيانات"
);

return;

}

const permissions={

kick:
document
.getElementById(
"permKick"
).checked,

ban:
document
.getElementById(
"permBan"
).checked,

mute:
document
.getElementById(
"permMute"
).checked,

disconnect:
document
.getElementById(
"permDisconnect"
).checked,

viewUserInfo:
document
.getElementById(
"permViewUser"
).checked,

addAdmin:
document
.getElementById(
"permAddAdmin"
).checked

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

/* ADMIN EVENTS */

socket.on(

"admin added",

()=>{

alert(
"✅ تمت إضافة الأدمن"
);

});

socket.on(

"admin exists",

()=>{

alert(
"❌ الاسم موجود"
);

});

socket.on(

"admin error",

msg=>{

alert(
msg
);

});

/* STATS */

socket.on(

"server stats",

data=>{

statsBox.innerHTML=

`
👥 ${data.onlineUsers}

<br><br>

🚫 ${data.bannedUsers}

<br><br>

👮 ${data.admins}

`;

});

/* LOGS */

function addLog(text){

const div=

document.createElement(
"div"
);

div.className=
"log-item";

div.innerText=
text;

logsBox.prepend(
div
);

}

socket.on(

"new log",

log=>{

addLog(
log.message
);

});
