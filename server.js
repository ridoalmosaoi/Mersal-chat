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

const ADMIN_NAME = "Admin";

const ADMIN_PASSWORD = "admin771";

let users = [];

let bannedIPs = [];

let disconnectedUsers = [];

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

        socket.username =
        data.username;

        socket.color =
        data.color;

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

        if(isAdmin){

            io.emit(

                "chat message",

                {

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
