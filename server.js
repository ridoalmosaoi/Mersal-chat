const express = require("express");

const http = require("http");

const fs = require("fs");

const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{

    pingTimeout:60000,

    pingInterval:25000,

    transports:[
        "websocket"
    ]

});

app.use(express.static("public"));

let users = [];

let bannedIPs = [];

let bannedIDs = [];

/* LOAD USERS */

if(fs.existsSync("users.json")){

    users =
    JSON.parse(
        fs.readFileSync("users.json")
    );

}

/* SAVE USERS */

function saveUsers(){

    fs.writeFileSync(

        "users.json",

        JSON.stringify(
            users,
            null,
            2
        )

    );

}

/* CONNECTION */

io.on("connection",(socket)=>{

    const ip =
    socket.handshake.address;

    /* BANNED */

    if(

        bannedIPs.includes(ip) ||

        bannedIDs.includes(socket.id)

    ){

        socket.emit(
            "banned"
        );

        socket.disconnect();

        return;

    }

    /* JOIN */

    socket.on("join",(data)=>{

        const username =
        data.username.trim();

        /* NAME EXISTS */

        const exists =
        users.some(

            user =>

            user.username
            .toLowerCase()

            ===

            username
            .toLowerCase()

        );

        if(exists){

            socket.emit(
                "name taken"
            );

            return;

        }

        socket.username =
        username;

        socket.join(
            "الوطن العربي"
        );

        users.push({

            id:socket.id,

            username,

            ip

        });

        saveUsers();

        io.emit(
            "online users",
            users
        );

        /* CHANSERV */

        if(username === "Admin"){

            io.emit(

                "system",

                {

                    text:
                    "ChanServ ** تم توكيل Admin"

                }

            );

        }

    });

    /* PUBLIC MESSAGE */

    socket.on(

        "chat message",

        (data)=>{

        io.emit(

            "chat message",

            {

                id:socket.id,

                username:
                data.username,

                message:
                data.message,

                time:
                new Date()
                .toLocaleTimeString(
                    "ar"
                )

            }

        );

    });

    /* PRIVATE MESSAGE */

    socket.on(

        "private message",

        (data)=>{

        io.to(
            data.toSocket
        ).emit(

            "private message",

            {

                from:
                data.from,

                message:
                data.message

            }

        );

    });

    /* KICK USER */

    socket.on(

        "kick user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(target){

            target.emit(

                "system",

                {

                    text:
                    "تم طردك من الشات"

                }

            );

            target.disconnect(
                true
            );

        }

    });

    /* BAN USER */

    socket.on(

        "ban user",

        (data)=>{

        const target =

        io.sockets.sockets
        .get(data.id);

        if(target){

            const targetIP =

            target.handshake
            .address;

            bannedIPs.push(
                targetIP
            );

            bannedIDs.push(
                data.id
            );

            target.emit(
                "banned"
            );

            target.disconnect(
                true
            );

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

                "system",

                {

                    text:
                    "تم فصل اتصالك"

                }

            );

            target.disconnect(
                true
            );

        }

    });

    /* LEAVE */

    socket.on(

        "disconnect",

        ()=>{

        users =
        users.filter(

            user =>

            user.id !==
            socket.id

        );

        saveUsers();

        io.emit(
            "online users",
            users
        );

    });

});

/* START */

const PORT =
process.env.PORT || 3000;

server.listen(PORT,()=>{

    console.log(

        "Server running on port " +

        PORT

    );

});
