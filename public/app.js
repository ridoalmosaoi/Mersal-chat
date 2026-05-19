const socket = io({

transports:["websocket"],

upgrade:false,

rememberUpgrade:true,

reconnection:true,

reconnectionAttempts:999999,

reconnectionDelay:1000,

reconnectionDelayMax:3000,

timeout:20000,

pingTimeout:60000,

pingInterval:25000

});

const ADMIN_NAME = "Admin";

let currentUser = "";

let selectedUser = null;

let currentColor = "#ffd700";

/* KEEP CONNECTION */

document.addEventListener(

"visibilitychange",

()=>{

if(

document.visibilityState ===
"visible"

){

if(

!socket.connected

){

socket.connect();

}

}

});

/* CONNECTION STATUS */

socket.on(

"disconnect",

()=>{

const div =

document.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span style="
color:red;
font-weight:bold;
">

⚠️ انقطع الاتصال...

</span>

`;

document
.getElementById(
"messages"
)
?.appendChild(div);

});

socket.on(

"reconnect",

()=>{

const div =

document.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span style="
color:lime;
font-weight:bold;
">

✅ عاد الاتصال

</span>

`;

document
.getElementById(
"messages"
)
?.appendChild(div);

});

socket.on(

"reconnecting",

()=>{

const div =

document.createElement(
"div"
);

div.className =
"msg-line";

div.innerHTML = `

<span style="
color:orange;
font-weight:bold;
">

🔄 جاري إعادة الاتصال...

</span>

`;

document
.getElementById(
"messages"
)
?.appendChild(div);

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
navigator.platform

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

/* ADMIN BUTTON */

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

}

);

/* BANNED */

socket.on(

"banned",

(msg)=>{

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

alert(msg);

}

);

/* ONLINE USERS */

socket.on(

"online users",

(users)=>{

const usersList =

document
.getElementById(
"usersList"
);

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

}

);

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

username:
currentUser,

color:
currentColor,

message

}

);

input.value = "";

}

/* RECEIVE MESSAGE */

socket.on(

"chat message",

(data)=>{

const messages =

document
.getElementById(
"messages"
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
">

&lt;${data.username}&gt;

</span>

<span
class="msg-text">

${data.message}

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

}

);

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

/* PRIVATE */

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

/* RECEIVE PRIVATE */

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

}

);

/* USER INFO */

function showUserInfo(){

let shortBrowser =
"Unknown";

if(
selectedUser.browser
?.includes("iPhone")
){
shortBrowser =
"iPhone";
}

if(
selectedUser.browser
?.includes("Android")
){
shortBrowser =
"Android";
}

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

Browser:
${shortBrowser}

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

/* KICK */

function kickUser(){

socket.emit(
"kick user",
selectedUser.id
);

closeAll();

}

/* BAN */

function banUser(){

socket.emit(
"ban user",
selectedUser.id
);

closeAll();

}

/* DISCONNECT */

function disconnectUser(){

socket.emit(
"disconnect user",
selectedUser.id
);

closeAll();

}

/* OPEN BANNED PANEL */

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

/* RECEIVE BANNED */

socket.on(

"banned users list",

(list)=>{

renderBannedUsers(
list
);

}

);

/* UPDATE BANNED */

socket.on(

"banned users updated",

(list)=>{

renderBannedUsers(
list
);

}

);

/* RENDER BANNED */

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

<div
class="online-user">

لا يوجد محظورين 😎

</div>

`;

return;

}

list.forEach((ban,index)=>{

const div =

document
.createElement(
"div"
);

div.className =
"online-user";

div.innerHTML = `

🚫 ${ban.username || "مستخدم"}

<br><br>

IP:

${ban.ip}

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

if(
currentUser !== ADMIN_NAME
){
return;
}

socket.emit(
"unban user",
index
);

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

}

);

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

}

);
