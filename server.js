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

/* STATIC */

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* USERS */

let users = [];

/* BANNED */

let bannedUsers = [];

/* LOAD BANS */

if(
fs.existsSync("banned.json")
){

try{

bannedUsers = JSON.parse(
fs.readFileSync("banned.json")
);

}catch{

bannedUsers = [];

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

/* CONNECTION */

io.on("connection",(socket)=>{

console.log(
"User Connected:",
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

/* CLEAN DUPLICATES */

users = users.filter(
u=>u.id !== socket.id
);

/* USERNAME */

const username =
(data.username || "")
.trim();

/* PASSWORD */

const password =
(data.password || "")
.trim();

/* VALIDATE */

if(!username){

socket.emit(
"banned",
"اسم غير صالح 🚫"
);

return;

}

/* ADMIN */

if(
username === "Admin"
&&
password !== "123456"
){

socket.emit(
"banned",
"كلمة سر الإدارة خاطئة 🚫"
);

return;

}

/* DUPLICATE USER */

const sameUser = users.find(

u=>

u.username.toLowerCase()

===

username.toLowerCase()

);

if(sameUser){

socket.emit(
"banned",
"الاسم مستخدم بالفعل 🚫"
);

return;

}

/* USER IP */

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

(data.browser || "") +

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

`

🚫 تم فصلك كليًا من شات مرسال

`

);

return;

}

socket.emit(

"banned",

`

🚫 تم حظرك من شات مرسال

`

);

return;

}

/* CREATE USER */

const user = {

id:socket.id,

username,

color:
data.color || "#ffd700",

ip,

browser:
data.browser || "Unknown",

device:
data.device || "Unknown",

deviceToken:
data.deviceToken || "",

fingerprint

};

users.push(user);

/* LOGIN */

socket.emit(
"login success"
);

/* USERS UPDATE */

io.emit(
"online users",
users
);

/* ADMIN MESSAGE */

if(
username === "Admin"
){

systemMessage(
`تم توكيل ${username} مشرف 👑`,
"gold"
);

}

console.log(
`${username} Joined`
);

}catch(err){

console.log(
"JOIN ERROR:",
err
);

}

});

/* PUBLIC MESSAGE */

socket.on(

"chat message",

(data)=>{

try{

const user = users.find(
u=>u.id === socket.id
);

if(!user){
return;
}

const message =
(data.message || "")
trim();

if(!message){
return;
}

/* LIMIT MESSAGE */

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

/* PRIVATE MESSAGE */

socket.on(

"private message",

(data)=>{

try{

if(!data.to){
return;
}

io.to(data.to).emit(

"private message",

{

from:data.from,

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

/* KICK USER */

socket.on(

"kick user",

(userId)=>{

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
return;
}

const targetUser = users.find(
u=>u.id === userId
);

if(!targetUser){
return;
}

systemMessage(
`تم طرد ${targetUser.username} ⚠️`,
"orange"
);

io.to(userId).emit(
"banned",
"تم طردك من الشات ⚠️"
);

io.sockets.sockets
.get(userId)
?.disconnect(true);

});

/* NORMAL BAN */

socket.on(

"ban user",

(userId)=>{

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
return;
}

const targetUser = users.find(
u=>u.id === userId
);

if(!targetUser){
return;
}

/* SAVE BAN */

bannedUsers.push({

ip:
targetUser.ip,

fingerprint:
targetUser.fingerprint,

deviceToken:
targetUser.deviceToken,

username:
targetUser.username,

fullDisconnect:false

});

saveBans();

/* MESSAGE */

systemMessage(
`تم حظر ${targetUser.username} 🚫`,
"red"
);

/* SEND */

io.to(userId).emit(

"banned",

"🚫 تم حظرك من الشات"

);

/* DISCONNECT */

io.sockets.sockets
.get(userId)
?.disconnect(true);

});

/* FULL DISCONNECT */

socket.on(

"disconnect user",

(userId)=>{

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
return;
}

const targetUser = users.find(
u=>u.id === userId
);

if(!targetUser){
return;
}

/* SAVE FULL BAN */

bannedUsers.push({

ip:
targetUser.ip,

fingerprint:
targetUser.fingerprint,

deviceToken:
targetUser.deviceToken,

username:
targetUser.username,

fullDisconnect:true

});

saveBans();

/* MESSAGE */

systemMessage(
`تم فصل ${targetUser.username} كليًا ⛔`,
"#ff2222"
);

/* SEND */

io.to(userId).emit(

"full device banned",

"🚫 تم فصلك كليًا"

);

/* DISCONNECT */

io.sockets.sockets
.get(userId)
?.disconnect(true);

});

/* GET BANNED */

socket.on(

"get banned users",

()=>{

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
return;
}

socket.emit(
"banned users list",
bannedUsers
);

});

/* UNBAN */

socket.on(

"unban user",

(index)=>{

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
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
"banned users updated",
bannedUsers
);

systemMessage(
"تم فك حظر مستخدم ✅",
"lime"
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

console.log(
`${disconnectedUser.username} Left`
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
