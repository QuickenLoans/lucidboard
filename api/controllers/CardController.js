var async = require('async'),
    _     = require('underscore'),
    util  = require('../services/util'),
    redis = require('../services/redis'),
    meta  = require('../services/meta');

var getNextCardPosition = function(columnId, cb) {
  Column.findOne({id: columnId}).populate('cards').exec(function(err, column) {
    if (err) return cb(err);

    var max = 0;

    column.cards.forEach(function(c) {
      if (c.position > max) max = c.position;
    });

    cb(null, max + 1);
  });
};

module.exports = {

  create: function(req, res) {
    var user     = req.user,
        boardId  = parseInt(req.param('boardId')),
        columnId = parseInt(req.param('columnId')),
        content  = (req.body.content || '');

    if (!boardId || !columnId) return res.badRequest();

    async.auto({
      board:  function(cb) { Board.findOneById(boardId).exec(cb); },
      column: function(cb) { Column.findOneById(columnId).exec(cb); }
    }, function(err, r) {
      if (err)                           return res.serverError(err);
      if (r.column.board !== r.board.id) return res.notFound();

      getNextCardPosition(columnId, function(err, nextpos) {
        if (err) return res.serverError(err);

        var attributes = {
          creator:  user.id,
          content:  content,
          position: nextpos,
          column:   columnId
        };

        Card.create(attributes, function(err, card) {
          if (err) return res.serverError(err);

          res.jsonx(card);

          redis.cardCreated(boardId, card, req);
        });
      });
    });
  },

  update: function(req, res) {
    var boardId  = parseInt(req.param('boardId')),
        columnId = parseInt(req.param('columnId')),
        cardId   = parseInt(req.param('cardId')),
        content  = (req.body.content || '').trim(),
        bits;

    if (!boardId || !columnId || !cardId) {
      return res.badRequest();
    } else if (meta.cardLockedBySomeoneElse(boardId, cardId, req)) {
      return req.forbidden('Card is locked by another user.');
    }

    bits = {
      content: content
    };

    async.auto({
      board:  function(cb) { Board.findOneById(boardId).exec(cb); },
      column: function(cb) { Column.findOneById(columnId).exec(cb); },
      stack:  function(cb) { Card.find({column: columnId}).sort({position: 'asc'}).exec(cb); }
    }, function(err, r) {
      if (err)                           return res.serverError(err);
      if (r.column.board !== r.board.id) return res.notFound();

      // If the card is in the trash and it is going to be empty, delete it!
      if (r.column.position === 0 && !content) {

        var stack       = util.normalizeCardStack(r.stack),
            originalMap = util.toCardStackMap(stack),
            jobs        = util.fixCardPositions(stack, originalMap);

        jobs.push(function(cb) { Card.destroy({id: cardId}).exec(cb); });

        async.parallel(jobs, function(err, results) {
          if (err) return res.serverError(err);

          meta.releaseCardLock(boardId, cardId);

          res.jsonx(null);

          redis.cardVaporize(boardId, cardId, req);
        });

      } else {  // Normal card update...

        var criteria = {id: cardId, column: r.column.id};

        Card.update(criteria, bits).populate('votes').exec(function(err, card) {
          if (err) return res.serverError(err);

          meta.releaseCardLock(boardId, cardId, req);

          res.jsonx(card[0]);

          redis.cardUpdated(boardId, card[0], req);
        });
      }

    })
  },

  upvote: function(req, res) {
    var user     = req.user,
        boardId  = parseInt(req.param('boardId')),
        columnId = parseInt(req.param('columnId')),
        cardId   = parseInt(req.param('cardId'));

    if (!boardId || !columnId || !cardId) return res.badRequest();

    Board.loadFullById(boardId, function(err, board) {
      if (err) return res.serverError(err);

      // Make sure the columnId exists in the board.
      if (_.pluck(board.columns, 'id').indexOf(columnId) === -1) {
        return res.notFound();
      }

      // Make sure they have votes left.
      var cardExistsOnBoard = false,
          cool              = false;

      if (board.votesPerUser === -1) {  // no vote limit
        cool = true;

      } else {
        var votesRemaining = board.votesPerUser;

        board.columns.forEach(function(column) {
          column.cards.forEach(function(card) {
            card.votes.forEach(function(v) {
              if (v.user === user.id) votesRemaining--;
            });
            if (card.id === cardId) cardExistsOnBoard = true;
          });
        });

        cool = votesRemaining > 0;
      }

      if (!cardExistsOnBoard) return res.notFound();
      if (!cool)              return res.forbidden("You're out of votes!");

      Card.findOneById(cardId).populate('votes').exec(function(err, card) {
        if (err)   return res.serverError(err);
        if (!card) return res.badRequest('Card does not exist!');  // not super possible heh

        Vote.create({user: user.id, card: card.id}, function(err, vote) {
          if (err) return res.serverError(res);

          res.jsonx(vote);

          redis.cardUpvote(boardId, vote);
        });
      });
    });
  },

  lock: function(req, res) {
    var boardId = parseInt(req.param('id')),
        cardId  = parseInt(req.param('cardId'));

    if (!boardId || !cardId) return res.badRequest();

    util.getCardAndBoard(cardId, boardId, req, res, function(r) {
      if (!r) return;

      var gotLock = meta.getCardLock(boardId, cardId, req);

      if (!gotLock) return res.jsonx(false);  // srybro, card is already locked !

      res.jsonx(true);
    });
  },

  unlock: function(req, res) {
    var boardId = parseInt(req.param('id')),
        cardId  = parseInt(req.param('cardId'));

    if (!boardId || !cardId) return res.badRequest();

    util.getCardAndBoard(cardId, boardId, req, res, function(r) {
      if (!r) return;

      var successfulRelease = meta.releaseCardLock(boardId, cardId, req);

      if (!successfulRelease) return res.jsonx(false);

      res.jsonx(true);
    });
  },

  color: function(req, res) {
    var boardId  = parseInt(req.param('boardId')),
        columnId = parseInt(req.param('columnId')),
        cardId   = parseInt(req.param('cardId')),
        color    = req.body.color;

    if (!boardId || !columnId || !cardId || !color) return res.badRequest();

    async.auto({
      board:  function(cb) { Board.findOneById(boardId).exec(cb); },
      column: function(cb) { Column.findOne({id: columnId, board: boardId}).exec(cb); },
      card:   function(cb) { Card.findOne({id: cardId, column: columnId}).exec(cb); }
    }, function(err, r) {
      if (err)                              return res.serverError(err);
      if (!r.board || !r.column || !r.card) return res.notFound('a');
      if (r.column.board !== r.board.id)    return res.notFound('b');
      if (r.card.column !== r.column.id)    return res.notFound('c');

      r.card.color = color;

      r.card.save(function(err, c) {
        if (err) return res.serverError(err);

        res.jsonx(c);

        redis.cardColor(boardId, {id: cardId, color: color});
      });
    });

  }

};

