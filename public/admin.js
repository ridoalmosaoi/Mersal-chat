const socket = io();

let adminLogged = false;

/* LOGIN */

function loginAdmin(){

const name =

document
.getElementById(
"adminName"
)
.value
.trim();

const password =

document
.getElementById(
"adminPassword"
)
.value
.trim();

if(!name || !password){

alert(
"املأ المعلومات"
);

return;

}

socket.emit(

"admin panel login",

{

name:name,

password:password

}

);

}

/* SUCCESS */

socket.on(

"admin login success",

()=>{

adminLogged = true;

document
.getElementById(
"adminLogin"
)
.style.display =
"none";

document
.getElementById(
"adminPanel"
)
.style.display =
"block";

alert(
"✅ تم تسجيل الدخول"
);

});

/* FAILED */

socket.on(

"admin login failed",

()=>{

alert(
"❌ معلومات خاطئة"
);

});
