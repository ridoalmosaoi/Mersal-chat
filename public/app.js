const socket=io();

/* GLOBAL */

let currentUser=null;
let currentColor="#ffd700";
let currentPrivateUser=null;
let protectedNames=[];
let replyData=null;

/* ELEMENTS */

const loginPage=
document.getElementById("loginPage");

const chatPage=
document.getElementById("chatPage");

const username=
document.getElementById("username");

const adminPassword=
document.getElementById("adminPassword");

const messages=
document.getElementById("messages");

const usersList=
document.getElementById("usersList");

/* SHOW PASSWORD */

username.addEventListener(
"input",
()=>{

socket.emit(
"check admin",
username.value.trim()
);

}
);

socket.on(
"admin check result",
isAdmin=>{

if(isAdmin){

adminPassword.style.display=
"block";

}else{

adminPassword.style.display=
"none";

adminPassword.value="";

}

}
);

/* COLORS */

document

.querySelectorAll(
".color-option"
)

.forEach(el=>{

el.onclick=()=>{

document

.querySelectorAll(
".color-option"
)

.forEach(x=>{

x.classList.remove(
"active-color"
);

});

el.classList.add(
"active-color"
);

currentColor=

el.dataset.color;

};

});

/* JOIN */

function joinChat(){

const name=

username.value.trim();

if(!name){

alert(
"اكتب الاسم"
);

return;

}

currentUser=name;

socket.emit(

"join",

{

username:name,

adminPassword:
adminPassword.value,

color:
currentColor,

deviceToken:
navigator.userAgent

}

);

}

/* LOGIN */

socket.on(

"login success",

()=>{

loginPage.style.display=
"none";

chatPage.style.display=
"flex";

});

socket.on(

"banned",

msg=>{

alert(msg);

});

/* SEND */

function sendMessage(){

const input=

document.getElementById(
"messageInput"
);

const text=

input.value.trim();

if(!text){
return;
}

socket.emit(

"chat message",

{

message:text,

reply:
replyData

}

);

input.value="";

cancelReply();

}

document

.getElementById(
"messageInput"
)

.addEventListener(

"keypress",

e=>{

if(
e.key==="Enter"
){

sendMessage();

}

}

);

/* RECEIVE */

socket.on(

"chat message",

data=>{

const div=

document.createElement(
"div"
);

div.className=
"message";

if(

data.username===currentUser

){

div.classList.add(
"my-message"
);

}

let replyHtml="";

if(data.reply){

replyHtml=`

<div
style="
background:#252525;
padding:8px;
border-radius:10px;
margin-bottom:8px;
"
>

↩️
${data.reply.user}

<br>

${data.reply.text}

</div>

`;

}

div.innerHTML=`

<div

class="message-user"

style="
color:${data.color}
"

onclick='showUserPopup(${JSON.stringify(data)})'

>

${data.username}

</div>

${replyHtml}

<div class="message-text">

${data.message}

</div>

`;

messages.appendChild(
div
);

messages.scrollTop=

messages.scrollHeight;

});

/* USERS */

socket.on(

"online users",

users=>{

usersList.innerHTML="";

users.forEach(user=>{

const div=

document.createElement(
"div"
);

div.className=
"user-item";

div.innerHTML=

`👤 ${user.username}`;

div.onclick=()=>{

showUserPopup(
user
);

};

usersList.appendChild(
div);

});

});

/* POPUP */

function showUserPopup(user){

const overlay=

document.getElementById(
"userPopupOverlay"
);

const title=

document.getElementById(
"popupUsername"
);

const buttons=

document.getElementById(
"popupButtons"
);

title.innerHTML=

`👤 ${user.username}`;

buttons.innerHTML=`

<button
onclick="
copyName(
'${user.username}'
)
">

📋 نسخ الاسم

</button>

<button
onclick="
replyTo(
'${user.username}',
'${user.message||""}'
)
">

↩️ رد

</button>

<button
onclick="
openPrivate(
'${user.id}',
'${user.username}'
)
">

💬 مرسال خاص

</button>

`;

overlay.style.display=
"flex";

}

/* COPY */

function copyName(name){

navigator.clipboard.writeText(
name
);

alert(
"✅ تم نسخ الاسم"
);

}

/* REPLY */

function replyTo(
user,
text
){

replyData={

user,
text

};

document
.getElementById(
"replyBox"
)
.style.display=
"flex";

document
.getElementById(
"replyText"
)
.innerHTML=

`↩️ ${user}: ${text}`;

closeUserPopup();

}

function cancelReply(){

replyData=null;

document
.getElementById(
"replyBox"
)
.style.display=
"none";

}

/* PRIVATE */

function openPrivate(
id,
name
){

currentPrivateUser=id;

document
.getElementById(
"privateTitle"
)
.innerHTML=

`💬 ${name}`;

document
.getElementById(
"privateChatBox"
)
.style.display=
"flex";

closeUserPopup();

}

function sendPrivate(){

const input=

document.getElementById(
"privateInput"
);

const text=

input.value.trim();

if(
!text
||
!currentPrivateUser
){
return;
}

socket.emit(

"private message",

{

to:
currentPrivateUser,

from:
currentUser,

message:
text

}

);

input.value="";

}

socket.on(

"private message",

data=>{

const box=

document.getElementById(
"privateMessages"
);

box.innerHTML+=`

<div class="message">

<b>

${data.from}

</b>

<br>

${data.message}

</div>

`;

});

/* MENU */

function openUsers(){

document
.getElementById(
"usersMenu"
)
.classList.add(
"show"
);

}

function closeUsers(){

document
.getElementById(
"usersMenu"
)
.classList.remove(
"show"
);

}

function closePrivate(){

document
.getElementById(
"privateChatBox"
)
.style.display=
"none";

}

function closeUserPopup(){

document
.getElementById(
"userPopupOverlay"
)
.style.display=
"none";

}
