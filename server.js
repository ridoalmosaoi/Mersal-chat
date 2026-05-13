const express = require("express");

const http = require("http");

const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{

    transports:["websocket"],

    pingTimeout:60000,

    pingInterval:25000

});

app.use(

    express.static("public")

);

const ADMIN_NAME = "Admin";

const ADMIN_PASSWORD = "admin771";

let users = [];

let bannedIPs = [];

let disconnectedUsers = [];

/* CONNECTION */

io.on(

    "connection",

    (socket)=>{

    const ip =

    socket.handshake.headers[
        "x-forwarded-for"
    ]

    ||

    socket.handshake.address

    ||

    "Unknown";

    const userAgent =

    socket.handshake.headers[
        "user-agent"
    ] || "";

    let browser =
    "Unknown";

    let device =
    "Unknown";

    if(

        userAgent.includes("Chrome")

    ){

        browser =
        "Chrome";

    }else if(

        userAgent.includes("Safari")

    ){

        browser =
        "Safari";

    }

    if(

        userAgent.includes("iPhone")

    ){

        device =
        "iPhone";

    }else if(

        userAgent.includes("Android")

    ){

        device =
        "Android";

    }else{

        device =
        "Desktop";

    }

    /* JOIN */

    socket.on(

        "join",

        (data)=>{

        const isAdmin =

        data.username ===
        ADMIN_NAME &&

        data.password ===
        ADMIN_PASSWORD;

        if(

            bannedIPs.includes(ip) &&

            !isAdmin

        ){

            socket.disconnect();

            return;

        }

        const disconnected =

        disconnectedUsers.find(

            u => u.ip === ip

        );

        if(

            disconnected &&

            !isAdmin

        ){

            socket.disconnect();

            return;

        }

        const exists =

        users.find(

            u =>

            u.username
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

        users.push({

            id:socket.id,

            username:
            data.username,

            color:
            data.color,

            ip,

            browser,

            device

        });

        /* SUCCESS */

        socket.emit(
            "login success"
        );

        /* USERS */

        io.emit(
            "online users",
            users
        );

        /* ADMIN MSG */

        if(isAdmin){

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
                data.message,

                ip,

                browser,

                device

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

    /* BAN */

    socket.on(

        "ban user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(!target){

            return;

        }

        if(

            target.username ===
            ADMIN_NAME

        ){

            return;

        }

        const targetIP =

        target.handshake.headers[
            "x-forwarded-for"
        ]

        ||

        target.handshake.address;

        bannedIPs.push(
            targetIP
        );

        target.disconnect(
            true
        );

    });

    /* DISCONNECT */

    socket.on(

        "disconnect user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(!target){

            return;

        }

        if(

            target.username ===
            ADMIN_NAME

        ){

            return;

        }

        disconnectedUsers.push({

            id,

            ip:
            target.handshake.address

        });

        target.disconnect(
            true
        );

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

const PORT =
process.env.PORT || 3000;

server.listen(

    PORT,

    ()=>{

    console.log(
        "Server running"
    );

});
