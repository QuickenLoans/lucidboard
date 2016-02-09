var async   = require('async'),
    _       = require('underscore'),
    redis   = require('../services/redis'),
    util    = require('../services/util'),
    config  = require('../services/config');

module.exports = {

  getList: function(req, res) {
    var criteria = {},
        user     = req.user;

    // Make sure the user can always see their own private boards.
    if (!user.admin) {
      criteria = {or: [
        {private: false},
        {private: true, creator: user.id}
      ]};
    }

    Board.getList(criteria, function(err, boards) {
      if (err) return res.serverError(err);
      res.jsonx(boards);
    });
  },

  findByShortid: function(req, res) {
    var shortid = req.param('shortid');

    Board.loadFullByShortid(shortid, function(err, board) {
      if (err)             return res.serverError(err);
      if (board === false) return res.notFound();

      res.jsonx(board);
    });
  },

  create: function(req, res) {
    var bits = {
      creator:        req.user.id,
      colsetId:       parseInt(req.body.colsetId),
      title:          req.body.title,
      votesPerUser:   parseInt(req.body.votesPerUser),
      p_seeVotes:     req.body.p_seeVotes,
      p_seeContent:   req.body.p_seeContent,
      p_lock:         req.body.p_lock,
      private:        req.body.private
    };

    // 1. Create the board
    Board.create(bits, function(err, board) {
      if (err) return res.serverError(err);

      var colmakermaker = function(title, pos) {
        return function(cb) {
          Column.create({title: title, position: pos, board: board.id}, cb);
        }
      };

      // 2. Create starter columns
      var pos = 1, jobs = [colmakermaker('Trash', 0)], colsetsById = config.colsetsById();
      (colsetsById[bits.colsetId] || colsetsById[1]).cols.forEach(function(name) {
        jobs.push(colmakermaker(name, pos));
        pos++;
      });
      async.parallel(jobs, function(err, columns) {
        if (err) return res.serverError(err);

        board.addInfo(function(err, b) {
          if (err) return res.serverError(err);

          b.columns = columns;

          res.jsonx(b);

          delete b.columns;  // other users don't need this.

          redis.boardCreated(b);
        });
      });

    });
  },

  update: function(req, res) {
    var id    = parseInt(req.param('id')),
        title = req.body.title,
        bits  = {};

    Board.updatableAttributes.forEach(function(field) {
      if (req.body[field] !== undefined) bits[field] = req.body[field];
    });

    util.boardIsLegitAndOwnedBy(id, req, res, function(board) {
      if (!board) return;
      Board.update(id, bits).exec(function(err, board) {
        if (err) return res.serverError(err);
        res.jsonx(board[0]);
        redis.boardUpdated(board[0]);
      });
    });
  },

  delete: function(req, res) {
    var id   = parseInt(req.param('id')),
        user = req.user;

    if (!id)         return res.badRequest();
    if (!user.admin) return res.forbidden();

    Board.findOneById(id).exec(function(err, board) {
      if (err)    return res.serverError(err);
      if (!board) return res.notFound(err);

      Board.destroy({id: board.id}).exec(function(err) {
        if (err) return res.serverError(err);
        res.jsonx(true);
        redis.boardDelete(id);
      });
    });
  },

  moveCard: function(req, res) {
    var boardId = parseInt(req.param('id'));

    var p = {
      cardId:       parseInt(req.param('cardId')),
      destColumnId: parseInt(req.param('destColumnId')),
      destPosition: parseInt(req.param('destPosition'))
    };

    if (!boardId || !p.cardId || !p.destColumnId || !p.destPosition) return res.badRequest();

    async.auto({
      card:  function(cb) { Card.findOneById(p.cardId).exec(cb); },
      destColumn: function(cb) {
        Column.findOne({board: boardId, id: p.destColumnId}).exec(cb);
      },
      destStack: function(cb) {
        Card.find({column: p.destColumnId}).sort({position: 'asc'}).exec(cb);
      },
      sourceColumn: ['card', function(cb, r) {
        if (r.card.column === p.destColumnId) return cb(null, null);  // we already got this!
        Column.findOne({board: boardId, id: r.card.column}).exec(cb);
      }],
      sourceStack: ['card', function(cb, r) {
        if (r.card.column === p.destColumnId) return cb(null, null);  // we already got this!
        Card.find({column: r.card.column}).sort({position: 'asc'}).exec(cb);
      }]
    }, function(err, r) {
      if (err)                                                       return res.serverError(err);
      if (!r.card || !r.destColumn || !r.destStack)                  return res.notFound();
      if (((r.card.column === p.destColumnId) &&  r.sourceColumn)
       || ((r.card.column !== p.destColumnId) && !r.sourceColumn))   return res.notFound();

      var jobs = [], signalData = {}, destStack = util.normalizeCardStack(r.destStack);

      if (p.destPosition < 1 || p.destPosition > destStack.length+1) return res.badRequest();
      if (p.destPosition % 1 !== 0)                                  return res.badRequest();

      // // Vaporize card if it is empty and headed for the trash
      // if (!r.card.content && r.destColumn.position === 0) {
      //
      //   var sourceColumn      = r.sourceColumn || r.destColumn,
      //       sourceStack       = util.normalizeCardStack(r.sourceStack || r.destStack),
      //       originalSourceMap = util.toCardStackMap(sourceStack),
      //       card              = util.spliceItem(sourceStack, r.card.id);
      //
      //   vaporizingTheCard = true;
      //
      //   // Actually delete the card from the db
      //   jobs.push(function(cb) { Card.destroy({id: card.id}).exec(cb); });
      //
      //   // Save resorted source column
      //   jobs = jobs.concat(util.fixCardPositions(sourceStack, originalSourceMap));
      //
      //   // Send specific message event to vaporize this card
      //   redis.cardVaporize(boardId, card.id);
      //
      //   signalData[sourceColumn.id] = util.toCardStackMap(sourceStack);

      // } else if (r.sourceStack === null) {  // source and dest stack are the same
      if (r.sourceStack === null) {  // source and dest stack are the same

        var destStack       = util.normalizeCardStack(r.destStack),
            originalDestMap = util.toCardStackMap(destStack),
            card            = util.spliceItem(destStack, r.card.id);

        // Reinsert the cardSlot.
        destStack.splice(p.destPosition - 1, 0, [card]);

        // Figure out the work to actually update the db.
        jobs = util.fixCardPositions(destStack, originalDestMap);

        // Sort out card id mapping to feed to the clients.
        signalData[p.destColumnId] = util.toCardStackMap(destStack);

      } else {  // DIFFERENT source and destination stacks (columns)

        var destStack         = util.normalizeCardStack(r.destStack),
            originalDestMap   = util.toCardStackMap(destStack),
            sourceStack       = util.normalizeCardStack(r.sourceStack),
            originalSourceMap = util.toCardStackMap(sourceStack),
            card              = util.spliceItem(sourceStack, r.card.id),
            originalColumnId  = card.column;

        // set the new column id on the moving card
        card.column = p.destColumnId;

        // Reinsert the cardSlot
        destStack.splice(p.destPosition - 1, 0, [card]);

        // Figure out the work to actually update the db.
        jobs = util.fixCardPositions(sourceStack, originalSourceMap)
          .concat(util.fixCardPositions(destStack, originalDestMap));

        // Sort out card id mapping to feed to the clients.
        signalData[p.destColumnId]   = util.toCardStackMap(destStack);
        signalData[originalColumnId] = util.toCardStackMap(sourceStack);
      }

      signalData.animateCardIds = [p.cardId];

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);

        meta.releaseCardLock(boardId, card.id, true);

        res.jsonx(signalData);

        redis.boardMoveCards(boardId, signalData);
      });

    });

  },

  movePile: function(req, res) {
    var boardId = parseInt(req.param('id'));

    var p = {
      sourceColumnId: parseInt(req.param('sourceColumnId')),
      sourcePosition: parseInt(req.param('sourcePosition')),
      destColumnId:   parseInt(req.param('destColumnId')),
      destPosition:   parseInt(req.param('destPosition'))
    };

    async.auto({
      sourceColumn: function(cb) {
        Column.find({board: boardId, id: p.sourceColumnId}).exec(cb);
      },
      sourceStack: function(cb) {
        Card.find({column: p.sourceColumnId}).sort({position: 'asc'}).exec(cb);
      },
      destColumn: function(cb) {
        if (p.sourceColumnId === p.destColumnId) return cb(null, null);
        Column.find({board: boardId, id: p.destColumnId}).exec(cb);
      },
      destStack: function(cb) {
        if (p.sourceColumnId === p.destColumnId) return cb(null, null);
        Card.find({column: p.destColumnId}).sort({position: 'asc'}).exec(cb);
      }
    }, function(err, r) {
      if (err)                                                           return res.serverError(err);
      if (!r.sourceColumn)                                               return res.notFound();
      if (!r.destColumn && p.sourceColumnId !== p.destColumnId)          return res.notFound();
      if (((p.sourceColumnId === p.destColumnId) &&  r.destColumn) ||
          ((p.sourceColumnId !== p.destColumnId) && !r.destColumn))      return res.notFound();

      var sourceStack       = util.normalizeCardStack(r.sourceStack),
          destStack         = r.destStack ? util.normalizeCardStack(r.destStack) : null;

      if (p.sourcePosition < 1 || p.sourcePosition > sourceStack.length) return res.badRequest();
      if (destStack &&
          (p.destPosition < 1 || p.destPosition > destStack.length+1))   return res.badRequest();

      var originalSourceMap = util.toCardStackMap(sourceStack),
          originalDestMap   = r.destStack ? util.toCardStackMap(destStack) : null,
          pile              = sourceStack.splice(p.sourcePosition - 1, 1)[0],
          extra             = (p.sourcePosition < p.destPosition && !destStack) ? 1 : 0,
          jobs              = [],
          signalData        = {};

      // Set the new column id on the moving cards
      pile.forEach(function(card) {
        card.column   = p.destColumnId;
        card.position = p.destPosition;
        jobs.push(function(cb) { card.save(cb); });
      });

      // Splice in the pile to the destination
      (destStack || sourceStack).splice(p.destPosition - 1 - extra, 0, pile);

      // Figure out the work to actually update the db.
      jobs = util.fixCardPositions(sourceStack, originalSourceMap)
        .concat(destStack ? util.fixCardPositions(destStack, originalDestMap) : []);

      // Sort out card id mapping to feed to the clients.
      signalData[p.sourceColumnId] = util.toCardStackMap(sourceStack);

      if (destStack) signalData[p.destColumnId] = util.toCardStackMap(destStack);

      signalData.animatePiles = [{columnId: p.destColumnId, position: p.destPosition}];

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);

        res.jsonx(signalData);

        redis.boardMoveCards(boardId, signalData);
      });

    });

  },

  combineCards: function(req, res) {
    var boardId = parseInt(req.param('id')),
        user    = req.user;

    var p = {
      sourceCardId: parseInt(req.param('sourceCardId')),
      destCardId:   parseInt(req.param('destCardId'))
    };

    if (p.sourceCardId === p.destCardId) {
      return res.badRequest('You cannot combine a card with itself!');
    } else if (!p.sourceCardId || !p.destCardId) {
      return res.badRequest('sourceCardId and destCardId are required.');
    }

    async.auto({
      board:  function(cb) { Board.findOneById(boardId).exec(cb); },
      source: function(cb) { Card.findOneById(p.sourceCardId).exec(cb); },
      dest:   function(cb) { Card.findOneById(p.destCardId).exec(cb); },
      sourceColumn: ['source', function(cb, r) {
        Column.findOneById(r.source.column).exec(cb);
      }],
      sourceStack: ['source', function(cb, r) {
        Card.find({column: r.source.column}).sort({position: 'asc'}).exec(cb);
      }],
      destStack: ['board', 'dest', function(cb, r) {
        Column.find({id: r.dest.column, board: r.board.id}).exec(cb);
      }],
      destStackStack: ['dest', function(cb, r) {
        Card.find({column: r.dest.column, position: r.dest.position}).exec(cb);
      }]
    }, function(err, r) {
      if (err) return res.serverError(err);

      if (!r.board || !r.source || !r.dest)       return res.notFound();
      if (!r.sourceColumn || r.sourceStack === 0) return res.notFound();

      var sourceColumnId    = r.source.column,
          sourcePosition    = r.source.position,
          sourceStack       = util.normalizeCardStack(r.sourceStack),
          originalSourceMap = util.toCardStackMap(sourceStack),
          sourceIsFromPile  = sourceStack[sourcePosition - 1].length > 1,
          card              = util.spliceItem(sourceStack, r.source.id),
          jobs              = util.fixCardPositions(sourceStack, originalSourceMap),
          destPosition;

      // If we're joining a higher card with a lower card on the same stack, then the
      // desired position will have reduced by one once we eliminate the slot that the
      // source card is currently inhabiting. We'll need to adjust the destination
      // position accordingly.
      if (sourceColumnId === r.dest.column  // same column,
       && sourcePosition < r.dest.position  // dragged card is above lower one
       && !sourceIsFromPile)                // source card didn't come from a pile
      {
        r.dest.position--;
      }

      // Resituate the source card
      r.source.column    = r.dest.column;
      r.source.position  = r.dest.position;
      r.source.topOfPile = true;
      jobs.push(function(cb) { r.source.save(cb); });

      // Flip off other topOfPile flags
      r.destStackStack.forEach(function(c) {
        if (c.topOfPile) {
          c.topOfPile = false;
          jobs.push(function(cb) { c.save(cb); });
        }
      });

      // if (sourceColumnId == r.dest.column && sourcePosition < r.dest.position) {
      if (sourceColumnId == r.dest.column) {
        var extra = sourcePosition < r.dest.position ? 1 : 0;
        sourceStack[r.dest.position - 1 - extra].push(r.source);
      }

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);

        var signalData = {
          card:           r.source,
          sourceMap:      util.toCardStackMap(sourceStack),
          sourceColumnId: sourceColumnId,
          animatePiles:   [{columnId: r.dest.column, position: r.dest.position}]
        };

        res.jsonx(signalData);

        redis.boardCombineCards(boardId, signalData);
      });
    });
  },

  combinePiles: function(req, res) {
    var boardId = parseInt(req.param('id')),
        user    = req.user;

    var p = {
      sourceColumnId: parseInt(req.param('sourceColumnId')),
      sourcePosition: parseInt(req.param('sourcePosition')),
      destCardId:     parseInt(req.param('destCardId'))
    };

    if (!boardId || !p.sourceColumnId || !p.sourcePosition || !p.destCardId) {
      return res.badRequest();
    }

    async.auto({
      board: function(cb) { Board.findOneById(boardId).exec(cb); },
      dest: function(cb) { Card.findOneById(p.destCardId).exec(cb); },
      destColumn: ['dest', function(cb, r) {
        Column.findOne({id: r.dest.column, board: boardId}).exec(cb);
      }],
      sourceColumn: function(cb) { Column.findOneById(p.sourceColumnId).exec(cb); },
      sourceStack: function(cb) {
        Card.find({column: p.sourceColumnId}).sort({position: 'asc'}).exec(cb);
      },
      destStack: ['dest', function(cb, r) {
        Card.find({column: r.dest.column}).sort({position: 'asc'}).exec(cb);
      }]
    }, function(err, r) {
      if (err)                                   return res.serverError(err);
      if (!r.board || !r.dest || !r.destColumn)  return res.notFound('a');
      if (r.sourceStack.length === 0)            return res.notFound('b');
      if (r.sourceColumn.board !== boardId)      return res.notFound('c');

      var sourceStack       = util.normalizeCardStack(r.sourceStack);

      if (p.sourcePosition > sourceStack.length) return res.badRequest();

      var originalSourceMap = util.toCardStackMap(sourceStack),
          destStack         = util.normalizeCardStack(r.destStack),
          originalDestMap   = util.toCardStackMap(destStack),
          pile              = sourceStack.splice(p.sourcePosition - 1, 1)[0],
          jobs              = util.fixCardPositions(sourceStack, originalSourceMap),
          destPosition      = r.dest.position;

      // If we're joining a higher card with a lower card on the same stack, then the
      // desired position will have reduced by one once we eliminate the slot that the
      // source card is currently inhabiting. We'll need to adjust the destination
      // position accordingly.
      if (p.sourceColumnId === r.dest.column   // same column,
       && p.sourcePosition < destPosition)     // dragged card is above lower one
      {
        destPosition--;
      }

      // If source and dest are the same stack, splice out the same source cards from
      // the destStack.
      if (p.sourceColumnId === r.dest.column) {
        destStack.splice(p.sourcePosition - 1, 1);
      }

      // Resituate the moving cards
      pile.forEach(function(c) {
        c.column    = r.dest.column;
        c.position  = destPosition;
        jobs.push(function(cb) { c.save(cb); });
      });

      // Flip off other topOfPile flags on the target stack
      if (destStack[destPosition - 1]) {
        destStack[destPosition - 1].forEach(function(c) {
          if (c.topOfPile) {
            c.topOfPile = false;
            jobs.push(function(cb) { c.save(cb); });
          }
        });
      }

      destStack[destPosition - 1] = (destStack[destPosition - 1] || []).concat(pile);

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);

        var signalData = {
          animatePiles: [{columnId: r.dest.column, position: destPosition}]
        };

        signalData[r.dest.column] = util.toCardStackMap(destStack);

        if (p.sourceColumnId != r.dest.column) {
          signalData[p.sourceColumnId] = util.toCardStackMap(sourceStack);
        }

        res.jsonx(signalData);

        redis.boardMoveCards(boardId, signalData);
      });
    });
  },

  // A new card is on top of a pile
  cardFlip: function(req, res) {
    var boardId   = parseInt(req.param('id')),
        cardId    = parseInt(req.param('cardId')),
        columnId  = parseInt(req.param('columnId')),
        position  = parseInt(req.param('position')),
        condition = {column: columnId, position: position},
        jobs      = [];

    if (!boardId || !cardId || !columnId || !position) return res.badRequest();

    async.auto({
      board: function(cb) { Board.findOneById(boardId).exec(cb); },
      column: function(cb) { Column.findOneById(columnId).exec(cb); },
      cards:  function(cb) {
        Card.find({column: columnId, position: position}).sort({id: 'desc'}).exec(cb);
      }
    }, function(err, r) {
      if (err)                           return res.serverError(err);
      if (!r.board || !r.column)         return res.notFound();
      if (r.cards.length === 0)          return res.notFound();
      if (r.column.board !== r.board.id) return res.notFound();

      r.cards.forEach(function(card) {
        if (card.topOfPile && card.id !== cardId) {
          card.topOfPile = false;
          jobs.push(function(cb) { card.save(cb); });
        } else if (!card.topOfPile && card.id === cardId) {
          card.topOfPile = true;
          jobs.push(function(cb) { card.save(cb); });
        }
      });

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);

        res.jsonx({cardId: cardId});

        redis.boardFlipCard(boardId, cardId);
      });
    });
  },

  timerStart: function(req, res) {
    var boardId = parseInt(req.param('id')),
        seconds = parseInt(req.param('seconds')),
        user    = req.user;

    if (!boardId || seconds <= 0) return res.badRequest();

    Board.findOneById(boardId).exec(function(err, board) {
      if (err)                       return res.serverError(err);
      if (!board)                    return res.notFound();

      var bits = {
        timerStart:  new Date(),
        timerLength: seconds
      };

      Board.update(boardId, bits).exec(function(err, board) {
        if (err) return res.serverError(err);

        res.jsonx(board);

        redis.boardTimerStart(boardId, seconds);
      });
    });
  },

  sortByVotes: function(req, res) {
    var boardId = parseInt(req.param('id'));

    if (!boardId) return res.badRequest();

    async.auto({
      board: function(cb) { Board.findOneById(boardId).exec(cb); },
      columns: ['board', function(cb, r) {
        Column.find({board: r.board.id}).sort({position: 'asc'}).exec(cb);
      }],
      rawCards: ['columns', function(cb, r) {
        async.parallel(r.columns.map(function(col) {
          return function(_cb) {
            Card.find({column: col.id}).sort({position: 'asc'}).exec(_cb);
          };
        }), cb);
      }],
      votes: ['rawCards', function(cb, r) {
        async.parallel(_.flatten(r.rawCards).reduce(function(memo, c) {
          memo[c.id] = function(_cb) { Vote.count({card: c.id}).exec(_cb); };
          return memo;
        }, {}), cb);
      }],
      cards: ['votes', function(cb, r) {  // add the vote counts
        r.rawCards.forEach(function(cards) {
          cards.forEach(function(card) {
            card.voteCount = r.votes[card.id] || 0;
          });
        });
        cb(null, r.rawCards);
      }]
    }, function(err, r) {
      if (err)                    return res.serverError(err);
      if (!r.board || !r.columns) return res.badRequest();

      var cards      = _.indexBy(r.cards, 'column'),
          jobs       = [],
          signalData = {};

      r.columns.forEach(function(column) {
        var stack    = util.normalizeCardStack(r.cards[column.position]),
            modified = false,
            position = 1;

        // Do the sort!
        stack.sort(function(a, b) {
          var votesA = a.reduce(function(memo, c) { return memo + c.voteCount; }, 0);
          var votesB = b.reduce(function(memo, c) { return memo + c.voteCount; }, 0);
          return votesB - votesA;
        });

        // Queue any updates we need to fix positions
        stack.forEach(function(pile) {
          pile.forEach(function(card) {
            if (card.position !== position) {
              card.position = position;
              jobs.push(function(cb) { card.save(cb); });
              modified = true;
            }
          });
          position++;
        });

        // If we made any changes to this column, add it to the signal!
        if (modified) signalData[column.id] = util.toCardStackMap(stack);
      });

      async.parallel(jobs, function(err, r) {
        if (err) return err.serverError(err);

        res.jsonx(signalData);

        if (!_.isEmpty(signalData)) redis.boardMoveCards(boardId, signalData);
      });
    });
  },

  wipeBoard: function(req, res) {
    var boardId = parseInt(req.param('id'));

    if (!boardId) return res.badRequest();

    async.auto({
      board: function(cb) { Board.findOneById(boardId).exec(cb); },
      columns: ['board', function(cb, r) {
        Column.find({board: r.board.id}).sort({position: 'asc'}).exec(cb);
      }],
      rawCards: ['columns', function(cb, r) {
        async.parallel(r.columns.map(function(col) {
          return function(_cb) {
            Card.find({column: col.id}).sort({position: 'asc'}).exec(_cb);
          };
        }), cb);
      }]
    }, function(err, r) {
      if (err)                    return res.serverError(err);
      if (!r.board || !r.columns) return res.badRequest();

      var jobs = [];

      _.flatten(r.rawCards).forEach(function(card) {
        console.log('destroying', card);
        jobs.push(function(cb) { Card.destroy({id: card.id}, cb); });
      });

      console.log('jobs', jobs.length);

      async.parallel(jobs, function(err, results) {
        if (err) return res.serverError(err);
        res.jsonx(true);
        redis.boardWipe(boardId);
      });
    });
  },

  timerPause: function(req, res) {
    var boardId = parseInt(req.param('id')),
        seconds = parseInt(req.param('seconds'));

    var bits = {
      timerStart:  null,
      timerLength: seconds
    };

    Board.update(boardId, bits).exec(function(err, board) {
      if (err) return res.serverError(err);

      res.jsonx(board);

      redis.boardTimerPause(boardId, bits.timerLength);
    });
  },

  config: function(req, res) {
    res.jsonx(config.all());
  }

};
