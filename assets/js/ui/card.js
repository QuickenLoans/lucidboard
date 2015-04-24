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

          var column = $scope.column,
              card   = $scope.card;

          var endCardLock = function() {
            if (!board.card(card.id).locked) return;
            api.cardUnlock(board.id, card.id, function(unlockWorked) {
              if (unlockWorked) board.forgetCardLock(card.id);
            });
          };

          $scope.board       = board;
          $scope.view        = view;
          $scope.user        = user;
          $scope.endCardLock = endCardLock;

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

          $scope.checkCardContent = function(content, columnId, id) {
            api.cardUpdate(board.id, columnId, {id: id, content: content});
            // the false returned will close the editor and not update the model.
            // (model update will happen when the event is pushed from the server)
            return false;
          };

          $scope.getCardLock = function() {
            if (board.card(card.id).locked) return;
            api.cardLock(board.id, card.id, function(gotLock) {
              if (gotLock) {
                board.rememberCardLock(card.id);  // so we can reestablish on websocket reconnect
              } else {
                $scope.editform.$cancel();        // no lock, dude.
              }
            });
          };

          $scope.editorShow = function() {
            if (board.card(card.id).locked) return;
            $scope.editform.$show();
          };

          $scope.isEditorVisible = function() {
            if (!$scope.editform) return false;
            return $scope.editform.$visible;
          };

          $scope.upvote = function(event) {
            $scope.votePop = true;
            $timeout(function() { $scope.votePop = false; }, 500);
            if (board.card(card.id).locked) return;
            if (board.hasCardLocks)         return;
            if (board.votesRemaining === 0) return;
            api.cardUpvote(board.shortid, board.column(card.column).id, card.id);
          };

          $scope.unupvote = function() {
            $scope.votePop = true;
            $timeout(function() { $scope.votePop = false; }, 500);
            api.cardUnupvote(board.id, column.id, card.id);
          };

          $scope.moveTo = function(column, force) {
            if (!force) {
              if (board.card(card.id).locked) return;
              if (board.hasCardLocks)         return;
            }
            $scope.editform.$cancel();
            api.boardMoveCard(board.id, {
              cardId:       card.id,
              destColumnId: column.id,
              destPosition: column.cardSlots.length + 1
            });
          };

          $scope.color = function(color) {
            if (board.card(card.id).locked) return;
            if (board.hasCardLocks)         return;
            api.cardColor(board.id, card.column, card.id, color);
          };

        }],
        link: function(scope, element) {

          // If we were the one who created this card, let's edit it!
          if (scope.card.you) {
            board.cardLock(scope.card);
            scope.editform.$show();
            delete scope.card.you;
          }

        }
      };
    }])
})();
