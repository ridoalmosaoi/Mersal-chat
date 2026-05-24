const socket=io();

/* GLOBAL */

let adminPermissions={};

/* ELEMENTS */

const loginPage=
document.getElementById(
"adminLogin"
);

const panel=
document.getElementById(
"adminPanel"
);

const onlineUsers=
document.getElementById(
"onlineUsers"
);

const logsBox=
document.getElementById(
"logsBox"
);

const statsBox=
document.getElementById(
"statsBox"
);

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

/* LOGIN */

socket.on(

"admin login success",

data=>{

adminPermissions=
data.permissions||{};

loginPage.style.display=
"none";

panel.style.display=
"flex";

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

/* ONLINE USERS */

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
adminPermissions
.viewUserInfo
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
adminPermissions.kick
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
adminPermissions.ban
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
adminPermissions.mute
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

/* DISCONNECT */

if(
adminPermissions.disconnect
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

👤 ${user.username}

</div>

<div
class="user-actions"
>

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

🌐 IP:
${user.ip}

📱 جهاز:
${user.device}

🎨 لون:
${user.color}

🆔:
${user.id}`

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

<div>

<button
onclick=
"removeAdmin('${admin.name}')"
>

🗑️ إزالة

</button>

</div>

`;

box.appendChild(
div
);

});

});

function removeAdmin(name){

if(

!confirm(
`حذف ${name} ؟`
)

){
return;
}

socket.emit(
"remove admin",
name
);

}

/* EVENTS */

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
"❌ الأدمن موجود"
);

});

socket.on(

"admin error",

msg=>{

alert(msg);

});

/* STATS */

socket.on(

"server stats",

data=>{

statsBox.innerHTML=`

👥 المتصلين:
${data.onlineUsers}

<br><br>

🚫 المحظورين:
${data.bannedUsers}

<br><br>

👮 الأدمنية:
${data.admins}

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
