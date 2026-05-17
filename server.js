const express = require("express");

const app = express();

const http = require("http").createServer(app);

const io = require("socket.io")(http,{

    cors:{
        origin:"*"
    }

});

const path = require("path");

/* STATIC */

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

        /* ADMIN PASSWORD */

        if(

        data.username ===
        "Admin"

        &&

        data.password !==
        "admin771"

        ){

            socket.emit(

                "banned",

                "كلمة سر الإدارة خاطئة 🚫"

            );

            return;

        }

        /* REAL IP */

        const ip =

        socket.handshake.headers[
            "x-forwarded-for"
        ]

        ||

        socket.handshake.address;

        /* CHECK BAN */

        const banned =

        bannedUsers.find(

            b=>

            b.ip === ip

        );

        if(banned){

            socket.emit(

                "banned",

                `

تم حظرك من شات مرسال 🚫

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

            );

            return;

        }

        /* USER */

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

        /* USERS */

        io.emit(

            "online users",

            users

        );

        /* SYSTEM MESSAGE */

        if(

            data.username ===
            "Admin"

        ){

            io.emit(

                "chat message",

                {

                    id:"system",

                    username:"",

                    color:"gold",

                    message:
                    "تم توكيل المشرف 👑"

                }

            );

        }

    });

    /* PUBLIC CHAT */

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

                id:
                user.id,

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

        const target =

        io.sockets.sockets
        .get(userId);

        if(target){

            io.to(userId).emit(

                "banned",

                "تم طردك من الشات ⚠️"

            );

            target.disconnect();

        }

    });

    /* BAN */

    socket.on(

        "ban user",

        (userId)=>{

        const targetUser =

        users.find(

            u=>

            u.id === userId

        );

        if(!targetUser){

            return;

        }

        bannedUsers.push({

            ip:
            targetUser.ip

        });

        io.to(userId).emit(

            "banned",

            `

تم حظرك من شات مرسال 🚫

إذا شعرت أن القرار ظالم
راسل الإدارة على تلجرام:

Rido77

`

        );

        io.sockets.sockets
        .get(userId)
        ?.disconnect();

    });

    /* FULL DISCONNECT */

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
