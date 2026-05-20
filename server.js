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

/* SAVE BANNED */

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

const password =
(data.password || "")
.trim();

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
"كلمة سر الإدارة خطأ 🚫"
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

console.log(
`${username} joined`
);

}catch(err){

console.log(
"JOIN ERROR:",
err
);

}

});

/* CHAT MESSAGE */

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

/* KICK */

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

const target = users.find(
u=>u.id === userId
);

if(!target){
return;
}

systemMessage(
`تم طرد ${target.username}`,
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

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
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

fullDisconnect:false

});

saveBans();

systemMessage(
`تم حظر ${target.username}`,
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

const sender = users.find(
u=>u.id === socket.id
);

if(
sender?.username !== "Admin"
){
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

fullDisconnect:true

});

saveBans();

systemMessage(
`تم فصل ${target.username} كليًا`,
"#ff2222"
);

io.to(userId).emit(

"full device banned",

"🚫 تم فصلك كليًا"

);

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

systemMessage(
`${disconnectedUser.username} خرج`,
"#666"
);

console.log(
`${disconnectedUser.username} left`
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
