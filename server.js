const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http);

app.use(
express.static("public")
);

const users = [];

const bannedUsers =
new Set();

/* CONNECTION */

io.on(

"connection",

(socket)=>{

const ip =

socket.handshake
.address;

/* JOIN */

socket.on(

"join",

(data)=>{

/* CHECK BAN */

if(

bannedUsers.has(ip)

){

socket.emit(

"banned",

`

تم حظرك من شات مرسال
بشكل نهائي

مع تحيات إدارة مرسال ❤️

إذا شعرت أن القرار ظلم
راسل الإدارة على تيليجرام:

Rido77

`

);

return;

}

/* SAVE USER */

socket.username =
data.username;

socket.userColor =
data.color;

users.push({

id:
socket.id,

username:
data.username,

color:
data.color,

ip

});

/* LOGIN SUCCESS */

socket.emit(
"login success"
);

/* UPDATE USERS */

io.emit(
"online users",
users
);

/* SYSTEM */

io.emit(

"chat message",

{

username:
"System",

color:
"gold",

message:
`${data.username} دخل الشات`

}

);

});

/* CHAT */

socket.on(

"chat message",

(data)=>{

io.emit(

"chat message",

{

username:
data.username,

color:
data.color,

message:
data.message

}

);

});

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

});

/* KICK */

socket.on(

"kick user",

(id)=>{

const target =

io.sockets.sockets
.get(id);

if(target){

io.emit(

"chat message",

{

username:
"System",

color:
"orange",

message:
`${target.username} تم طرده`

}

);

target.disconnect();

}

});

/* BAN */

socket.on(

"ban user",

(id)=>{

const target =

io.sockets.sockets
.get(id);

if(target){

bannedUsers.add(

target.handshake
.address

);

target.emit(

"banned",

`

تم حظرك من شات مرسال
بشكل نهائي

مع تحيات إدارة مرسال ❤️

إذا شعرت أن القرار ظلم
راسل الإدارة على تيليجرام:

Rido77

`

);

io.emit(

"chat message",

{

username:
"System",

color:
"red",

message:
`${target.username} تم حظره`

}

);

target.disconnect(true);

}

});

/* DISCONNECT USER */

socket.on(

"disconnect user",

(id)=>{

const target =

io.sockets.sockets
.get(id);

if(target){

target.emit(

"banned",

`

تم فصلك من شات مرسال

مع تحيات إدارة مرسال ❤️

إذا شعرت أن القرار ظلم
راسل الإدارة على تيليجرام:

Rido77

`

);

io.emit(

"chat message",

{

username:
"System",

color:
"#ff4444",

message:
`${target.username} تم فصله`

}

);

target.disconnect(true);

}

});

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

const index =

users.findIndex(

u=>u.id ===
socket.id

);

if(index !== -1){

const leftUser =
users[index];

users.splice(
index,
1
);

io.emit(

"chat message",

{

username:
"System",

color:
"gray",

message:
`${leftUser.username} خرج`

}

);

io.emit(
"online users",
users
);

}

});

});

http.listen(

3000,

()=>{

console.log(

"Server running"

);

});
