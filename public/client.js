const socket = io();

const form=document.getElementById('form');
const messageInp=document.getElementById("msginp");
const container = document.querySelector('.chat-container');
var audio=new Audio('/ting.wav');

const append = (message,position)=>{
    const msgEle=document.createElement('div');
    msgEle.innerText=message;
    msgEle.classList.add('message');
    msgEle.classList.add(position);
    container.append(msgEle);
    // if(position != 'right'){
    //  audio.play();
    // }
    if(position != 'right')
    audio.play();
}

form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const msg=msginp.value;
    append(`You : ${msg}`,'right');
    socket.emit('send',msg);
    msginp.value="";
})

const user = prompt("Enter your good name");
alert(`${user} joined the chat`);
socket.emit('new-user-joined',user);

socket.on('user-joined',user =>{
  append(`${user} joined the chat`,'middle');
});

socket.on('recieve',data =>{
    console.log(`${data.name} : ${data.message}`);
   append(`${data.name} : ${data.message}`,'left');
});

socket.on('left',user=>{
    console.log(user+" left the chat");
    append(`${user} left the chat`,'middle');
});