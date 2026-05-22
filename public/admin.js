const socket=io();

/* GLOBAL */

window.adminPermissions={};

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

document
.getElementById(
"adminName"
)
.value
.trim();

const password=

document
.getElementById(
"adminPass"
)
.value
.trim();

if(
!name
||
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

/* LOGIN FAIL */

socket.on(

"admin login failed",

()=>{

alert(
"بيانات الإدارة غير صحيحة"
);

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

👮 الإدارة:
${data.admins}

`;

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

/* USER INFO */

if(

window.adminPermissions
.viewUserInfo

){

buttons+=`

<button
class=
"action-btn info-btn"
onclick=
"viewUser('${user.id}')"
>

ℹ️ معلومات

</button>

`;

}

/* KICK */

if(

window.adminPermissions
.kick

){

buttons+=`

<button
class=
"action-btn kick-btn"
onclick=
"kickUser('${user.id}')"
>

⚠️ طرد

</button>

`;

}

/* BAN */

if(

window.adminPermissions
.ban

){

buttons+=`

<button
class=
"action-btn ban-btn"
onclick=
"banUser('${user.id}')"
>

🚫 حظر

</button>

`;

}

div.innerHTML=`

<div>

👤 ${user.username}

</div>

<div
class=
"user-actions"
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

📱 الجهاز:
${user.device}

🌐 IP:
${user.ip}

🎨 اللون:
${user.color}

🆔 ID:
${user.id}`

);

});

/* KICK */

function kickUser(id){

socket.emit(
"kick user",
id
);

addLog(
"⚠️ تم تنفيذ طرد"
);

}

/* BAN */

function banUser(id){

socket.emit(
"ban user",
id
);

addLog(
"🚫 تم تنفيذ حظر"
);

}

/* ADD ADMIN */

function addAdmin(){

if(

!window
.adminPermissions
.addAdmin

){

alert(
"ليس لديك صلاحية"
);

return;

}

const name=

document
.getElementById(
"newAdminName"
)
.value
.trim();

const password=

document
.getElementById(
"newAdminPassword"
)
.value
.trim();

if(
!name
||
!password
){

alert(
"أدخل البيانات"
);

return;

}

const permissions={

kick:

document
.getElementById(
"permKick"
)
.checked,

ban:

document
.getElementById(
"permBan"
)
.checked,

viewUserInfo:

document
.getElementById(
"permViewUser"
)
.checked,

addAdmin:

document
.getElementById(
"permAddAdmin"
)
.checked

};

socket.emit(

"add admin",

{

name,
password,
permissions

}

);

addLog(

`👮 تمت إضافة ${name}`

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

logsBox.prepend(
div
);

}

/* LIVE LOGS */

socket.on(

"new log",

log=>{

addLog(
log.message
);

});
