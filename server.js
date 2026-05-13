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

/* USERS */

let users = [];

/* BANNED */

let bannedIPs = [];

/* DISCONNECTED */

let disconnectedUsers = [];

/* CONNECTION */

io.on(

    "connection",

    (socket)=>{

    const ip =

    socket.handshake.address;

    const userAgent =

    socket.handshake.headers[
        "user-agent"
    ] || "";

    /* INFO */

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

        /* ADMIN BYPASS */

        const isAdmin =

        data.username ===
        ADMIN_NAME &&

        data.password ===
        ADMIN_PASSWORD;

        /* BANNED */

        if(

            bannedIPs.includes(ip) &&

            !isAdmin

        ){

            socket.disconnect();

            return;

        }

        /* DISCONNECTED */

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

        /* NAME EXISTS */

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

        /* SEND LISTS */

        io.emit(

            "ban list",

            bannedIPs.map(ip=>({

                ip,

                username:
                "محظور"

            }))

        );

        io.emit(

            "disconnect list",

            disconnectedUsers

        );

        /* CHANSERV */

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

    /* KICK */

    socket.on(

        "kick user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(

            !target ||

            target.username ===
            ADMIN_NAME

        ){

            return;

        }

        target.disconnect(
            true
        );

    });

    /* BAN */

    socket.on(

        "ban user",

        (id)=>{

        const target =

        io.sockets.sockets
        .get(id);

        if(

            !target ||

            target.username ===
            ADMIN_NAME

        ){

            return;

        }

        const targetIP =

        target.handshake
        .address;

        if(

            !bannedIPs.includes(
                targetIP
            )

        ){

            bannedIPs.push(
                targetIP
            );

        }

        io.emit(

            "ban list",

            bannedIPs.map(ip=>({

                ip,

                username:
                "محظور"

            }))

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

        if(

            !target ||

            target.username ===
            ADMIN_NAME

        ){

            return;

        }

        disconnectedUsers.push({

            id,

            username:
            target.username,

            ip:
            target.handshake.address

        });

        io.emit(

            "disconnect list",

            disconnectedUsers

        );

        target.disconnect(
            true
        );

    });

    /* UNBAN */

    socket.on(

        "unban user",

        (ip)=>{

        bannedIPs =

        bannedIPs.filter(

            banned =>
            banned !== ip

        );

        io.emit(

            "ban list",

            bannedIPs.map(ip=>({

                ip,

                username:
                "محظور"

            }))

        );

    });

    /* UNDISCONNECT */

    socket.on(

        "undisconnect user",

        (id)=>{

        disconnectedUsers =

        disconnectedUsers.filter(

            user =>
            user.id !== id

        );

        io.emit(

            "disconnect list",

            disconnectedUsers

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
