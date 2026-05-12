const express = require("express");

const http = require("http");

const fs = require("fs");

const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{
    pingTimeout:60000,
    pingInterval:25000,
    transports:["websocket"]
});

app.use(express.static("public"));

let users = [];
let bannedIPs = [];
let bannedIDs = [];

if(fs.existsSync("users.json")){
    users = JSON.parse(fs.readFileSync("users.json"));
}

function saveUsers(){
    fs.writeFileSync(
        "users.json",
        JSON.stringify(users,null,2)
    );
}

io.on("connection",(socket)=>{

    const ip = socket.handshake.address;

    if(
        bannedIPs.includes(ip) ||
        bannedIDs.includes(socket.id)
    ){
        socket.disconnect();
        return;
    }

    socket.on("join",(data)=>{

        const username = data.username.trim();

        const exists = users.some(
            user =>
            user.username.toLowerCase() ===
            username.toLowerCase()
        );

        if(exists){
            socket.emit("name taken");
            return;
        }

        socket.username = username;

        socket.join("الوطن العربي");

        users.push({
            id:socket.id,
            username,
            ip
        });

        saveUsers();

        io.emit("online users",users);

        io.emit("system",{
            text:`${username} دخل الغرفة`
        });

    });

    socket.on("chat message",(data)=>{

        io.emit("chat message",{
            id:socket.id,
            username:data.username,
            message:data.message,
            time:new Date().toLocaleTimeString()
        });

    });

    socket.on("private message",(data)=>{

        io.to(data.toSocket).emit(
            "private message",
            {
                from:data.from,
                message:data.message
            }
        );

    });

    socket.on("kick user",(id)=>{
        io.sockets.sockets.get(id)?.disconnect();
    });

    socket.on("ban user",(data)=>{

        const target =
        io.sockets.sockets.get(data.id);

        if(target){

            const ip =
            target.handshake.address;

            bannedIPs.push(ip);

            bannedIDs.push(data.id);

            target.emit("banned");

            target.disconnect(true);

        }

    });

    socket.on("disconnect user",(id)=>{
        io.sockets.sockets.get(id)?.disconnect(true);
    });

    socket.on("disconnect",()=>{

        users = users.filter(
            user => user.id !== socket.id
        );

        saveUsers();

        io.emit("online users",users);

        io.emit("system",{
            text:`${socket.username} غادر الغرفة`
        });

    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
    console.log("Server running");
});
