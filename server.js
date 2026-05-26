const express=require("express");
const http=require("http");
const socketIO=require("socket.io");
const fs=require("fs");
const path=require("path");

const app=express();
const server=http.createServer(app);

const io=socketIO(server,{
    cors:{origin:"*"}
});

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* DATA */

let users=[];

let chatLocked=false;
let privateLocked=false;
let maintenanceMode=false;

let admins=[];
let bannedUsers=[];
let mutedUsers=[];
let deviceBannedUsers=[];
let logs=[];

/* FILE SYSTEM */

function loadFile(file,def=[]){

try{

if(!fs.existsSync(file)){

fs.writeFileSync(
file,
JSON.stringify(
def,
null,
2
)
);

return def;

}

return JSON.parse(
fs.readFileSync(
file,
"utf8"
)
);

}catch{

return def;

}

}

function saveFile(
file,
data
){

fs.writeFileSync(

file,

JSON.stringify(
data,
null,
2
)

);

}

/* LOAD */

admins=
loadFile(
"admins.json"
);

bannedUsers=
loadFile(
"banned.json"
);

mutedUsers=
loadFile(
"muted.json"
);

deviceBannedUsers=
loadFile(
"deviceBanned.json"
);

logs=
loadFile(
"logs.json"
);

/* LOG */

function addLog(message){

const log={

time:
new Date()
.toLocaleString(),

message

};

logs.unshift(
log
);

saveFile(
"logs.json",
logs
);

io.emit(
"new log",
log
);

console.log(
message
);

}

/* ADMINS API */

app.get(
"/admins.json",
(req,res)=>{

res.json(
admins
);

});

/* SOCKET */

io.on(
"connection",
socket=>{

/* JOIN */

socket.on(

"join",

data=>{

const username=
data.username?.trim();

if(
!username
){
return;
}

/* PREVENT DUPLICATE */

const exists=

users.find(

u=>

u.username
.toLowerCase()

===

username
.toLowerCase()

);

if(exists){

socket.emit(
"banned",
"⚠️ الاسم مستخدم"
);

return;
}

const device=

data.deviceToken
||

socket.handshake
.headers[
"user-agent"
];

const ip=
socket.handshake.address;

/* DEVICE BAN */

const deviceBlocked=

deviceBannedUsers.find(

d=>

d.device===device

);

if(deviceBlocked){

socket.emit(
"banned",
"⛔ الجهاز محظور"
);

return;
}

/* NORMAL BAN */

const banned=

bannedUsers.find(

b=>

b.ip===ip

);

if(banned){

socket.emit(
"banned",
"🚫 محظور"
);

return;
}

/* ADMIN CHECK */

const admin=

admins.find(

a=>

a.name
.toLowerCase()

===

username
.toLowerCase()

);

if(admin){

if(

admin.password

!==

data.adminPassword

){

socket.emit(

"banned",

"🚫 كلمة السر خطأ"

);

return;

}

socket.adminData=
admin;

}

/* USER */

const user={

id:
socket.id,

username,

color:
data.color
||
"#ffd700",

ip,

device,

isAdmin:
!!admin

};

users.push(
user
);

socket.emit(
"login success"
);

io.emit(
"online users",
users
);

addLog(
`👤 ${username} دخل`
);

});

/* CHAT */

socket.on(

"chat message",

data=>{

const user=

users.find(
u=>u.id===socket.id
);

if(!user){
return;
}

if(
maintenanceMode
&&
!socket.adminData
){
return;
}

if(
chatLocked
&&
!socket.adminData
){
return;
}

const muted=

mutedUsers.find(

m=>

m.id===socket.id

);

if(muted){

socket.emit(
"banned",
"🔇 أنت مكتوم"
);

return;
}

io.emit(

"chat message",

{

id:user.id,

username:
user.username,

message:
data.message,

color:
user.color,

reply:
data.reply

}

);

});

/* PRIVATE */

socket.on(

"private message",

data=>{

if(
privateLocked
&&
!socket.adminData
){
return;
}

io.to(
data.to
)

.emit(

"private message",

data

);

});

/* ADMIN LOGIN */

socket.on(

"admin panel login",

data=>{

const admin=

admins.find(

a=>

a.name===data.name

&&

a.password===data.password

);

if(!admin){

socket.emit(
"admin login failed"
);

return;
}

socket.adminData=
admin;

socket.emit(

"admin login success",

{

permissions:
admin.permissions

}

);

socket.emit(
"admin online users",
users
);

socket.emit(

"server stats",

{

onlineUsers:
users.length,

bannedUsers:
bannedUsers.length,

admins:
admins.length

}

);

});

/* USER INFO */

socket.on(

"view user",

id=>{

if(

!socket.adminData
?.permissions
?.viewUserInfo

){
return;
}

const user=

users.find(
u=>u.id===id
);

if(!user){
return;
}

socket.emit(
"user info",
user
);

});

/* ADD ADMIN */

socket.on(

"add admin",

data=>{

if(
!socket.adminData
?.permissions
?.addAdmin
){
return;
}

const exists=

admins.find(

a=>

a.name.toLowerCase()

===

data.name.toLowerCase()

);

if(exists){

socket.emit(
"admin exists"
);

return;

}

admins.push({

name:data.name,

password:data.password,

permissions:data.permissions

});

saveFile(
"admins.json",
admins
);

io.emit(
"admins list",
admins
);

socket.emit(
"admin added"
);

addLog(
`👮 تمت إضافة ${data.name}`
);

});

/* REMOVE ADMIN */

socket.on(

"remove admin",

name=>{

if(
!socket.adminData
?.permissions
?.addAdmin
){
return;
}

admins=

admins.filter(

a=>

a.name!==name

);

saveFile(
"admins.json",
admins
);

io.emit(
"admins list",
admins
);

addLog(
`🗑️ تم حذف ${name}`
);

});
/* KICK */

socket.on(

"kick user",

id=>{

const user=
users.find(
u=>u.id===id
);

if(!user){
return;
}

io.to(id)
.emit(
"banned",
"⚠️ تم طردك"
);

io.sockets.sockets
.get(id)
?.disconnect();

});

/* BAN */

socket.on(

"ban user",

id=>{

const user=

users.find(
u=>u.id===id
);

if(!user){
return;
}

bannedUsers.push({

ip:
user.ip

});

saveFile(
"banned.json",
bannedUsers
);

io.to(id)
.emit(
"banned",
"🚫 تم حظرك"
);

io.sockets.sockets
.get(id)
?.disconnect();

});

/* MUTE */

socket.on(

"mute user",

id=>{

const user=

users.find(
u=>u.id===id
);

if(!user){
return;
}

mutedUsers.push({

id:
user.id,

username:
user.username

});

saveFile(
"muted.json",
mutedUsers
);

});

/* DEVICE BAN */

socket.on(

"disconnect user",

id=>{

const user=

users.find(
u=>u.id===id
);

if(!user){
return;
}

deviceBannedUsers.push({

device:
user.device,

username:
user.username

});
    

saveFile(
"deviceBanned.json",
deviceBannedUsers
);

});
    /* UNBAN USER */

socket.on(
"unban user",
id=>{

const user=
users.find(
u=>u.id===id
);

if(!user){
return;
}

bannedUsers=
bannedUsers.filter(
b=>b.ip!==user.ip
);

saveFile(
"banned.json",
bannedUsers
);

addLog(
`🔓 تم فك حظر ${user.username}`
);

});

/* UNMUTE USER */

socket.on(
"unmute user",
id=>{

const user=
users.find(
u=>u.id===id
);

if(!user){
return;
}

mutedUsers=
mutedUsers.filter(
m=>m.id!==user.id
);

saveFile(
"muted.json",
mutedUsers
);

addLog(
`🔊 تم فك كتم ${user.username}`
);

});

/* UNDISCONNECT USER */

socket.on(
"undisconnect user",
id=>{

const user=
users.find(
u=>u.id===id
);

if(!user){
return;
}

deviceBannedUsers=
deviceBannedUsers.filter(
d=>d.device!==user.device
);

saveFile(
"deviceBanned.json",
deviceBannedUsers
);

addLog(
`⛔🔓 تم فك فصل ${user.username}`
);

});

/* UNBAN ALL */

socket.on(
"unban all",
()=>{

bannedUsers=[];

saveFile(
"banned.json",
bannedUsers
);

});

/* UNMUTE ALL */

socket.on(
"unmute all",
()=>{

mutedUsers=[];

saveFile(
"muted.json",
mutedUsers
);

});

/* UNDISCONNECT ALL */

socket.on(
"undisconnect all",
()=>{

deviceBannedUsers=[];

saveFile(
"deviceBanned.json",
deviceBannedUsers
);

});

/* DISCONNECT */

socket.on(
"disconnect",
()=>{

users=
users.filter(
u=>u.id!==socket.id
);

io.emit(
"online users",
users
);

});

});

server.listen(
process.env.PORT||3000,
()=>{
console.log("🚀 Server Running");
});
