const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

cors:{
origin:"*"
},

transports:["websocket"],

pingTimeout:120000,

pingInterval:25000

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

/* CHECK BLOCK */

const banned = bannedUsers.find(

b=>

b.ip === ip

||

b.fingerprint === fingerprint

||

b.deviceToken ===
data.deviceToken

);

if(banned){

/* FULL DEVICE BLOCK */

if(
banned.fullDisconnect
){

socket.emit(

"full device banned",

`

🚫 تم فصلك كليًا من شات مرسال

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

return;

}

/* NORMAL BAN */

socket.emit(

"banned",

`

🚫 تم حظرك من شات مرسال

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

fingerprint,

deviceToken:
data.deviceToken || ""

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

/* PUBLIC MESSAGE */

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

target.disconnect(true);

}

}

);

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

/* SAVE FILE */

fs.writeFileSync(

"banned.json",

JSON.stringify(
bannedUsers,
null,
2
)

);

/* MESSAGE */

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

/* SEND */

io.to(userId).emit(

"banned",

`

🚫 تم حظرك من شات مرسال

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

io.sockets.sockets
.get(userId)
?.disconnect(true);

}

);

/* FULL DEVICE DISCONNECT */

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

/* SAVE FULL BLOCK */

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

color:"#ff2222",

message:
`تم فصل ${targetUser.username} كليًا ⛔`

}

);

/* SEND BLOCK */

io.to(userId).emit(

"full device banned",

`

🚫 تم فصلك كليًا من شات مرسال

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

);

/* DISCONNECT */

io.sockets.sockets
.get(userId)
?.disconnect(true);

}

);

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

}

);

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

/* DISCONNECT */

);

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
