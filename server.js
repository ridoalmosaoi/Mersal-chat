const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

cors:{
origin:"*"
},

transports:["polling","websocket"],

pingTimeout:60000,

pingInterval:25000,

connectTimeout:30000

});

const path = require("path");

const fs = require("fs");

/* STATIC */

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* CRASH PROTECTION */

process.on(

"uncaughtException",

(err)=>{

console.log(
"ERROR:",
err
);

});

process.on(

"unhandledRejection",

(err)=>{

console.log(
"REJECTION:",
err
);

});

/* USERS */

let users = [];

/* BANNED */

let bannedUsers = [];

/* ADMINS */

let admins = [];

/* SETTINGS */

let chatLocked = false;

let privateLocked = false;

/* LOAD BANS */

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

/* SAVE BANS */

function saveBans(){

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

function systemMessage(text,color){

io.emit(

"chat message",

{

id:"system",

username:"System",

color,

message:text

}

);

}

/* ADMIN CHECK */

function isAdmin(socket){

return socket.isAdmin === true;

}

/* CONNECTION */

io.on("connection",(socket)=>{

console.log(
"Connected:",
socket.id
);

/* KEEP ALIVE */

socket.on(

"ping alive",

()=>{

socket.emit(
"pong alive"
);

});

/* JOIN */

socket.on(

"join",

(data)=>{

try{

users = users.filter(
u=>u.id !== socket.id
);

const username =
(data.username || "")
.trim();

if(!username){

socket.emit(
"banned",
"اسم غير صالح 🚫"
);

return;

}

/* DUPLICATE */

const sameUser = users.find(

u=>

u.username.toLowerCase()

===

username.toLowerCase()

);

if(sameUser){

socket.emit(
"banned",
"الاسم مستخدم 🚫"
);

return;

}

/* IP */

const ip =

socket.handshake.headers[
"x-forwarded-for"
]

||

socket.handshake.address

||

"Unknown";

/* FINGERPRINT */

const fingerprint =

(data.browser || "")

+

(data.device || "");

/* CHECK BAN */

const banned = bannedUsers.find(

b=>

b.ip === ip

||

b.deviceToken ===
data.deviceToken

||

b.fingerprint ===
fingerprint

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

/* SUCCESS */

socket.emit(
"login success"
);

/* USERS UPDATE */

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

console.log(
"JOIN ERROR:",
err
);

}

});

/* CHAT */

socket.on(

"chat message",

(data)=>{

try{

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

if(message.length > 500){
return;
}

io.emit(

"chat message",

{

id:user.id,

username:user.username,

color:user.color,

message,

ip:user.ip,

browser:user.browser,

device:user.device

}

);

}catch(err){

console.log(
"MESSAGE ERROR:",
err
);

}

});

/* PRIVATE */

socket.on(

"private message",

(data)=>{

try{

if(privateLocked){
return;
}

if(!data.to){
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

}catch(err){

console.log(
"PRIVATE ERROR:",
err
);

}

});

/* ADMIN LOGIN */

socket.on(

"admin panel login",

(data)=>{

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

if(

!socket.adminData
.permissions
.disconnect

){
return;
}

const exists = admins.find(

a=>

a.name.toLowerCase()

===

data.name.toLowerCase()

);

if(exists){
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

privateLock:true

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

systemMessage(
`⚠️ تم طرد ${target.username}`,
"orange"
);

io.to(userId).emit(
"banned",
"⚠️ تم طردك"
);

io.sockets.sockets
.get(userId)
?.disconnect(true);

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

ip:
target.ip,

fingerprint:
target.fingerprint,

deviceToken:
target.deviceToken,

username:
target.username,

fullDisconnect:false,

time:
Date.now()

});

saveBans();

systemMessage(
`🚫 تم حظر ${target.username}`,
"red"
);

io.to(userId).emit(
"banned",
"🚫 تم حظرك"
);

io.sockets.sockets
.get(userId)
?.disconnect(true);

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

ip:
target.ip,

fingerprint:
target.fingerprint,

deviceToken:
target.deviceToken,

username:
target.username,

fullDisconnect:true,

time:
Date.now()

});

saveBans();

systemMessage(
`⛔ تم فصل ${target.username} كليًا`,
"#ff0000"
);

io.to(userId).emit(

"full device banned",

"🚫 تم فصلك كليًا"

);

io.sockets.sockets
.get(userId)
?.disconnect(true);

});

/* UNBAN */

socket.on(

"unban user",

(index)=>{

if(!isAdmin(socket)){
return;
}

if(
index < 0
||
index >= bannedUsers.length
){
return;
}

bannedUsers.splice(
index,
1
);

saveBans();

io.emit(
"admin banned users",
bannedUsers
);

systemMessage(
"✅ تم فك الحظر",
"lime"
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
