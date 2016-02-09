(function() {
  'use strict';
  angular.module('hansei.services')
    .factory('board', ['$rootScope', '$q', '$timeout', 'api', 'user', 'timer',
    function($rootScope, $q, $timeout, api, user, timer) {
      var board, defer, eventCb,
          locks    = [],  // card ids that this client has locked
          theQueue = [],  // array of functions to exec when user is done with locks
          _ = {
            map:       $rootScope.map,
            find:      $rootScope.find,
            pluck:     $rootScope.pluck,
            flatten:   $rootScope.flatten,
            sortBy:    $rootScope.sortBy,
            findIndex: $rootScope.findIndex
          };

      var cb = function(type, bits) {
        if (typeof eventCb !== 'function') throw 'Must setEventCb()!';
        eventCb(type, bits);
      };


      // copy a board data object into the live board model, set some things,
      // and forget about the obj.
      var loadBoard = function(boardObj) {
        if (!boardObj) return false;
        setAllPropertiesFrom(boardObj);
        boardSort();
        countColumnCards();
        parseCards();
        figureVotesRemaining();
        initTimer();
        return true;
      };

      var boardSort = function() {
        board.columns = _.sortBy(board.columns, 'position');

        // Per column, cards are sorted by position, but if a position value
        // is shared, the cards are stacked with an order of the id, ascending.
        for (var i=0; i<board.columns.length; i++) {
          board.columns[i] = fixColumn(board.columns[i]);
        }

        board.updateTrashIsEmpty();
      };

      var fixColumn = function(column) {
        var buffer   = [],
            origlist = _.sortBy(_.sortBy(column.cards, 'id'), 'position'),
            j;

        // We'll use cardSlots instead.
        delete column.cards;
        column.cardSlots = [];

        // Group piles into arrays
        var maybeLoadSlot = function(curCard) {
          if (buffer.length && (!curCard || curCard.position != buffer[0].position)) {
            column.cardSlots.push(buffer);
            buffer = [];
          }
        };

        for (j=0; j<origlist.length; j++) {
          maybeLoadSlot(origlist[j]);
          buffer.push(origlist[j]);
        }

        maybeLoadSlot();  // but surely!

        return column;
      };

      var countColumnCards = function() {
        board.columns.forEach(function(col) {
          col.cardCount = _.flatten(col.cardSlots).length;
        });
      };

      var figureVotesRemaining = function() {
        board.votesRemaining = board.votesPerUser;

        if (board.votesRemaining === -1) return;

        spiderCards(function(card) {
          card.votes.forEach(function(v) {
            if (v.user === user.id) {
              board.votesRemaining--;
            }
          });
        });
      };

      var parseCards = function() {
        // Set up some card properties that exist purely on the client side
        spiderCards(function(card) {
          card.lockedByAnother = !!card.locked;
          card.myVoteCount     = countOwnVotes(card);
        });
      };

      var countOwnVotes = function(card) {
        var uid = user.id;
        return card.votes.reduce(function(memo, v) {
          return v.user === uid ? memo + 1 : memo;
        }, 0);
      };

      var spiderCards = function(cb) {
        board.columns.forEach(function(col) {
          col.cardSlots.forEach(function(slot) {
            slot.forEach(function(c) { cb(c); });
          });
        });
      };

      var initTimer = function() {
        timer.init(board.timerLeft);
        if (board.timerRunning) {
          timer.remaining = board.timerLeft;
          timer.start();
        } else {
          timer.remaining = board.timerLength;
        }
      };

      var setAllPropertiesFrom = function(obj) {
        board.loaded  = true;
        board.id      = obj.id;
        board.slug    = obj.slug;
        board.shortid = obj.shortid;
        board.columns = obj.columns;
        board.trash   = obj.columns ? obj.columns[0] : undefined;

        setPropertiesFrom(obj);
      };

      var setPropertiesFrom = function(obj) {
        var isFacilitator = (user.id === obj.creator) || user.admin;

        board.title            = obj.title;
        board.votesEnabled     = obj.votesPerUser !== 0;
        board.votesAreInfinite = obj.votesPerUser === -1;
        board.votesPerUser     = obj.votesPerUser;
        board.p_seeVotes       = obj.p_seeVotes;
        board.p_seeContent     = obj.p_seeContent;
        board.p_lock           = obj.p_lock;
        board.locked           = obj.p_lock       && !isFacilitator;
        board.archived         = obj.archived;
        board.private          = obj.private;
        board.isFacilitator    = isFacilitator;
        board.seeVotes         = isFacilitator    || obj.p_seeVotes;
        board.seeContent       = isFacilitator    || obj.p_seeContent;
        board.timerLength      = obj.timerLength  || 0;
        board.timerLeft        = obj.timerLeft    || 0;
        board.timerRunning     = obj.timerRunning || false;
      };

      var queue      = function(fn) { theQueue.push(fn); };
      var maybeDefer = function(fn) { board.weHaveCardLocks ? queue(fn) : fn(); };
      var flushQueue = function()   { var fn; while (fn = theQueue.shift()) fn(); }



      board = {
        setEventCb: function(_cb) {
          eventCb = _cb;
        },

        load: function(boardId) {
          defer = $q.defer();
          api.boardGet(boardId, function(b) {
            if (loadBoard(b)) {
              defer.resolve(board);
            } else {
              defer.reject('board_not_found');
            }
          });
          return defer.promise;
        },

        unload: function() {
          setAllPropertiesFrom({});
          this.loaded = false;
          timer.init();
        },

        promise: function() { return defer.promise; },

        weHaveCardLocks: false,
        loaded:          false,
        locks:           locks,
        timer:           timer,

        timerStart: function(seconds) {
          this.timerLeft    = seconds;
          this.timerRunning = true;
          this.timer.start(seconds);
        },

        timerPause: function(seconds) {
          this.timerLeft = seconds;
          this.timerRunning = false;
          this.timer.pause(seconds);
        },

        nextPositionByColumnId: function(columnId) {
          var column = this.column(columnId);

          if (!column) return null;

          if (!column.cardSlots.length) return 1;

          return column.cardSlots[column.cardSlots.length - 1].position + 1;
        },

        updateTrashIsEmpty: function() {
          this.trashIsEmpty = this.columns[0].cardSlots.length === 0;
        },

        column: function(id) {
          for (var i in board.columns) {
            if (board.columns[i].id == id) return board.columns[i];
          }
          throw 'Failed to find column id ' + id;
        },

        card: function(id) {
          id = parseInt(id);
          var allCards = _.flatten(_.pluck(board.columns, 'cardSlots'));
          for (var i in allCards) {
            if (allCards[i].id === id) {
              return allCards[i];
            }
          }
          throw 'Failed to find card id ' + id;
        },

        // Get the card model for the top-most card. If getIndexOnly is true,
        // then return only the index of the pile array.
        getTopCard: function(pile, getIndexOnly) {
          var i, index, highIdCard;

          for (i=0; i<pile.length; i++) {
            if (pile[i].topOfPile) {
              if (getIndexOnly) return i;
              return pile[i];
            } else if (!highIdCard) {
              index      = i;
              highIdCard = pile[i];
            } else if (highIdCard.id < pile[i].id) {
              index      = i;
              highIdCard = pile[i];
            }
          }

          if (getIndexOnly) return index;

          return highIdCard;
        },

        update: function(b) {
          maybeDefer(function() {
            setPropertiesFrom(b);
            figureVotesRemaining();
          });
        },

        columnCreate: function(_column) {
          maybeDefer(function() {
            board.columns.push(fixColumn(_column));
            countColumnCards();
          }.bind(this));
        },

        columnUpdate: function(_column) {
          maybeDefer(function() {
            var column = this.column(_column.id);
            Object.keys(_column).forEach(function(k) {
              if (k === 'cards') return;
              column[k] = _column[k];
            });
          }.bind(this));
        },

        columnMove: function(columnIds) {  // info is an array of column id's in the target order
          maybeDefer(function() {
            var pos = 0, cols = [];  // new column array

            columnIds.forEach(function(id) {
              var col = this.column(id);
              col.position = pos;
              pos++;
              cols.push(col);
            }.bind(this));

            board.columns.splice.apply(board.columns, [0, Number.MAX_VALUE].concat(cols));
          }.bind(this));
        },

        // (1) Move cards within this column to the trash, in order
        // (2) Delete the column in question
        // (3) Renumber column positions
        columnDeleteAndTrashCards: function(columnId) {
          maybeDefer(function() {
            var nextPosition = board.columns.length,
                idx          = _.findIndex(board.columns, function(c) { return c.id === columnId; }),
                column       = board.columns.splice(idx, 1)[0],
                trash        = this.trash;
            column.cardSlots.forEach(function(cs) {  // move cards to trash
              cs.forEach(function(c) {
                c.position = (trash.cardSlots.length
                  ? trash.cardSlots[trash.cardSlots.length - 1][0].position
                  : 0
                ) + 1;
                c.column = trash.id;
                trash.cardSlots.push([c]);
              });
            });
            for (var i=idx; i<board.columns.length; i++) {  // renumber latter columns
              board.columns[i].position = nextPosition;
              nextPosition++;
            }
            board.updateTrashIsEmpty();
            countColumnCards();
          }.bind(this));
        },

        cardCreate: function(card) {
          maybeDefer(function() {
            var column = this.column(card.column);
            column.cardSlots.push([card]);
            parseCards();
            countColumnCards();
          }.bind(this));
        },

        cardUpdate: function(_card) {
          maybeDefer(function() {
            var card = this.card(_card.id);
            Object.keys(_card).forEach(function(k) {
              card[k] = _card[k];
            });
          }.bind(this));
        },

        cardUpvote: function(vote) {
          maybeDefer(function() {
            var card = this.card(vote.card);
            card.votes.push(vote);

            card.myVoteCount = countOwnVotes(card);

            if (board.votesPerUser > 0 && vote.user === user.id) {
              board.votesRemaining--;
            }

            animateCard(card);
          }.bind(this));
        },

        cardUnupvote: function(vote) {
          maybeDefer(function() {
            var card = this.card(vote.card),
                idx = _.findIndex(card.votes, function(v) { return v.user === vote.user; });

            card.votes.splice(idx, 1);

            card.myVoteCount = countOwnVotes(card);

            if (vote.user === user.id) board.votesRemaining++;

            animateCard(card);
          }.bind(this));
        },

        cardVaporize: function(info) {
          maybeDefer(function() {
            var cardId     = info.cardId,
                signalData = info.signalData,
                card       = this.card(cardId),
                stack      = this.column(card.column).cardSlots,
                pile       = stack[card.position - 1],
                pileIdx    = _.findIndex(pile, function(c) { return c.id === card.id; });

            delete pile[pileIdx];
            var card2 = pile.splice(pileIdx, 1);
            if (pile.length === 0) stack.splice(card.position - 1, 1);

            this.rebuildColumn(signalData);
            this.forgetCardLock(cardId);
            figureVotesRemaining();
            countColumnCards();
          }.bind(this));
        },

        cardLock: function(info) {
          var card = this.card(info.id);
          card.locked          = info.username;
          card.lockedByAnother = !info.you;

          if (info.you) this.rememberCardLock(card.id);
        },

        cardUnlock: function(id) {
          var card = this.card(id);
          card.locked          = false;
          card.lockedByAnother = false;
          this.forgetCardLock(id);  // This only matters for our own locked
                                    // card id's, but won't hurt for others.
        },

        cardColor: function(bits) {
          maybeDefer(function() { this.card(bits.id).color = bits.color; }.bind(this));
        },

        // Track our own card locks so we can reestablish on websocket reconnect
        rememberCardLock: function(cardId) {
          if (locks.indexOf(cardId) === -1) {
            locks.push(cardId);
            this.weHaveCardLocks = true;
          }
        },

        forgetCardLock: function(cardId) {
          var idx = locks.indexOf(cardId);
          if (idx !== -1) locks.splice(idx, 1);

          // Flush the event queue if we're done with the locks.
          if (locks.length === 0) {
            this.weHaveCardLocks = false;
            flushQueue();
          }
        },

        // Replace the column/piles with the cards of the given id's, in order.
        //
        // info is an object with keys of column id's. Corresponding vals are arrays
        // of arrays, representing the slots in the column, in order. Each such sub-
        // array contains card ids. If there is more than one, then it's a pile.
        // (Note that multiple columns can be updated with one invocation.)
        //
        // Also inside info could be animateCardIds or animatePiles. These will be set
        // aside before dealing with the aforementioned column id keys.
        //
        rebuildColumn: function(info) {
          var cardStacks        = {},
              animateCardIds    = [],
              animatePiles      = [],
              suppressAnimation = Boolean(info.suppressAnimation);

          // Pull these bits out for later, if they exist
          if (info.animateCardIds) { animateCardIds = info.animateCardIds; delete info.animateCardIds; }
          if (info.animatePiles)   { animatePiles   = info.animatePiles;   delete info.animatePiles;   }
          delete info.suppressAnimation;

          Object.keys(info).forEach(function(columnId) {
            var pos = 1, sourceStack = this.column(columnId).cards;

            cardStacks[columnId] = [];

            // make a new array to replace, renumbering positions as we go
            info[columnId].forEach(function(slotInfo) {
              var slot = [];
              slotInfo.forEach(function(cardId) {
                var card = this.card(cardId);
                card.position = pos;
                card.column   = columnId;
                slot.push(card);
              }.bind(this));
              cardStacks[columnId].push(slot);
              pos++;
            }.bind(this));

          }.bind(this));

          // replace the entire contents of each column with our new stack of cardSlots
          Object.keys(cardStacks).forEach(function(columnId) {
            var sourceStack = this.column(columnId).cardSlots;

            // DO EET
            sourceStack.splice.apply(sourceStack,
              [0, Number.MAX_VALUE].concat(cardStacks[columnId]));

            // Animate any modified column in the case where particular cards/piles
            // aren't called out to be animated.
            if (!suppressAnimation && animateCardIds.length === 0 && animatePiles.length === 0) {
              // Animate all cards in this column!
              _.flatten(sourceStack).forEach(function(card) { animateCard(card); });
            }

          }.bind(this));

          if (animateCardIds.length > 0) {
            animateCardIds.forEach(function(cId) {
              var card = this.card(cId);
              if (!card) return;  // shrug.. shouldn't happen...
              animateCard(card);
            }.bind(this));
          } else if (animatePiles.length > 0) {
            animatePiles.forEach(function(i) {
              var topCard, column = this.column(i.columnId);
              if (!column || !column.cardSlots[i.position - 1]) return;
              topCard = this.getTopCard(column.cardSlots[i.position - 1]);
              animateCard(topCard);
            }.bind(this));
          }

          this.updateTrashIsEmpty();
          countColumnCards();
        },

        cardMove: function(info) {
          maybeDefer(function() {
            this.rebuildColumn(info);
            countColumnCards();
          }.bind(this));
        },

        combineCards: function(info) {
          maybeDefer(function() {
            var cardInfo       = info.card,
                sourceMap      = info.sourceMap,
                sourceColumnId = info.sourceColumnId,
                destColumn     = this.column(cardInfo.column),
                card           = this.card(cardInfo.id),
                remap          = {};

            // Reorder the source column, removing the the dragged card if it's there
            remap[sourceColumnId] = sourceMap.map(function(s) {
              return s.filter(function(id) { return id != card.id; });
            });
            if (info.animatePiles) remap.animatePiles = info.animatePiles;
            this.rebuildColumn(remap);

            // If topOfPile is coming down flipped on, make sure the others in the
            // relevant pile are flipped off.
            if (cardInfo.topOfPile) {
              destColumn.cardSlots.forEach(function(s) {
                if (!s.length || s[0].position !== cardInfo.position) return;
                s.forEach(function(c) { c.topOfPile = false; });
              });
            }

            // Update some things on the live card.
            card.column    = cardInfo.column;
            card.position  = cardInfo.position;
            card.topOfPile = cardInfo.topOfPile;

            // Add the card to the target slot!
            destColumn.cardSlots[card.position - 1].push(card);

            countColumnCards();
          }.bind(this));
        },

        flipCard: function(cardId) {
          maybeDefer(function() {
            var card = this.card(cardId),
                pile = this.column(card.column).cardSlots[card.position - 1];

            pile.forEach(function(c) {
              c.topOfPile = Boolean(c.id === card.id);
            });
          }.bind(this));
        },

        // Because card operations that make changes above this card can cause
        // positions to change, this function will determine if the given cardId
        // occurs above any cards which are locked by this user.
        cardIdInterferesWithLock: function(cardId) {
          var ret  = false,
              card = this.card(cardId);

          locks.forEach(function(cid) {
            var c          = this.card(cid),
                colCardIds = this.column(c.column).map(function(ca) { return ca.id; });

            if (colCardIds.slice(0, colCardIds.indexOf(cid) + 1).indexOf(cardId) !== -1) {
              ret = true;  // we has a conflict
            }
          }.bind(this));

          return ret;
        },

        wipe: function() {
          board.columns.forEach(function(col) {
            col.cardSlots = [];
          });
        }
      };

      return board;
    }])
})();
