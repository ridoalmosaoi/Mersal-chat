const socket=io();

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

()=>{

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

div.innerHTML=`

<div>

👤 ${user.username}

</div>

<div class=
"user-actions"
>

<button
class=
"action-btn info-btn"
onclick=
"viewUser('${user.id}')"
>

ℹ️ معلومات

</button>

<button
class=
"action-btn kick-btn"
onclick=
"kickUser('${user.id}')"
>

⚠️ طرد

</button>

<button
class=
"action-btn ban-btn"
onclick=
"banUser('${user.id}')"
>

🚫 حظر

</button>

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

📱 ${user.device}

🌐 ${user.ip}

🎨 ${user.color}

🆔 ${user.id}`

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

return;

}

const permissions={

kick:
document.getElementById(
"permKick"
).checked,

ban:
document.getElementById(
"permBan"
).checked,

viewUserInfo:
document.getElementById(
"permViewUser"
).checked,

addAdmin:
document.getElementById(
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

addLog(
`👮 تمت إضافة ${name}`
);

}

/* STATS */

socket.on(

"server stats",

data=>{

statsBox.innerHTML=`

👥 المتصلين:
${data.onlineUsers}

<br>

🚫 المحظورين:
${data.bannedUsers}

<br>

👮 الإدارة:
${data.admins}

`;

});

/* LOG */

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

socket.on(

"new log",

log=>{

addLog(
log.message
);

});
