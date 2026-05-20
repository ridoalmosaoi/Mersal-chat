const socket = io({

transports:["polling","websocket"],

upgrade:true,

rememberUpgrade:true,

reconnection:true,

reconnectionAttempts:Infinity,

reconnectionDelay:1000,

reconnectionDelayMax:4000,

randomizationFactor:0.5,

timeout:20000,

autoConnect:true

});

/* ERROR DEBUG */

window.onerror = function(msg){

console.log(
"ERROR:",
msg
);

};

const ADMIN_NAME = "Admin";

let currentUser = "";

let selectedUser = null;

let currentColor = "#ffd700";

/* COLOR SELECT */

function selectColor(color){

currentColor = color;

document
.querySelectorAll(
".color-btn"
)
.forEach(btn=>{

btn.style.border =
"3px solid white";

});

event.target.style.border =
"3px solid red";

}

/* DEVICE TOKEN */

let deviceToken =

localStorage.getItem(
"deviceToken"
);

if(!deviceToken){

deviceToken =

Math.random()
.toString(36)
.substring(2)

+

Date.now();

localStorage.setItem(
"deviceToken",
deviceToken
);

}

/* KEEP SOCKET ACTIVE */

setInterval(()=>{

if(socket.connected){

socket.emit(
"ping alive"
);

}

},15000);

/* RETURN RECONNECT */

document.addEventListener(

"visibilitychange",

()=>{

if(

document.visibilityState ===
"visible"

&&

!socket.connected

){

socket.connect();

}

});

/* SOCKET STATUS */

socket.on(

"connect",

()=>{

console.log(
"Connected ✅"
);

});

socket.on(

"connect_error",

(err)=>{

console.log(
"Connect Error:",
err.message
);

});

socket.on(

"disconnect",

()=>{

addSystemMessage(
"⚠️ انقطع الاتصال..."
,
"red"
);

});

socket.on(

"reconnect",

()=>{

addSystemMessage(
"✅ عاد الاتصال"
,
"lime"
);

});

socket.on(

"pong alive",

()=>{

console.log(
"alive"
);

});

/* LOGIN */

function login(){

const username =

document
.getElementById(
"loginUsername"
)
.value
.trim();

const password =

document
.getElementById(
"loginPassword"
)
.value
.trim();

if(!username){

alert(
"اكتب الاسم"
);

return;

}

if(!socket.connected){

alert(
"السيرفر غير متصل 🚫"
);

socket.connect();

return;

}

currentUser =
username;

localStorage.setItem(
"username",
username
);

socket.emit(

"join",

{

username,

password,

color:
currentColor,

browser:
navigator.userAgent,

device:
navigator.platform,

deviceToken

}

);

}

/* AUTO LOGIN */

window.onload = ()=>{

const savedUser =

localStorage.getItem(
"username"
);

if(savedUser){

document
.getElementById(
"loginUsername"
)
.value =
savedUser;

}

};

/* LOGIN SUCCESS */

socket.on(

"login success",

()=>{

document
.getElementById(
"loginScreen"
)
.style.display =
"none";

document
.getElementById(
"chatApp"
)
.style.display =
"flex";

if(

currentUser ===
ADMIN_NAME

){

document
.getElementById(
"bannedPanelBtn"
)
.style.display =
"block";

}

});

/* BANNED */

socket.on(

"banned",

(msg)=>{

alert(msg);

document
.getElementById(
"chatApp"
)
.style.display =
"none";

document
.getElementById(
"loginScreen"
)
.style.display =
"flex";

});

/* FULL BLOCK */

socket.on(

"full device banned",

(msg)=>{

alert(msg);

document
.getElementById(
"chatApp"
)
.style.display =
"none";

document
.getElementById(
"loginScreen"
)
.style.display =
"flex";

});

/* ONLINE USERS */

socket.on(

"online users",

(users)=>{

const usersList =

document
.getElementById(
"usersList"
);

if(!usersList){
return;
}

usersList.innerHTML = "";

users.forEach(user=>{

const div =

document
.createElement(
"div"
);

div.className =
"online-user";

div.innerHTML = `

${

user.username ===
ADMIN_NAME

?

"⭐"

:

"👤"

}

${user.username}

`;

div.onclick = ()=>{

selectedUser =
user;

openUserMenu();

};

usersList.appendChild(
div
);

});

});

/* CHAT MESSAGE */

socket.on(

"chat message",

(data)=>{

const messages =

document
.getElementById(
"messages"
);

if(!messages){
return;
}

let messageText =
data.message;

/* RED NAME */

const regex =
/<([^>]+)>/g;

messageText =
messageText.replace(

regex,

(match)=>{

return `

<span style="
color:red;
font-weight:bold;
">

${match}

</span>

`;

}

);

const div =

document
.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span
class="msg-name"
style="
color:${data.color};
font-weight:bold;
">

&lt;${data.username}&gt;

</span>

<span
class="msg-text">

${messageText}

</span>

`;

div.onclick = ()=>{

if(
data.username === "System"
){
return;
}

selectedUser = {

id:data.id,

username:data.username,

ip:data.ip,

browser:data.browser,

device:data.device

};

openUserMenu();

};

messages.appendChild(
div
);

messages.scrollTop =
messages.scrollHeight;

});

/* PRIVATE MESSAGE */

socket.on(

"private message",

(data)=>{

document
.getElementById(
"privateBox"
)
.style.display =
"flex";

const box =

document
.getElementById(
"privateMessages"
);

const div =

document
.createElement(
"div"
);

div.className =
"private-message";

div.innerHTML = `

<b style="
color:#00d0b4;
">

${data.from}

</b>

<br>

${data.message}

`;

box.appendChild(
div
);

box.scrollTop =
box.scrollHeight;

});

/* SEND MESSAGE */

function sendMessage(){

const input =

document
.getElementById(
"messageInput"
);

const message =
input.value.trim();

if(!message){
return;
}

socket.emit(

"chat message",

{

message,
username:currentUser,
color:currentColor

}

);

input.value = "";

}

/* SEND PRIVATE */

function sendPrivate(){

const input =

document
.getElementById(
"privateInput"
);

const message =
input.value.trim();

if(!message){
return;
}

socket.emit(

"private message",

{

to:selectedUser.id,

from:currentUser,

message

}

);

const box =

document
.getElementById(
"privateMessages"
);

const div =

document
.createElement(
"div"
);

div.className =
"private-message";

div.innerHTML = `

<b style="
color:#ffd700;
">

أنت

</b>

<br>

${message}

`;

box.appendChild(
div
);

box.scrollTop =
box.scrollHeight;

input.value = "";

}

/* USERS */

function toggleUsers(){

document
.getElementById(
"usersPopup"
)
.style.display =
"flex";

}

/* USER MENU */

function openUserMenu(){

document
.getElementById(
"userMenu"
)
.style.display =
"flex";

const isAdmin =

currentUser ===
ADMIN_NAME;

document
.getElementById(
"adminOptions"
)
.style.display =

isAdmin

?

"block"

:

"none";

document
.getElementById(
"userInfoBtn"
)
.style.display =

isAdmin

?

"block"

:

"none";

}

/* PRIVATE BOX */

function openPrivate(){

if(!selectedUser){
return;
}

closeAll();

document
.getElementById(
"privateTitle"
)
.innerHTML =

`💬 مرسال - ${selectedUser.username}`;

document
.getElementById(
"privateMessages"
)
.innerHTML = "";

document
.getElementById(
"privateBox"
)
.style.display =
"flex";

}

/* USER INFO */

function showUserInfo(){

document
.getElementById(
"userInfoPopup"
)
.style.display =
"flex";

document
.getElementById(
"userInfoContent"
)
.innerHTML = `

الاسم:
${selectedUser.username}

<br><br>

IP:
${selectedUser.ip || "Unknown"}

<br><br>

Device:
${selectedUser.device || "Unknown"}

`;

}

/* REPLY */

function replyUser(){

document
.getElementById(
"messageInput"
)
.value +=

`<${selectedUser.username}> `;

closeAll();

}

/* ADMIN */

function kickUser(){

socket.emit(
"kick user",
selectedUser.id
);

closeAll();

}

function banUser(){

socket.emit(
"ban user",
selectedUser.id
);

closeAll();

}

function disconnectUser(){

socket.emit(
"disconnect user",
selectedUser.id
);

closeAll();

}

/* BANNED PANEL */

function openBannedPanel(){

if(
currentUser !== ADMIN_NAME
){
return;
}

socket.emit(
"get banned users"
);

document
.getElementById(
"bannedPopup"
)
.style.display =
"flex";

}

/* BANNED LIST */

socket.on(

"banned users list",

(list)=>{

renderBannedUsers(
list
);

});

socket.on(

"banned users updated",

(list)=>{

renderBannedUsers(
list
);

});

function renderBannedUsers(list){

const box =

document
.getElementById(
"bannedList"
);

if(!box){
return;
}

box.innerHTML = "";

if(list.length <= 0){

box.innerHTML = `

<div class="online-user">

لا يوجد محظورين 😎

</div>

`;

return;

}

list.forEach((ban,index)=>{

const div =

document.createElement(
"div"
);

div.className =
"online-user";

div.innerHTML = `

${

ban.fullDisconnect

?

"⛔ فصل كلي"

:

"🚫 حظر"

}

<br><br>

👤 ${ban.username}

<br><br>

🌐 ${ban.ip}

<br><br>

<button
onclick="
unbanUser(${index})
"
style="
margin-top:10px;
padding:10px 16px;
border:none;
border-radius:10px;
background:lime;
font-size:18px;
cursor:pointer;
">

فك الحظر

</button>

`;

box.appendChild(
div
);

});

}

/* UNBAN */

function unbanUser(index){

socket.emit(
"unban user",
index
);

}

/* SYSTEM MESSAGE */

function addSystemMessage(text,color){

const messages =

document.getElementById(
"messages"
);

if(!messages){
return;
}

const div =

document.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span style="
color:${color};
font-weight:bold;
">

${text}

</span>

`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

}

/* CLOSE */

function closeAll(){

document
.querySelectorAll(
".popup-bg"
)
.forEach(p=>{

p.style.display =
"none";

});

}

/* CLOSE OUTSIDE */

document.addEventListener(

"click",

(e)=>{

if(

e.target.classList.contains(
"popup-bg"
)

){

closeAll();

}

});

/* ENTER SEND */

document.addEventListener(

"keydown",

(e)=>{

if(
e.key === "Enter"
){

if(

document
.getElementById(
"privateBox"
)
.style.display === "flex"

){

sendPrivate();

}

else{

sendMessage();

}

}

});
