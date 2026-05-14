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

        userAgent.includes(
            "Chrome"
        )

    ){

        browser =
        "Chrome";

    }else if(

        userAgent.includes(
            "Safari"
        )

    ){

        browser =
        "Safari";

    }

    if(

        userAgent.includes(
            "iPhone"
        )

    ){

        device =
        "iPhone";

    }else if(

        userAgent.includes(
            "Android"
        )

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

        if(

            bannedIPs.includes(ip)

        ){

            socket.disconnect();

            return;

        }

        const disconnected =

        disconnectedUsers.find(

            u => u.ip === ip

        );

        if(disconnected){

            socket.disconnect();

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

        socket.emit(
            "login success"
        );

        io.emit(
            "online users",
            users
        );

        if(

            data.username ===
            ADMIN_NAME

            &&

            data.password ===
            ADMIN_PASSWORD

        ){

            io.emit(

                "chat message",

                {

                    id:"system",

                    username:
                    "ChanServ",

                    color:
                    "#00ff99",

                    message:
                    "** تم توكيل المشرف Admin"

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

    /* PRIVATE MESSAGE */

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

    /* KICK USER */

    socket.on(

        "kick user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(!target){

            return;

        }

        io.emit(

            "chat message",

            {

                username:
                "ChanServ",

                color:
                "#ffcc00",

                message:
                `** تم طرد ${target.username}`

            }

        );

        target.disconnect(
            true
        );

    });

    /* BAN USER */

    socket.on(

        "ban user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(!target){

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

        io.emit(

            "chat message",

            {

                username:
                "ChanServ",

                color:
                "#ff3333",

                message:
                `** تم حظر ${target.username}`

            }

        );

        target.disconnect(
            true
        );

    });

    /* DISCONNECT USER */

    socket.on(

        "disconnect user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(!target){

            return;

        }

        disconnectedUsers.push({

            id,

            ip:
            target.handshake.address

        });

        io.emit(

            "chat message",

            {

                username:
                "ChanServ",

                color:
                "#ffaa00",

                message:
                `** تم فصل ${target.username}`

            }

        );

        target.disconnect(
            true
        );

    });

    /* DISCONNECT */

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
