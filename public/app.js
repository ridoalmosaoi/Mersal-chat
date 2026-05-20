const socket = io({

transports:["websocket"],

forceNew:false,

upgrade:true,

rememberUpgrade:true,

reconnection:true,

reconnectionAttempts:Infinity,

reconnectionDelay:1000,

reconnectionDelayMax:5000,

randomizationFactor:0,

timeout:60000,

pingTimeout:180000,

pingInterval:30000

});

const ADMIN_NAME = "Admin";

let currentUser = "";

let selectedUser = null;

let currentColor = "#ffd700";

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
color:red;
font-weight:bold;
">

⚠️ انقطع الاتصال...

</span>

`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

});

socket.on(

"reconnect",

()=>{

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
color:lime;
font-weight:bold;
">

✅ عاد الاتصال

</span>

`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

});

socket.on(

"reconnecting",

()=>{

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
color:orange;
font-weight:bold;
">

🔄 جاري إعادة الاتصال...

</span>

`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

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

/* NORMAL BAN */

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

/* FULL DEVICE BLOCK */

socket.on(

"full device banned",

(msg)=>{

alert(msg);

localStorage.removeItem(
"username"
);

localStorage.setItem(
"deviceBlocked",
"1"
);

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

/* BLOCK DEVICE */

if(

localStorage.getItem(
"deviceBlocked"
) === "1"

){

document.body.innerHTML = `

<div style="

height:100vh;

display:flex;

justify-content:center;

align-items:center;

background:#000;

color:red;

font-size:28px;

text-align:center;

padding:20px;

line-height:1.8;

">

🚫 تم فصلك كليًا من شات مرسال

</div>

`;

throw new Error(
"Blocked Device"
);

}

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

if(!messages){
return;
}

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

});

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

});

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

/* NORMAL BAN */

function banUser(){

socket.emit(
"ban user",
selectedUser.id
);

closeAll();

}

/* FULL DISCONNECT */

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

});

socket.on(

"banned users updated",

(list)=>{

renderBannedUsers(
list
);

});

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

${

ban.fullDisconnect

?

"⛔ فصل كلي"

:

"🚫 حظر"

}

<br><br>

👤 ${ban.username || "مستخدم"}

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

});

/* ENTER SEND */

});

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
