const express = require("express");

const http = require("http");

const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{

    pingTimeout:60000,

    pingInterval:25000,

    transports:["websocket"]

});

app.use(

    express.static("public")

);

/* USERS */

let users = [];

/* BANS */

let bannedIPs = [];

/* CONNECTION */

io.on(

    "connection",

    (socket)=>{

    const ip =

    socket.handshake.address;

    /* BANNED */

    if(

        bannedIPs.includes(ip)

    ){

        socket.disconnect();

        return;

    }

    /* JOIN */

    socket.on(

        "join",

        (data)=>{

        const exists =

        users.find(

            user =>

            user.username
            .toLowerCase()

            ===

            data.username
            .toLowerCase()

        );

        if(exists){

            socket.emit(
                "name taken"
            );

            return;

        }

        socket.username =
        data.username;

        socket.color =
        data.color;

        users.push({

            id:socket.id,

            username:
            data.username,

            color:
            data.color

        });

        socket.emit(
            "login success"
        );

        io.emit(
            "online users",
            users
        );

        /* CHANSERV */

        if(

            data.username ===
            "Admin"

        ){

            io.emit(

                "chat message",

                {

                    id:"system",

                    username:
                    "ChanServ",

                    color:
                    "#00d0b4",

                    message:
                    "** تم توكيل المشرف Admin"

                }

            );

        }

    });

    /* PUBLIC */

    socket.on(

        "chat message",

        (data)=>{

        io.emit(

            "chat message",

            {

                id:socket.id,

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

        io.to(
            data.to
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

    /* KICK */

    socket.on(

        "kick user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(target){

            target.disconnect(
                true
            );

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

            const targetIP =

            target.handshake
            .address;

            bannedIPs.push(
                targetIP
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

        io.emit(
            "online users",
            users
        );

    });

});

/* START */

const PORT =
process.env.PORT || 3000;

server.listen(

    PORT,

    ()=>{

    console.log(

        "Server running"

    );

});
