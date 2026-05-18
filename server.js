const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

cors:{
origin:"*"
}

});

const path = require("path");

const fs = require("fs");

/* STATIC */

app.use(

express.static(

path.join(
__dirname,
"public"
)

)

);

/* USERS */

let users = [];

/* BANNED */

let bannedUsers = [];

if(

fs.existsSync(
"banned.json"
)

){

bannedUsers = JSON.parse(

fs.readFileSync(
"banned.json"
)

);

}

/* CONNECTION */

io.on(

"connection",

(socket)=>{

console.log(
"User Connected"
);

/* JOIN */

socket.on(

"join",

(data)=>{

/* ADMIN PASSWORD */

if(

data.username ===
"Admin"

&&

data.password !==
"admin771"

){

socket.emit(

"banned",

"كلمة سر الإدارة خاطئة 🚫"

);

return;

}

/* IP */

const ip =

socket.handshake.headers[
"x-forwarded-for"
]

||

socket.handshake.address;

/* CHECK BAN */

const banned =

bannedUsers.find(

b=>

b.ip === ip

);

if(banned){

socket.emit(

"banned",

`

تم حظرك من شات مرسال 🚫

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

return;

}

/* USER */

const user = {

id:
socket.id,

username:
data.username,

color:
data.color ||

"#ffd700",

ip,

browser:
data.browser ||

"Unknown",

device:
data.device ||

"Unknown"

};

users.push(user);

/* LOGIN SUCCESS */

socket.emit(
"login success"
);

/* USERS ONLINE */

io.emit(

"online users",

users

);

/* ADMIN MESSAGE */

if(

data.username ===
"Admin"

){

io.emit(

"chat message",

{

id:"system",

username:"Chanserv",

color:"gold",

message:
`تم توكيل ${data.username} مشرف 👑`

}

);

}

}

/* CHAT */

);

socket.on(

"chat message",

(data)=>{

const user =

users.find(

u=>

u.id === socket.id

);

if(!user){

return;

}

io.emit(

"chat message",

{

id:
user.id,

username:
user.username,

color:
user.color,

message:
data.message,

ip:
user.ip,

browser:
user.browser,

device:
user.device

}

);

}

);

/* PRIVATE */

socket.on(

"private message",

(data)=>{

io.to(data.to).emit(

"private message",

{

from:
data.from,

message:
data.message

}

);

}

);

/* KICK */

socket.on(

"kick user",

(userId)=>{

const targetUser =

users.find(

u=>

u.id === userId

);

const target =

io.sockets.sockets.get(
userId
);

if(target){

io.emit(

"chat message",

{

id:"system",

username:"System",

color:"orange",

message:
`تم طرد ${targetUser?.username || "مستخدم"} ⚠️`

}

);

io.to(userId).emit(

"banned",

"تم طردك من الشات ⚠️"

);

target.disconnect();

}

}

);

/* BAN */

socket.on(

"ban user",

(userId)=>{

const targetUser =

users.find(

u=>

u.id === userId

);

if(!targetUser){

return;

}

bannedUsers.push({

ip:
targetUser.ip

});

/* SAVE BANS */

fs.writeFileSync(

"banned.json",

JSON.stringify(
bannedUsers,
null,
2
)

);

io.emit(

"chat message",

{

id:"system",

username:"System",

color:"red",

message:
`تم حظر ${targetUser.username} 🚫`

}

);

io.to(userId).emit(

"banned",

`

تم حظرك من شات مرسال 🚫

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

io.sockets.sockets
.get(userId)
?.disconnect();

}

);

/* FULL DISCONNECT */

socket.on(

"disconnect user",

(userId)=>{

const targetUser =

users.find(

u=>

u.id === userId

);

io.emit(

"chat message",

{

id:"system",

username:"System",

color:"#ff4444",

message:
`تم فصل ${targetUser?.username || "مستخدم"} 🚫`

}

);

io.to(userId).emit(

"banned",

"تم فصلك من الشات 🚫"

);

io.sockets.sockets
.get(userId)
?.disconnect();

}

);

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

users =

users.filter(

u=>

u.id !== socket.id

);

io.emit(

"online users",

users

);

}

);

});

/* START */

const PORT =

process.env.PORT ||

3000;

http.listen(

PORT,

()=>{

console.log(

"Server Running 🚀"

);

});
