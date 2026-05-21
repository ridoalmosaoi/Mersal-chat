const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

cors:{
origin:"*"
},

transports:["polling","websocket"]

});

const path = require("path");

const fs = require("fs");

/* STATIC */

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* DATA */

let users = [];

let bannedUsers = [];

let admins = [];

/* SETTINGS */

let chatLocked = false;

let privateLocked = false;

/* LOAD BANNED */

if(
fs.existsSync("banned.json")
){

try{

bannedUsers = JSON.parse(

fs.readFileSync(
"banned.json"
)

);

}catch{

bannedUsers = [];

}

}

/* LOAD ADMINS */

if(
fs.existsSync("admins.json")
){

try{

admins = JSON.parse(

fs.readFileSync(
"admins.json"
)

);

}catch{

admins = [];

}

}

/* SAVE BANNED */

function saveBanned(){

fs.writeFileSync(

"banned.json",

JSON.stringify(
bannedUsers,
null,
2
)

);

}

/* SAVE ADMINS */

function saveAdmins(){

fs.writeFileSync(

"admins.json",

JSON.stringify(
admins,
null,
2
)

);

}

/* SYSTEM MESSAGE */

function systemMessage(message,color){

io.emit(

"chat message",

{

id:"system",

username:"System",

color,

message

}

);

}

/* CHECK ADMIN */

function isAdmin(socket){

return socket.isAdmin === true;

}

/* SOCKET */

io.on("connection",(socket)=>{

console.log(
"Connected:",
socket.id
);

/* JOIN */

socket.on(

"join",

(data)=>{

try{

const username =
(data.username || "")
.trim();

if(!username){
return;
}

const ip =

socket.handshake.headers[
"x-forwarded-for"
]

||

socket.handshake.address

||

"Unknown";

const fingerprint =

(data.browser || "")

+

(data.device || "");

/* CHECK BAN */

const banned = bannedUsers.find(

b=>

b.ip === ip

||

b.fingerprint === fingerprint

||

b.deviceToken === data.deviceToken

);

if(banned){

if(
banned.fullDisconnect
){

socket.emit(

"full device banned",

"🚫 تم فصلك كليًا"

);

return;

}

socket.emit(
"banned",
"🚫 تم حظرك"
);

return;

}

/* USER */

const user = {

id:socket.id,

username,

color:
data.color || "#ffd700",

ip,

browser:
data.browser || "",

device:
data.device || "",

deviceToken:
data.deviceToken || "",

fingerprint

};

users.push(user);

/* LOGIN */

socket.emit(
"login success"
);

/* USERS */

io.emit(
"online users",
users
);

/* SYSTEM */

systemMessage(
`${username} دخل الشات`,
"#ffd700"
);

}catch(err){

console.log(err);

}

});

/* CHAT */

socket.on(

"chat message",

(data)=>{

if(chatLocked){
return;
}

const user = users.find(
u=>u.id === socket.id
);

if(!user){
return;
}

const message =
(data.message || "")
.trim();

if(!message){
return;
}

io.emit(

"chat message",

{

id:user.id,

username:user.username,

color:user.color,

message

}

);

});

/* PRIVATE */

socket.on(

"private message",

(data)=>{

if(privateLocked){
return;
}

io.to(data.to).emit(

"private message",

{

from:data.from,

fromId:socket.id,

message:data.message

}

);

});

/* ADMIN LOGIN */

socket.on(

"admin panel login",

(data)=>{

console.log(
"ADMIN LOGIN:",
data
);

const admin = admins.find(

a=>

a.name === data.name

&&

a.password === data.password

);

if(!admin){

socket.emit(
"admin login failed"
);

return;

}

socket.isAdmin = true;

socket.adminData = admin;

socket.emit(
"admin login success"
);

socket.emit(
"admin online users",
users
);

socket.emit(
"admin banned users",
bannedUsers
);

socket.emit(
"admins list",
admins
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

(data)=>{

if(!isAdmin(socket)){
return;
}

admins.push({

name:data.name,

password:data.password,

permissions:{

kick:true,

ban:true,

disconnect:true,

unban:true,

clear:true,

maintenance:true,

chatLock:true,

privateLock:true,

addAdmin:true,

removeAdmin:true

}

});

saveAdmins();

io.emit(
"admins list",
admins
);

});

/* REMOVE ADMIN */

socket.on(

"remove admin",

(index)=>{

if(!isAdmin(socket)){
return;
}

admins.splice(
index,
1
);

saveAdmins();

io.emit(
"admins list",
admins
);

});

/* KICK */

socket.on(

"kick user",

(userId)=>{

if(!isAdmin(socket)){
return;
}

const target = users.find(
u=>u.id === userId
);

if(!target){
return;
}

io.to(userId).emit(
"banned",
"⚠️ تم طردك"
);

io.sockets.sockets
.get(userId)
?.disconnect(true);

systemMessage(
`⚠️ تم طرد ${target.username}`,
"orange"
);

});

/* BAN */

socket.on(

"ban user",

(userId)=>{

if(!isAdmin(socket)){
return;
}

const target = users.find(
u=>u.id === userId
);

if(!target){
return;
}

bannedUsers.push({

username:
target.username,

ip:
target.ip,

fingerprint:
target.fingerprint,

deviceToken:
target.deviceToken,

fullDisconnect:false,

time:Date.now()

});

saveBanned();

io.to(userId).emit(
"banned",
"🚫 تم حظرك"
);

io.sockets.sockets
.get(userId)
?.disconnect(true);

systemMessage(
`🚫 تم حظر ${target.username}`,
"red"
);

});

/* FULL DISCONNECT */

socket.on(

"disconnect user",

(userId)=>{

if(!isAdmin(socket)){
return;
}

const target = users.find(
u=>u.id === userId
);

if(!target){
return;
}

bannedUsers.push({

username:
target.username,

ip:
target.ip,

fingerprint:
target.fingerprint,

deviceToken:
target.deviceToken,

fullDisconnect:true,

time:Date.now()

});

saveBanned();

io.to(userId).emit(

"full device banned",

"🚫 تم فصلك كليًا"

);

io.sockets.sockets
.get(userId)
?.disconnect(true);

systemMessage(
`⛔ تم فصل ${target.username}`,
"#ff0000"
);

});

/* UNBAN */

socket.on(

"unban user",

(index)=>{

if(!isAdmin(socket)){
return;
}

bannedUsers.splice(
index,
1
);

saveBanned();

io.emit(
"admin banned users",
bannedUsers
);

});

/* CLEAR CHAT */

socket.on(

"clear chat",

()=>{

if(!isAdmin(socket)){
return;
}

io.emit(
"clear messages"
);

systemMessage(
"🧹 تم تنظيف الشات",
"#ffd700"
);

});

/* CHAT LOCK */

socket.on(

"toggle chat lock",

()=>{

if(!isAdmin(socket)){
return;
}

chatLocked = !chatLocked;

systemMessage(

chatLocked

?

"🔒 تم قفل العام"

:

"🔓 تم فتح العام"

,

"orange"

);

});

/* PRIVATE LOCK */

socket.on(

"toggle private lock",

()=>{

if(!isAdmin(socket)){
return;
}

privateLocked = !privateLocked;

systemMessage(

privateLocked

?

"💬 تم تعطيل الخاص"

:

"💬 تم تفعيل الخاص"

,

"#00d0ff"

);

});

/* MAINTENANCE */

socket.on(

"maintenance mode",

()=>{

if(!isAdmin(socket)){
return;
}

systemMessage(
"🛠️ السيرفر تحت الصيانة",
"red"
);

});

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

const disconnectedUser = users.find(
u=>u.id === socket.id
);

users = users.filter(
u=>u.id !== socket.id
);

io.emit(
"online users",
users
);

if(disconnectedUser){

systemMessage(
`${disconnectedUser.username} خرج`,
"#666"
);

}

});

});

/* START */

const PORT =
process.env.PORT || 3000;

http.listen(PORT,()=>{

console.log(
"Server Running 🚀"
);

});
