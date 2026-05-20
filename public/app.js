const socket = io({

transports:["polling","websocket"],

upgrade:true,

rememberUpgrade:true,

reconnection:true,

reconnectionAttempts:Infinity,

reconnectionDelay:1000,

reconnectionDelayMax:4000,

timeout:20000,

autoConnect:true

});

/* ERROR */

window.onerror = function(msg){

console.log(
"ERROR:",
msg
);

};

/* GLOBAL */

const ADMIN_NAME = "Admin";

let currentUser = "";

let selectedUser = null;

let currentColor = "#ffd700";

let privateNotifications = 0;

/* COLOR */

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

/* KEEP ALIVE */

setInterval(()=>{

if(socket.connected){

socket.emit(
"ping alive"
);

}

},15000);

/* RECONNECT */

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

/* CONNECT */

socket.on(

"connect",

()=>{

console.log(
"Connected ✅"
);

});

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

addSystemMessage(
"⚠️ انقطع الاتصال"
,
"red"
);

});

/* RECONNECT */

socket.on(

"reconnect",

()=>{

addSystemMessage(
"✅ عاد الاتصال"
,
"lime"
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

const input =

document.getElementById(
"loginUsername"
);

if(
savedUser
&&
input
){

input.value =
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

});

/* FULL BLOCK */

socket.on(

"full device banned",

(msg)=>{

alert(msg);

});

/* USERS */

socket.on(

"online users",

(users)=>{

const usersList =

document.getElementById(
"usersList"
);

if(!usersList){
return;
}

usersList.innerHTML = "";

users.forEach(user=>{

const div =

document.createElement(
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

/* RECEIVE CHAT */

socket.on(

"chat message",

(data)=>{

const messages =

document.getElementById(
"messages"
);

if(!messages){
return;
}

let messageText =
data.message;

/* RED REPLY */

messageText =
messageText.replace(

/<([^>]+)>/g,

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

document.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span
class="msg-name"
style="
color:${data.color};
">

&lt;${data.username}&gt;

</span>

<span class="msg-text">

${messageText}

</span>

`;

div.onclick = ()=>{

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

/* SEND CHAT */

function sendMessage(){

const input =

document.getElementById(
"messageInput"
);

if(!input){
return;
}

const message =
input.value.trim();

if(!message){
return;
}

socket.emit(

"chat message",

{

message:message,

username:currentUser,

color:currentColor

}

);

input.value = "";

}

/* RECEIVE PRIVATE */

socket.on(

"private message",

(data)=>{

privateNotifications++;

const badge =

document.getElementById(
"privateNotify"
);

if(badge){

badge.style.display =
"flex";

badge.innerText =
privateNotifications;

}

const privateList =

document.getElementById(
"privateList"
);

if(privateList){

const item =

document.createElement(
"div"
);

item.className =
"online-user";

item.innerHTML = `

💬 ${data.from}

`;

item.onclick = ()=>{

document
.getElementById(
"privateTitle"
)
.innerHTML =

`💬 ${data.from}`;

document
.getElementById(
"privateBox"
)
.style.display =
"flex";

};

privateList.prepend(
item
);

}

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

document.createElement(
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

/* SEND PRIVATE */

function sendPrivate(){

const input =

document
.getElementById(
"privateInput"
);

if(!input){
return;
}

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

document.createElement(
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

/* PRIVATE LIST */

function openPrivateList(){

document
.getElementById(
"privateListPopup"
)
.style.display =
"flex";

const badge =

document.getElementById(
"privateNotify"
);

if(badge){

badge.style.display =
"none";

}

privateNotifications = 0;

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

/* PRIVATE OPEN */

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

/* BANNED */

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

list.forEach((ban,index)=>{

const div =

document.createElement(
"div"
);

div.className =
"online-user";

div.innerHTML = `

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
padding:10px;
border:none;
border-radius:10px;
background:lime;
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

/* SYSTEM */

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

messages.appendChild(
div
);

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

/* OUTSIDE CLOSE */

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

/* ENTER */

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
