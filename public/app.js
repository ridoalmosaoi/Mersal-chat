const socket = io();

/* VARIABLES */

let currentUser=null;

let currentColor="#ffd700";

let currentPrivateUser=null;

let privateCount=0;

let protectedNames=[];

/* ELEMENTS */

const loginPage=
document.getElementById(
"loginPage"
);

const chatPage=
document.getElementById(
"chatPage"
);

const username=
document.getElementById(
"username"
);

const adminPassword=
document.getElementById(
"adminPassword"
);

const messages=
document.getElementById(
"messages"
);

const usersList=
document.getElementById(
"usersList"
);

/* LOAD ADMINS */

fetch("/admins.json")

.then(res=>res.json())

.then(data=>{

protectedNames=
data.map(
a=>a.name.toLowerCase()
);

})

.catch(()=>{});

/* SHOW ADMIN PASSWORD */

username.addEventListener(

"input",

()=>{

const name=

username.value
.trim()
.toLowerCase();

if(

protectedNames.includes(
name
)

){

adminPassword.style.display=
"block";

}
else{

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
currentColor

}

);

}

/* SUCCESS */

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

/* SEND MESSAGE */

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

message:text

}

);

input.value="";

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

/* RECEIVE MESSAGE */

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

if(

data.username==="System"

){

div.classList.add(
"system-message"
);

}

div.innerHTML=`

<div class=
"message-user"

style=
"color:${data.color}"

>

${data.username}

</div>

<div class=
"message-text"

>

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

div.innerHTML=`

<div class=
"user-row"
>

${user.username}

</div>

`;

div.onclick=()=>{

openPrivate(
user.id,
user.username
);

};

usersList.appendChild(
div
);

});

});

/* USERS MENU */

function openUsers(){

document

.getElementById(
"usersMenu"
)

.style.display=
"flex";

}

function closeUsers(){

document

.getElementById(
"usersMenu"
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

innerText=

"📩 "+name;

document

.getElementById(
"privateChatBox"
)

.style.display=
"flex";

}

function closePrivate(){

document

.getElementById(
"privateChatBox"
)

.style.display=
"none";

}

function openPrivateList(){

if(

!currentPrivateUser

){

alert(

"اختر عضو من المتواجدين 👥"

);

return;

}

document

.getElementById(
"privateChatBox"
)

.style.display=
"flex";

}

/* SEND PRIVATE */

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

message:
text,

from:
currentUser

}

);

input.value="";

}
