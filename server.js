const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

    cors:{
        origin:"*"
    }

});

const path = require("path");

app.use(

    express.static(

        path.join(
            __dirname,
            "public"
        )

    )

);

/* USERS */

let users = [];

/* BANNED */

let bannedUsers = [];

/* CONNECTION */

io.on(

    "connection",

    (socket)=>{

    console.log(
        "User Connected"
    );

    /* JOIN */

    socket.on(

        "join",

        (data)=>{

        const ip =

        socket.handshake.address;

        /* CHECK BAN */

        const isBanned =

        bannedUsers.find(

            b=>

            b.ip === ip

        );

        if(isBanned){

            socket.emit(

                "banned",

                "تم حظرك من شات مرسال بشكل نهائي 🚫\n\nإذا شعرت أن القرار ظالم راسل الإدارة على تلجرام:\nRido77"

            );

            return;

        }

        /* SAVE USER */

        const user = {

            id:
            socket.id,

            username:
            data.username,

            color:
            data.color ||

            "#ff0000",

            ip,

            browser:
            data.browser ||

            "Unknown",

            device:
            data.device ||

            "Unknown"

        };

        users.push(user);

        /* LOGIN SUCCESS */

        socket.emit(
            "login success"
        );

        /* ONLINE USERS */

        io.emit(

            "online users",

            users

        );

        /* SYSTEM MESSAGE */

        io.emit(

            "chat message",

            {

                id:"system",

                username:"System",

                color:"gold",

                message:
                "تم توكيل المشرف 👑"

            }

        );

    });

    /* CHAT */

    socket.on(

        "chat message",

        (data)=>{

        const user =

        users.find(

            u=>

            u.id === socket.id

        );

        if(!user){

            return;

        }

        io.emit(

            "chat message",

            {

                id:user.id,

                username:
                user.username,

                color:
                user.color,

                message:
                data.message,

                ip:
                user.ip,

                browser:
                user.browser,

                device:
                user.device

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

        (userId)=>{

        io.to(userId).emit(

            "banned",

            "تم طردك من الشات ⚠️"

        );

        io.sockets.sockets
        .get(userId)
        ?.disconnect();

    });

    /* BAN */

    socket.on(

        "ban user",

        (userId)=>{

        const target =

        users.find(

            u=>

            u.id === userId

        );

        if(!target){

            return;

        }

        bannedUsers.push({

            ip:
            target.ip

        });

        io.to(userId).emit(

            "banned",

            "تم حظرك من شات مرسال بشكل نهائي 🚫\n\nإذا شعرت أن القرار ظالم راسل الإدارة على تلجرام:\nRido77"

        );

        io.sockets.sockets
        .get(userId)
        ?.disconnect();

    });

    /* DISCONNECT USER */

    socket.on(

        "disconnect user",

        (userId)=>{

        io.to(userId).emit(

            "banned",

            "تم فصلك من الشات 🚫"

        );

        io.sockets.sockets
        .get(userId)
        ?.disconnect();

    });

    /* DISCONNECT */

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

process.env.PORT ||

3000;

http.listen(

    PORT,

    ()=>{

    console.log(

        "Server Running 🚀"

    );

});
