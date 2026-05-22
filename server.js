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

let users=[];
let admins=[];
let bannedUsers=[];
let mutedUsers=[];
let logs=[];

/* LOAD */

function loadFile(file,def=[]){

try{

if(!fs.existsSync(file)){

fs.writeFileSync(
file,
JSON.stringify(def,null,2)
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

admins=loadFile(
"admins.json"
);

bannedUsers=loadFile(
"banned.json"
);

mutedUsers=loadFile(
"muted.json"
);

logs=loadFile(
"logs.json"
);

/* SAVE */

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

/* LOG */

function addLog(text){

const log={

time:
Date.now(),

message:
text

};

logs.unshift(log);

saveFile(
"logs.json",
logs
);

io.emit(
"new log",
log
);

console.log(text);

}

/* ADMINS LIST API */

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

const user={

id:
socket.id,

username,

color:
data.color

||

"#ffd700",

ip:
socket.handshake.address,

device:
socket.handshake.headers[
"user-agent"
]

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
`👤 دخل ${username}`
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

color:
user.color,

message:
data.message

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
"admin login success"
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

/* KICK */

socket.on(

"kick user",

id=>{

const target=

users.find(
u=>u.id===id
);

if(!target){
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

addLog(
`⚠️ تم طرد ${target.username}`
);

});

/* BAN */

socket.on(

"ban user",

id=>{

const target=

users.find(
u=>u.id===id
);

if(!target){
return;
}

bannedUsers.push({

ip:
target.ip

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

addLog(
`🚫 تم حظر ${target.username}`
);

});

/* USER INFO */

socket.on(

"view user",

id=>{

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

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

users=

users.filter(

u=>

u.id!==socket.id

);

io.emit(
"online users",
users
);

});

});

server.listen(

process.env.PORT
||
3000,

()=>{

console.log(
"🚀 Started"
);

}
);
