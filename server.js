const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

const PORT = 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

class GameLogic {
  constructor() {
      this.turn_common = 1;
      this.min = 0;
      this.max = 35;
      this.bomb1 = 0;
      this.bomb2 = 0;
      this.splash = 0;
      this.size = 36;
      this.initialValue = -1;
      this.matrix = [];
      this.queue = [];
      this.layer = 0;

  }

  initialize() {
      console.log("game logic started");

      this.bomb1 = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
      this.bomb2 = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
      this.splash = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;

      while (this.bomb1 === this.bomb2) {
          console.log("working on bomb2", this.bomb2, this.bomb1);
          this.bomb2 = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
      }

      while (this.splash === this.bomb1 || this.splash === this.bomb2) {
          this.splash = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
      }

      console.log("first bomb: ", this.bomb1);
      console.log("second bomb: ", this.bomb2);
      console.log("splash: ", this.splash);

      this.matrix = new Array(this.size).fill(this.initialValue);

      this.queue.push(this.bomb1);
      this.queue.push(this.bomb2);
      this.queue.push(this.splash);
      this.queue.push(-1);
      this.layer = 0;

      while (this.queue.length !== 0) {
          const curr = this.queue.shift();
          if (curr === -1) {
              if (this.queue.length > 0) {
                  this.queue.push(-1);
                  this.layer++;
              }
              continue;
          }

          if (this.matrix[curr] === -1) {
              this.matrix[curr] = this.layer;
              if (curr + 1 >= 0 && curr + 1 < this.size && curr % 6 !== 5 && this.matrix[curr + 1] === -1) {
                  this.queue.push(curr + 1);
              }
              if (curr - 1 >= 0 && curr - 1 < this.size && curr % 6 !== 0 && this.matrix[curr - 1] === -1) {
                  this.queue.push(curr - 1);
              }
              if (curr + 6 >= 0 && curr + 6 < this.size && this.matrix[curr + 6] === -1) {
                  this.queue.push(curr + 6);
              }
              if (curr - 6 >= 0 && curr - 6 < this.size && this.matrix[curr - 6] === -1) {
                  this.queue.push(curr - 6);
              }
          }
      }
  }
}

const roomCommonVariables = {};



io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('joinRoom', (roomNumber) => {
    const exists = io.sockets.adapter.rooms.has(roomNumber);
    if(exists == false){
      socket.join(roomNumber);
      io.to(socket.id).emit("roomjoin-successful","1");
    }else{
      const numClients = io.sockets.adapter.rooms.get(roomNumber).size;
      console.log(numClients);
      if(numClients >= 2){
        io.to(socket.id).emit("roomjoin-failed");
      }else{
        socket.join(roomNumber);
        io.to(socket.id).emit("roomjoin-successful","2");
        io.to(roomNumber).emit("startgame");
      }
    }
    socket.on("leave-room", () => {
        socket.leave(roomNumber);
        console.log('A user disconnected from roomno: ',roomNumber);
    });
    socket.on('disconnect', () => {
        console.log('A user disconnected from roomno: ',roomNumber);
        io.to(roomNumber).emit('oppdisconnect');
        socket.leave(roomNumber);
        delete roomCommonVariables[roomNumber];
      });
    socket.on('chatMessage', (data) => {
        console.log("message recieved to server, message: ",data);
        console.log("message from: ",socket.id);
        io.to(roomNumber).emit('message', data,socket.id);
    });
    socket.on('gamestart-successful',(player_no) => {
        console.log("game logic started");
        let dataForRoom;
        if(player_no == 1){
          roomCommonVariables[roomNumber] = new GameLogic();
          roomCommonVariables[roomNumber].initialize();
        }
        dataForRoom = roomCommonVariables[roomNumber];
        console.log(dataForRoom);
        socket.on('tile-clicked',(index,player_no) => {
            //check turn
            console.log("tile clicked recieved in",index);
            if(player_no !== dataForRoom.turn_common){
              console.log("turn rejected",dataForRoom.turn_common,dataForRoom.player_no);
              return;
            }
            //emit what kind of bomb is present there 0 - for none 1 - for bomb 2 - for splash
            if(index === dataForRoom.bomb1 || index === dataForRoom.bomb2){
              io.to(roomNumber).emit("turn-used",player_no,index,1,dataForRoom.matrix[index]);//player_no,index,type of bomb,shortest distance
            }
            else if(index === dataForRoom.splash){
              io.to(roomNumber).emit("turn-used",player_no,index,2,dataForRoom.matrix[index]);
            }
            else{
              io.to(roomNumber).emit("turn-used",player_no,index,0,dataForRoom.matrix[index]);
            }
            if(dataForRoom.turn_common == 1){
              dataForRoom.turn_common = 2;
            }
            else{
              dataForRoom.turn_common = 1;
            }
        });
        socket.on('game-end-state-initiated',() => {
          console.log("game end recieved");
          socket.emit("game-end-frontend");
          //delete room variables
          if (io.sockets.adapter.rooms.get(roomNumber).size == 1 && roomCommonVariables.hasOwnProperty(roomNumber)) {
            // Delete the common variable details for the specified room number
            delete roomCommonVariables[roomNumber];
          }
          socket.leave(roomNumber);
        })
    })
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});