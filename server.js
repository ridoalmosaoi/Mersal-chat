const express=require("express");
const http=require("http");
const socketIO=require("socket.io");
const fs=require("fs");
const path=require("path");

const app=express();

const server=http.createServer(app);

const io=socketIO(server,{
cors:{
origin:"*"
}
});

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* DATABASE */

let users=[];

let admins=[];

let bannedUsers=[];

let logs=[];

/* LOAD FILE */

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

/* SAVE FILE */

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

logs=
loadFile(
"logs.json"
);

/* LOGS */

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

}

);

/* CONNECTION */

io.on(

"connection",

socket=>{

console.log(
"Connected:",
socket.id
);

/* JOIN */

socket.on(

"join",

data=>{

const username=
data.username
?.trim();

if(
!username
){
return;
}

/* CHECK BANNED */

const ip=

socket.handshake
.address;

const banned=

bannedUsers.find(

b=>

b.ip===ip

);

if(banned){

socket.emit(
"banned",
"🚫 تم حظرك"
);

return;

}

/* CHECK ADMIN */

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

"🚫 كلمة سر الإدارة خطأ"

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

device:

socket
.handshake
.headers[
"user-agent"
],

isAdmin:
!!admin

};

users.push(
user
);

/* SUCCESS */

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

u=>

u.id===socket.id

);

if(!user){
return;
}

io.emit(

"chat message",

{

username:
user.username,

message:
data.message,

color:
user.color

}

);

});

/* PRIVATE */

socket.on(

"private message",

data=>{

io.to(
data.to
)

.emit(

"private message",

{

from:
data.from,

message:
data.message

}

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

!socket
.adminData
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

/* KICK */

socket.on(

"kick user",

id=>{

if(

!socket
.adminData
?.permissions
?.kick

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

io.to(id)

.emit(
"banned",
"⚠️ تم طردك"
);

io.sockets
.sockets
.get(id)
?.disconnect();

addLog(
`⚠️ تم طرد ${user.username}`
);

});

/* BAN */

socket.on(

"ban user",

id=>{

if(

!socket
.adminData
?.permissions
?.ban

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

io.sockets
.sockets
.get(id)
?.disconnect();

addLog(
`🚫 تم حظر ${user.username}`
);

});

/* ADD ADMIN */

socket.on(

"add admin",

data=>{

if(

!socket
.adminData
?.permissions
?.addAdmin

){
return;
}

admins.push({

name:
data.name,

password:
data.password,

permissions:
data.permissions

});

saveFile(
"admins.json",
admins
);

addLog(
`👮 تم إضافة ${data.name}`
);

});

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

const user=

users.find(
u=>u.id===socket.id
);

users=

users.filter(

u=>

u.id!==socket.id

);

io.emit(
"online users",
users
);

if(user){

addLog(
`👋 ${user.username} خرج`
);

}

});

});

server.listen(

process.env.PORT
||
3000,

()=>{

console.log(
"🚀 Server Running"
);

}
);
