var async = require('async'),
    meta  = require('./meta'),
    redis = require('./redis');

// Organize cards into slots. That means that
//
//   [{..., position: 1}, {..., position: 1}, {..., position: 2}]
//
// will become
//
//   [[{..., position: 1}, {..., position: 1}], {..., position: 2}]
var normalizeCardStack = function(stack) {
  var buffer = [], ret = [];

  stack.forEach(function(card) {
    if (buffer.length && card.position !== buffer[0].position) {
      ret.push(buffer);
      buffer = [];
    }
    buffer.push(card);
  });

  if (buffer.length) ret.push(buffer);

  return ret;
};

// Splice out and return an item being dragged from the stack
var spliceItem = function(stack, id) {
  var item;

  for (var x=0; x<stack.length; x++) {
    for (var y=0; y<stack[x].length; y++) {
      if (stack[x][y].id == id) {
        item = stack[x].splice(y, 1)[0];
        break;
      }
    }
    if (item) {
      // splice out the empty array if we took the only card from the slot
      if (!stack[x].length) stack.splice(x, 1);
      break;
    }
  }

  return item;
};

// This function takes a multidimentional array of cards and returns the
// representation that we will use to sync up our clients. So,
//
//   [[{id: 1, position: 1}, {id: 2, position: 1}], {id: 3, position: 2}]
//
// will become
//
//   [[1, 2], [3]]
var toCardStackMap = function(stack) {
  var ret = [];
  stack.forEach(function(slot) { ret.push(_.pluck(slot, 'id')); });
  return ret;
};

// Fix position settings for all cards in the collection.
// Return an array of jobs to save all updated cards.
var fixCardPositions = function(stack, origMap) {
  var i, j, jobs = [];

  for (i=0; i<stack.length; i++) {
    for (j=0; j<stack[i].length; j++) {
      if (!origMap[i] || !origMap[i][j] || origMap[i][j] !== stack[i][j].id) {
        (function() {
          var toSave = stack[i][j];
          toSave.position = i + 1;
          jobs.push(function(cb) { toSave.save(cb); });
        })();
      }
    }
  }

  return jobs;
};

// Fix position settings for all columns in the collection.
// Return an array of jobs to save all updated columns.
var fixColumnPositions = function(stack, origMap) {
  var i, j, jobs = [];

  for (i=0; i<stack.length; i++) {
    if (!origMap[i] || origMap[i] !== stack[i].id) {
      (function() {
        var toSave = stack[i];
        toSave.position = i;
        jobs.push(function(cb) { toSave.save(cb); });
      })();
    }
  }

  return jobs;
};

var sortByKey = function(items, key) {
  items.sort(function (a, b) {
    if (a[key] > b[key]) {
      return 1;
    }
    if (a[key] < b[key]) {
      return -1;
    }
    return 0;
  });

  return items;
}


// If there is no board passed to the callback, you can assume we've already handled res.
var boardIsLegitAndOwnedBy = function(id, req, res, cb) {
  Board.findOneById(id).exec(function(err, board) {
    var failed = false;

    if (err)                                { res.serverError(err); failed = true; }
    else if (!board)                        { res.notFound();       failed = true; }
    else if (board.creator !== req.user.id &&
             !req.user.admin)               { res.forbidden();      failed = true; }

    cb(failed ? null : board);
  });
};

// If the callback gets null, you can assume we've already handled res.
var getCardAndBoard = function(cardId, boardId, res, cb) {
  async.auto({
    board:  function(_cb) { Board.findOneById(boardId).exec(_cb); },
    card:   function(_cb) { Card.findOneById(cardId).exec(_cb); },
    column: ['card', function(_cb, r) {
      if (!r.card) return _cb();
      Column.findOneById(r.card.column).exec(_cb);
    }]
  }, function(err, r) {
    var failed = false;

    if (err) {
      if (res) res.serverError(err);
      failed = true;
    } else if (!r.card || !r.column || !r.board) {
      if (res) res.notFound();
      failed = true;
    } else if (r.card.column !== r.column.id) {
      if (res) res.notFound();
      failed = true;
    } else if (r.column.board !== r.board.id) {
      if (res) res.notFound();
      failed = true;
    }

    cb(failed ? null : r);
  });
};

var randomString = function(length, possible) {
  var ret      = '',
      possible = possible || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      i;

  for (i=0; i<length; i++) {
    ret += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return ret;
};

var fixShortid = function(slug) {
  return (String(slug).match(/^([^-]+)-?/))[1];
};

var vaporize = function(cardId, boardId, cb) {

  getCardAndBoard(cardId, boardId, null, function(r) {
    if (!r) return cb(null, null);

    Card.find({column: r.column.id}).sort({position: 'asc'}).exec(function(err, cards) {

      var stack       = normalizeCardStack(cards),
          originalMap = toCardStackMap(stack),
          card        = spliceItem(stack, cardId),
          jobs        = fixCardPositions(stack, originalMap);

      jobs.push(function(cb) { Card.destroy({id: cardId}).exec(cb); });

      async.parallel(jobs, function(err, results) {
        if (err) return cb(err);

        var signalData = {};
        signalData[r.column.id]         = toCardStackMap(stack)
        signalData['suppressAnimation'] = true;

        meta.releaseCardLock(boardId, cardId, true);

        redis.cardVaporize(boardId, {
          cardId:         cardId,
          signalData:     signalData,
        });

        if (cb) cb(null, results);
      });
    });
  })
};

var nativeFind = function(type, id, cb) {
  // TODO: is there a cleaner way to get to native()?
  Column.native(function(err, connection) {
    if (err) {
      console.log('Error!');
    } else {
      connection.get('waterline:' + type + ':id:' + id, function(err, value) {
        cb(err, JSON.parse(value)); 
      });
    }
  });
};

// NOTE: Not used currently
var nativeScan = function (cb) {
  function scan(start) {
    connection.scan(start, function (err, result) {
      var cursor = parseInt(result[0]), keys = result[1];
      cb(keys);

      if (cursor === 0) {
        return;
      }

      scan(cursor);
    });
  }

  scan(0);
};

var nativeFindStack = function(columnId, cb) {
  Column.native(function(err, connection) {
    if (err) {
      console.log('Error!');
      return;
    }

    connection.keys('waterline:card:id:*', function(err, results) {
      var stack = [];

      results.forEach(function (key, index) {
        connection.get(key, function(err, result) {
          var obj = JSON.parse(result);
          if (obj.column === columnId) {
            stack.push(obj);
          }

          if (index === results.length - 1) { 
            cb(err, stack);
          }
        });
      });
    });
  });
};

var nativeSaveStacks = function(stacks, cb) {
  if (!stacks || !stacks.length) {
    cb();
    return;
  }
 
  Column.native(function(err, connection) {
    if (err) {
      console.log('Error!');
      return;
    }

    stacks.forEach(function(stack, stacksIndex) {
      stack.forEach(function(card, stackIndex) {
        nativeSet('card', card.id, card, function (err, result) {
          if (stackIndex === stack.length - 1 && stacksIndex === stacks.length - 1) {
            cb(err);
          }
        }); 
      });
    });
  });
};

var nativeSet = function(type, id, value, cb) {
  Column.native(function(err, connection) {
    if (err) {
      console.log('Error!');
    } else {
      connection.set('waterline:' + type + ':id:' + id, JSON.stringify(value), cb); 
    }
  });
};

// Fix position settings for all cards in the collection.
var fixCardPositions2 = function(stack, origMap) {
  var i, j, jobs = [];

  for (i=0; i<stack.length; i++) {
    for (j=0; j<stack[i].length; j++) {
      if (!origMap[i] || !origMap[i][j] || origMap[i][j] !== stack[i][j].id) {
        (function() {
          var toSave = stack[i][j];
          toSave.position = i + 1;
        })();
      }
    }
  }

  return jobs;
};


module.exports = {
  normalizeCardStack:     normalizeCardStack,
  spliceItem:             spliceItem,
  toCardStackMap:         toCardStackMap,
  fixCardPositions:       fixCardPositions,
  fixCardPositions2:      fixCardPositions2, 
  fixColumnPositions:     fixColumnPositions,
  boardIsLegitAndOwnedBy: boardIsLegitAndOwnedBy,
  getCardAndBoard:        getCardAndBoard,
  randomString:           randomString,
  fixShortid:             fixShortid,
  vaporize:               vaporize,
  nativeSet:              nativeSet,
  nativeFind:             nativeFind,
  nativeFindStack:        nativeFindStack,
  nativeSaveStacks:       nativeSaveStacks,
  sortByKey:              sortByKey
};
