const socket = io({

transports:[
"websocket",
"polling"
],

reconnection:true,

reconnectionAttempts:999999,

reconnectionDelay:1000,

timeout:20000

});

/* USER */

let currentUser = null;

let currentColor = "#ffd700";

let privateNotifications = 0;

let openedPrivateUser = null;

let onlineUsersData = [];

/* ELEMENTS */

const loginPage =
document.getElementById(
"loginPage"
);

const chatPage =
document.getElementById(
"chatPage"
);

const usernameInput =
document.getElementById(
"username"
);

const adminPasswordInput =
document.getElementById(
"adminPassword"
);

const messageInput =
document.getElementById(
"messageInput"
);

const messages =
document.getElementById(
"messages"
);

const usersList =
document.getElementById(
"usersList"
);

const privateBadge =
document.getElementById(
"privateBadge"
);

/* DEVICE TOKEN */

let deviceToken = localStorage.getItem(
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

/* ADMIN NAMES */

let protectedNames = [

"Admin",

"Owner",

"Moderator"

];

/* LOAD ADMINS */

fetch("/admins.json")

.then(res=>res.json())

.then(data=>{

protectedNames = data.map(
a=>a.name
);

})

.catch(()=>{

console.log(
"admins.json not loaded"
);

});

/* SHOW ADMIN PASSWORD */

usernameInput.addEventListener(

"input",

()=>{

const value =
usernameInput.value
.trim()
.toLowerCase();

const isProtected =

protectedNames.some(

name=>

name.toLowerCase()

===

value

);

if(isProtected){

adminPasswordInput.style.display =
"block";

}else{

adminPasswordInput.style.display =
"none";

adminPasswordInput.value = "";

}

});

/* JOIN */

function joinChat(){

const username =
usernameInput.value.trim();

const adminPassword =
adminPasswordInput.value.trim();

if(!username){

alert(
"اكتب الاسم"
);

return;

}

currentUser = username;

socket.emit(

"join",

{

username,

adminPassword,

color:currentColor,

deviceToken,

browser:
navigator.userAgent,

device:
navigator.platform

}

);

}

/* LOGIN SUCCESS */

socket.on(

"login success",

()=>{

loginPage.style.display =
"none";

chatPage.style.display =
"flex";

});

/* LOGIN FAILED */

socket.on(

"banned",

(message)=>{

alert(message);

});

/* FULL BAN */

socket.on(

"full device banned",

(message)=>{

alert(message);

localStorage.clear();

});

/* SEND MESSAGE */

function sendMessage(){

const text =
messageInput.value.trim();

if(!text){
return;
}

socket.emit(

"chat message",

{

message:text

}

);

messageInput.value = "";

}

/* ENTER */

messageInput.addEventListener(

"keypress",

(e)=>{

if(e.key === "Enter"){

sendMessage();

}

});

/* CHAT MESSAGE */

socket.on(

"chat message",

(data)=>{

const div =
document.createElement("div");

div.className =
"message";

/* MY MESSAGE */

if(data.username === currentUser){

div.classList.add(
"my-message"
);

}

/* SYSTEM */

if(data.username === "System"){

div.classList.add(
"system-message"
);

}

/* BADGES */

let rankHtml = "";

if(data.rank === "Admin"){

rankHtml =
`<span class="rank admin-rank">👑</span>`;

}

if(data.rank === "Owner"){

rankHtml =
`<span class="rank owner-rank">⭐</span>`;

}

if(data.rank === "Moderator"){

rankHtml =
`<span class="rank mod-rank">🛡️</span>`;

}

/* HTML */

div.innerHTML = `

<div class="
message-user
">

${rankHtml}

<span style="
color:${data.color};
font-weight:bold;
">

${data.username}

</span>

</div>

<div class="message-text">

${data.message}

</div>

`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

});

/* ONLINE USERS */

socket.on(

"online users",

(users)=>{

onlineUsersData = users;

usersList.innerHTML = "";

users.forEach(user=>{

/* SKIP MYSELF */

if(user.username === currentUser){
return;
}

const div =
document.createElement("div");

div.className =
"user-item";

/* BADGES */

let badge = "";

if(user.rank === "Admin"){

badge = "👑";

}

if(user.rank === "Owner"){

badge = "⭐";

}

if(user.rank === "Moderator"){

badge = "🛡️";

}

/* USER */

div.innerHTML = `

<div class="user-row">

<span onclick="
openPrivateChat(
'${user.id}',
'${user.username}'
)
">

${badge}
${user.username}

</span>

</div>

`;

usersList.appendChild(div);

});

});

/* OPEN PRIVATE */

function openPrivateChat(id,username){

if(!id){
return;
}

openedPrivateUser = id;

const box =

document.getElementById(
"privateChatBox"
);

box.style.display =
"flex";

document
.getElementById(
"privateChatTitle"
)
.innerText =
`📩 ${username}`;

privateNotifications = 0;

updatePrivateBadge();

}

/* CLOSE PRIVATE */

function closePrivateChat(){

document
.getElementById(
"privateChatBox"
)
.style.display =
"none";

}

/* SEND PRIVATE */

function sendPrivateMessage(){

const input =

document.getElementById(
"privateMessageInput"
);

const text =
input.value.trim();

if(!text){
return;
}

if(!openedPrivateUser){

alert(
"افتح محادثة خاصة"
);

return;

}

socket.emit(

"private message",

{

to:openedPrivateUser,

from:currentUser,

message:text

}

);

addPrivateMessage(
currentUser,
text,
true
);

input.value = "";

}

/* RECEIVE PRIVATE */

socket.on(

"private message",

(data)=>{

addPrivateMessage(
data.from,
data.message,
false
);

privateNotifications++;

updatePrivateBadge();

});

/* ADD PRIVATE */

function addPrivateMessage(from,msg,mine){

const box =
document.getElementById(
"privateMessages"
);

const div =
document.createElement("div");

div.className =

mine

?

"private-me"

:

"private-other";

div.innerHTML = `

<b>${from}</b>

<br>

${msg}

`;

box.appendChild(div);

box.scrollTop =
box.scrollHeight;

}

/* PRIVATE BADGE */

function updatePrivateBadge(){

if(!privateBadge){
return;
}

if(privateNotifications <= 0){

privateBadge.style.display =
"none";

return;

}

privateBadge.style.display =
"flex";

privateBadge.innerText =
privateNotifications;

}

/* CLEAR CHAT */

socket.on(

"clear messages",

()=>{

messages.innerHTML = "";

});

/* COLORS */

function selectColor(color){

currentColor = color;

document
.querySelectorAll(".color-option")
.forEach(el=>{

el.classList.remove(
"active-color"
);

});

document
.querySelector(
`[data-color="${color}"]`
)
?.classList.add(
"active-color"
);

}

/* OPEN MENU */

function openMenu(id){

const el =

document.getElementById(id);

if(!el){
return;
}

el.style.display =
"flex";

}

/* CLOSE MENU */

function closeMenu(id){

const el =

document.getElementById(id);

if(!el){
return;
}

el.style.display =
"none";

}

/* CONNECTION */

socket.on(

"connect",

()=>{

console.log(
"✅ Connected"
);

});

/* RECONNECT */

socket.on(

"reconnect",

()=>{

console.log(
"♻️ Reconnected"
);

});

/* DISCONNECT */

socket.on(

"disconnect",

()=>{

console.log(
"❌ Disconnected"
);

});

/* KEEP ALIVE */

setInterval(()=>{

socket.emit(
"ping alive"
);

},20000);

/* PONG */

socket.on(

"pong alive",

()=>{

console.log(
"🏓 pong"
);

});

/* AUTO SCROLL */

setInterval(()=>{

messages.scrollTop =
messages.scrollHeight;

},1000);
