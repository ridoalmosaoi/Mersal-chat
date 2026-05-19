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

bannedUsers = JSON.parse(
fs.readFileSync("banned.json")
);

}

/* CONNECTION */

io.on("connection",(socket)=>{

console.log("User Connected");

/* JOIN */

socket.on("join",(data)=>{

/* ADMIN PASSWORD */

if(
data.username === "Admin"
&&
data.password !== "123456"
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

/* FINGERPRINT */

const fingerprint =

(data.browser || "") +

(data.device || "");

/* CHECK BAN */

const banned = bannedUsers.find(

b=>

b.ip === ip

||

b.fingerprint === fingerprint

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

id:socket.id,

username:data.username,

color:data.color || "#ffd700",

ip,

browser:data.browser || "Unknown",

device:data.device || "Unknown",

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

/* ADMIN JOIN */

if(
data.username === "Admin"
){

io.emit(

"chat message",

{

id:"system",

username:"System",

color:"gold",

message:
`تم توكيل ${data.username} مشرف 👑`

}

);

}

});

/* PUBLIC CHAT */

socket.on(

"chat message",

(data)=>{

const user = users.find(
u=>u.id === socket.id
);

if(!user){
return;
}

io.emit(

"chat message",

{

id:user.id,

username:user.username,

color:user.color,

message:data.message,

ip:user.ip,

browser:user.browser,

device:user.device

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

from:data.from,

message:data.message

}

);

}

);

/* KICK */

socket.on(

"kick user",

(userId)=>{

const targetUser = users.find(
u=>u.id === userId
);

const target =
io.sockets.sockets.get(userId);

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

const targetUser = users.find(
u=>u.id === userId
);

if(!targetUser){
return;
}

/* SAVE BAN */

bannedUsers.push({

ip:targetUser.ip,

fingerprint:
targetUser.fingerprint

});

/* SAVE FILE */

fs.writeFileSync(

"banned.json",

JSON.stringify(
bannedUsers,
null,
2
)

);

/* SYSTEM MESSAGE */

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

/* SEND BAN */

io.to(userId).emit(

"banned",

`

تم حظرك من شات مرسال 🚫

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

/* DISCONNECT */

io.sockets.sockets
.get(userId)
?.disconnect();

}

);

/* GET BANNED USERS */

socket.on(

"get banned users",

()=>{

socket.emit(

"banned users list",

bannedUsers

);

}

);

/* UNBAN USER */

socket.on(

"unban user",

(index)=>{

bannedUsers.splice(
index,
1
);

/* SAVE */

fs.writeFileSync(

"banned.json",

JSON.stringify(
bannedUsers,
null,
2
)

);

/* UPDATE */

io.emit(

"banned users updated",

bannedUsers

);

io.emit(

"chat message",

{

id:"system",

username:"System",

color:"lime",

message:
"تم فك حظر مستخدم ✅"

}

);

}

);

/* FULL DISCONNECT */

socket.on(

"disconnect user",

(userId)=>{

const targetUser = users.find(
u=>u.id === userId
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

users = users.filter(
u=>u.id !== socket.id
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
process.env.PORT || 3000;

http.listen(PORT,()=>{

console.log("Server Running 🚀");

});
