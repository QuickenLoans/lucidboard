var
  redisModule = require('redis'),
  _           = require('underscore'),
  client      = redisModule.createClient();


// I seem to get redis timeout errors after some time of server inactivity. Some forum guys
// said something like this worked for him to prevent it. (publish on 20-min interval.)
setInterval(function() { client.publish('_please_dont_drop_me', '1'); }, 1200000);


var publish = function(signal, payload, req) {
  var preserve = ['username'];

  if (_.isObject(payload) && !_.isArray(payload)) {
    var obj = {};

    preserve.forEach(function(x) { if (payload[x]) obj[x] = payload[x]; });

    Object.keys(payload.toJSON ? payload.toJSON() : payload).forEach(function(k) {
      obj[k] = payload[k];
    });

    if (req && req.socket) {
      obj.socketId = req.socket.id;
    }

    payload = obj;
  }

  var stringified = JSON.stringify(payload);
  console.log('publishing ' + signal, stringified);
  client.publish(signal, stringified);
};

module.exports = {
  boardCreated:      function(board, r)           { publish('board:create', board, r); },
  boardMoveCards:    function(boardId, info, r)   { publish('board:moveCards:' + boardId, info, r); },
  boardMoveColumns:  function(boardId, info, r)   { publish('board:moveColumns:' + boardId, info, r); },
  boardCombineCards: function(boardId, info, r)   { publish('board:combineCards:' + boardId, info, r); },
  boardCombinePiles: function(boardId, info, r)   { publish('board:combinePiles:' + boardId, info, r); },
  boardFlipCard:     function(boardId, cardId, r) { publish('board:flipCard:' + boardId, cardId, r); },

  columnCreated:     function(column, r)          { publish('column:create:' + column.board, column, r); },
  columnUpdated:     function(column, r)          { publish('column:update:' + column.board, column, r); },
  columnDeleted:     function(column, r)          { publish('column:delete:' + column.board, column.id, r); },

  cardCreated:       function(boardId, card, r)   { publish('card:create:' + boardId, card, r); },
  cardUpdated:       function(boardId, card, r)   { publish('card:update:' + boardId, card, r); },
  cardUpvote:        function(boardId, vote, r)   { publish('card:upvote:' + boardId, vote, r); },
  cardUnupvote:      function(boardId, vote, r)   { publish('card:unupvote:' + boardId, vote, r); },
  cardVaporize:      function(boardId, cardId, r) { publish('card:vaporize:' + boardId, cardId, r); },
  cardColor:         function(boardId, info, r)   { publish('card:color:' + boardId, info, r); },

  cardLock:          function(boardId, info, r)   { publish('card:lock:' + boardId, info, r); },
  cardUnlock:        function(boardId, info, r)   { publish('card:unlock:' + boardId, info, r); },

  boardDelete:       function(boardId, r) {
    publish('board:delete:' + boardId, true, r);
    publish('board:delete', boardId, r);
  },
  boardUpdated:      function(board, r) {
    publish('board:update:' + board.id, board, r);
    publish('board:update', board, r);
  },

  boardTimerStart: function(boardId, seconds, r) {
    publish('board:timerStart:' + boardId, {seconds: seconds}, r);
  },

  boardTimerPause: function(boardId, seconds, r) {
    publish('board:timerPause:' + boardId, {seconds: seconds}, r);
  },

  boardTimerReset: function(boardId, seconds, r) {
    publish('board:timerReset:' + boardId, {seconds: seconds}, r);
  },

  trashCardsAndDeleteColumn: function(boardId, columnId, r) {
    publish('board:trashCardsAndDeleteColumn:' + boardId, {columnId: columnId}, r);
  },

  socketOnConnection: function(session, socket) {
    // Create a new redis connection for the new websocket.
    socket.redis = redisModule.createClient();

    // Dumb hack so redis doesn't drop me
    var dropFix = setInterval(function() {
      client.publish('_please_dont_drop_me', '1');
    }, 1200000);

    // This is critical to clean up the redis connection when the
    // corresponding websocket closes.
    socket.on('disconnect', function() {
      clearInterval(dropFix);
      socket.redis.quit();
    });

    // When a redis event comes in that the client has subscribed to,
    // forward it along over the websocket.
    socket.redis.on('message', function(channel, message) {
      message = JSON.parse(message);

      // If the message included a socketId key, replace it with a 'you' key.
      // This will be true for the socket belonging to the defined socketId
      // and false otherwise.
      if (message.socketId) {
        message.you = message.socketId === socket.id;
        delete message.socketId;
      }

      // console.log('redis->socket[' + socket.handshake.sessionID + '] ' +
      console.log('redis->socket[' + socket.id + '] ' + channel +
        ':', JSON.stringify(message));

      socket.emit(channel, message);
    });
  },
};
