// This file manages metadata related to the operation of Lucidboard. This is data that we
// want to track for the running instance of the application, but do not want to store
// in the database.
//

var redis = require('./redis');


// Card locks. Keys are board id's, vals are objects:
//
//   {
//     cardIds:   [29, 4, ...],
//     userIds:   [1, 5, ...],
//     usernames: ['bob', 'jill', ...],
//     socketIds: ['I503McxLPTXkykeJAAAC', 'WEuvfuy49_-HS8uYAAAB' ...]
//   }
//
// These sub-arrays should have the same number of elements with their indexes matching
// up as a single record. That means a given index should be push()ed and splice()d for
// each array.
var cardLocks = {};

var boardHasCardIdLocked = function(boardId, cardId) {
  return cardLocks[boardId]['cardIds'].indexOf(cardId) !== -1;
};

var boardHasALockByUserId = function(boardId, userId) {
  return cardLocks[boardId]['userIds'].indexOf(userId) !== -1;
};

var createBoardEntryIfNew = function(boardId) {
  if (boardId in cardLocks) return;
  cardLocks[boardId] = {
    cardIds:   [],
    userIds:   [],
    usernames: [],
    socketIds: []
  };
};

var boardHasCardLockedByUserId = function(boardId, cardId, userId) {
  var idx = cardLocks[boardId]['cardIds'].indexOf(cardId);

  if (idx === -1)                                    return false;
  if (cardLocks[boardId]['userIds'][idx] !== userId) return false;

  return true;
};

var doUnlockSplices = function(boardId, idx) {
  cardLocks[boardId]['cardIds'].splice(idx, 1);
  cardLocks[boardId]['userIds'].splice(idx, 1);
  cardLocks[boardId]['usernames'].splice(idx, 1);
  cardLocks[boardId]['socketIds'].splice(idx, 1);
};

var getCardLock = function(boardId, cardId, req) {  // true if a lock was successfully obtained
  createBoardEntryIfNew(boardId);

  if (boardHasCardIdLocked(boardId, cardId))       return false;
  if (boardHasALockByUserId(boardId, req.user.id)) return false;

  // Lock it !
  cardLocks[boardId]['cardIds'].push(cardId);
  cardLocks[boardId]['userIds'].push(req.user.id);
  cardLocks[boardId]['usernames'].push(req.user.name);
  cardLocks[boardId]['socketIds'].push(req.socket ? req.socket.id : null);

  redis.cardLock(boardId, {id: cardId, username: req.user.name}, req);

  return true;
};

var releaseCardLock = function(boardId, cardId, req) {   // true if the lock was successfully released
  createBoardEntryIfNew(boardId);

  // Check that the user actually has a lock on this card.
  if (!boardHasCardLockedByUserId(boardId, cardId, req.user.id)) return false;

  var idx = cardLocks[boardId]['cardIds'].indexOf(cardId);

  doUnlockSplices(boardId, idx);

  redis.cardUnlock(boardId, {id: cardId}, req);

  return true;
};

var cardLockedByWhichIdx = function(boardId, cardId) {
  if (!cardLocks[boardId]) return null;

  var idx = cardLocks[boardId]['cardIds'].indexOf(cardId);

  return idx === -1 ? null : idx;
};

var cardLockedByWhichUserId = function(boardId, cardId) {
  var idx = cardLockedByWhichIdx(boardId, cardId);
  if (idx === null) return null;
  return cardLocks[boardId]['userIds'][idx];
};

var cardLockedByWhichUsername = function(boardId, cardId) {
  var idx = cardLockedByWhichIdx(boardId, cardId);
  if (idx === null) return null;
  return cardLocks[boardId]['usernames'][idx];
};


// true if someone other than the provided request's user has a lock on the card.
var cardLockedBySomeoneElse = function(boardId, cardId, req) {
  var actualUserId = cardLockedByWhichUserId(boardId, cardId);

  return actualUserId && actualUserId !== req.user.id;
};

var unlockAllViaSocketId = function(socketId) {
  var idx;
  Object.keys(cardLocks).forEach(function(boardId) {
    while ((idx = cardLocks[boardId]['socketIds'].indexOf(socketId)) !== -1) {
      redis.cardUnlock(boardId, {id: cardLocks[boardId]['cardIds'][idx]});
      doUnlockSplices(boardId, idx);
    }
  });
};


module.exports = {
  getCardLock:               getCardLock,
  releaseCardLock:           releaseCardLock,
  cardLockedByWhichUserId:   cardLockedByWhichUserId,
  cardLockedByWhichUsername: cardLockedByWhichUsername,
  cardLockedBySomeoneElse:   cardLockedBySomeoneElse,
  unlockAllViaSocketId:      unlockAllViaSocketId
};
