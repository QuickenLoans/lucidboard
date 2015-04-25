(function() {
  'use strict';

  angular.module('hansei.ui')
    .directive('card', ['board', function(board) {
      return {
        restrict: 'E',
        templateUrl: '/templates/_card.html',
        scope: {
          card:   '=',
          column: '=',
          index:  '='
        },
        controller: ['$scope', '$timeout', 'api', 'user', 'view',
        function($scope, $timeout, api, user, view) {

          var column = $scope.column;
              // card   = $scope.card;

          var isEmpty = function(str) { return Boolean(str.match(/^\s*$/)); };

          var unlock = function(card) {
            api.cardUnlock(board.id, card.id, function(unlockWorked) {
              if (unlockWorked) board.forgetCardLock(card.id);
            });
          };

          $scope.board = board;
          $scope.view  = view;
          $scope.user  = user;

          $scope.getCardLock = function(card) {
            if (board.card(card.id).locked) return;
            api.cardLock(board.id, card.id, function(gotLock) {
              if (gotLock) {
                // so we can reestablish on websocket reconnect
                board.rememberCardLock(card.id);
              } else {
                $scope.editform.$cancel();  // no lock, dude.
              }
            });
          };

          $scope.checkCardContent = function(card, content, columnId, id) {
            if (isEmpty(content)) {
              api.cardVaporize(board.id, card.id);
            } else {
              // Update implicitly unlocks
              api.cardUpdate(board.id, columnId, {id: id, content: content});
            }
            // the false returned will close the editor and not update the model.
            // (model update will happen when the event is pushed from the server)
            return false;
          };

          $scope.cancel = function(card) {  // Zap the card if previous content was empty
            if (isEmpty(card.content)) {
              api.cardVaporize(board.id, card.id);
            } else {
              unlock(card);
            }
          };

          $scope.combineThings = function($event, $data, destCardId) {
            if ($data.pile) {
              api.boardCombinePiles(board.id, {
                sourceColumnId: $data.sourceColumnId,
                sourcePosition: $data.sourcePosition,
                destCardId:     destCardId
              });
            } else {
              api.boardCombineCards(board.id, {
                sourceCardId: $data.id,
                destCardId:   destCardId
              });
            }
          };

          $scope.editorShow = function(card) {
            if (board.card(card.id).locked) return;
            $scope.editform.$show();
          };

          $scope.isEditorVisible = function(card) {
            if (!$scope.editform) return false;
            return $scope.editform.$visible;
          };

          $scope.upvote = function(card, event) {
            $scope.votePop = true;
            $timeout(function() { $scope.votePop = false; }, 500);
            if (board.card(card.id).locked) return;
            if (board.hasCardLocks)         return;
            if (board.votesRemaining === 0) return;
            api.cardUpvote(board.shortid, board.column(card.column).id, card.id);
          };

          $scope.unupvote = function(card) {
            $scope.votePop = true;
            $timeout(function() { $scope.votePop = false; }, 500);
            api.cardUnupvote(board.id, column.id, card.id);
          };

          $scope.moveTo = function(card, column, force) {
            if (!force) {
              if (board.card(card.id).locked) return;
              if (board.hasCardLocks)         return;
            }
            $scope.editform.$cancel();
            console.log('moving', card.id, column.title);
            api.boardMoveCard(board.id, {
              cardId:       card.id,
              destColumnId: column.id,
              destPosition: column.cardSlots.length + 1
            });
          };

          $scope.trash = function(card) {
            console.log('trashing', card.id);
            if (isEmpty(card.content)) {
              api.cardVaporize(board.id, card.id);
            } else {
              $scope.editform.$cancel();
              $scope.moveTo(card, board.trash, true);
            }
          };

          $scope.color = function(card, color) {
            if (board.card(card.id).locked) return;
            if (board.hasCardLocks)         return;
            api.cardColor(board.id, card.column, card.id, color);
          };

        }],
        link: function(scope, element) {

          // If we were the one who created this card, let's edit it!
          if (scope.card.you && scope.card.newlyCreated) {
            board.cardLock(scope.card);
            scope.editform.$show();
            delete scope.card.you;
            delete scope.card.newlyCreated;
          }

        }
      };
    }])
})();
