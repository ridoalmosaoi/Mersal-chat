const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();

const server = http.createServer(app);

const io = socketIO(server,{
cors:{
origin:"*"
}
});

/* PUBLIC */

app.use(
express.static(
path.join(__dirname,"public")
)
);

/* DATABASE */

let users = [];

let admins = [];

let bannedUsers = [];

let mutedUsers = [];

let logs = [];

/* LOAD JSON */

function loadFile(fileName,defaultData=[]){

try{

if(
!fs.existsSync(fileName)
){

fs.writeFileSync(
fileName,
JSON.stringify(
defaultData,
null,
2
)
);

return defaultData;

}

const data = fs.readFileSync(
fileName,
"utf8"
);

return JSON.parse(data);

}
catch(err){

console.log(
"LOAD ERROR:",
fileName,
err
);

return defaultData;

}

}

admins =
loadFile(
"admins.json"
);

bannedUsers =
loadFile(
"banned.json"
);

mutedUsers =
loadFile(
"muted.json"
);

logs =
loadFile(
"logs.json"
);

/* SAVE JSON */

function saveFile(
fileName,
data
){

fs.writeFileSync(

fileName,

JSON.stringify(
data,
null,
2
)

);

}

/* LOG SYSTEM */

function addLog(text){

const log = {

time:
new Date()
.toLocaleString(),

message:text

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

console.log(
text
);

}

/* ADMIN CHECK */

function hasPermission(
socket,
permission
){

if(
!socket.adminData
){
return false;
}

return socket
.adminData
.permissions?.[
permission
] === true;

}

/* CONNECTION */

io.on(
"connection",
(socket)=>{

console.log(
"Connected:",
socket.id
);

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

});

});

/* START */

const PORT =
process.env.PORT
||
3000;

server.listen(
PORT,
()=>{

console.log(
`🚀 Server Running ${PORT}`
);

addLog(
"🚀 Server started"
);

});
