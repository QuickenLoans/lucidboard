(function() {
  'use strict';

  angular.module('hansei.ui')

  .controller('BoardCtrl', ['$scope', '$state', '$interval', '$anchorScroll', 'api',
    'user', 'board', 'eventerFactory', 'view', 'config',
    function($scope, $state, $interval, $anchorScroll, api, user, board, eventerFactory, view, config) {

      eventerFactory().event('column:create:' + board.id, function(col) {
        $scope.board = board;
        board.columnCreate(col);
      }).event('column:update:' + board.id, function(col) {
        board.columnUpdate(col);
        view.column.setOptionsByBoard(board);
      }).event('card:create:' + board.id, function(card) {
        card.newlyCreated = true;
        board.cardCreate(card);
        board.cardLock({id: card.id, username: card.username, you: card.you});
      }).event('card:update:' + board.id, function(card) {
        board.cardUnlock(card.id);
        board.forgetCardLock(card.id);
        board.cardUpdate(card);
      }).event('card:upvote:' + board.id, function(vote) {
        board.cardUpvote(vote);
      }).event('card:unupvote:' + board.id, function(vote) {
        board.cardUnupvote(vote);
      }).event('card:vaporize:' + board.id, function(cardId) {
        console.log('gotvaporize', board.id, cardId);
        board.forgetCardLock(cardId);
        board.cardVaporize(cardId);
      }).event('card:lock:' + board.id, function(info) {
        board.cardLock(info);
      }).event('card:unlock:' + board.id, function(info) {
        board.cardUnlock(info.id);
        board.forgetCardLock(info.id);  // This only matters for our own locked
                                        // card id's, but won't hurt for others.
      }).event('card:color:' + board.id, function(bits) {
        board.cardColor(bits);
      }).event('board:update:' + board.id, function(b) {
        board.update(b);
      }).event('board:delete:' + board.id, function() {
        alert("The board you're viewing has just been deleted.");
        $state.go('boards');
      }).event('board:moveCards:' + board.id, function(info) {
        board.cardMove(info);
      }).event('board:moveColumns:' + board.id, function(info) {
        board.columnMove(info);
      }).event('board:trashCardsAndDeleteColumn:' + board.id, function(info) {
        board.columnDeleteAndTrashCards(info.columnId);
      }).event('board:timerStart:' + board.id, function(bits) {
        board.timerStart(bits.seconds);
        view.timer.start();
      }).event('board:timerPause:' + board.id, function(bits) {
        board.timerPause(bits.seconds);
        view.timer.setInputSeconds(bits.seconds);
        view.timer.showStart = true;
      }).event('board:combineCards:' + board.id, function(info) {
        board.combineCards(info);
      }).event('board:flipCard:' + board.id, function(cardId) {
        board.flipCard(cardId);
      }).hook($scope);

      $scope.board = board;
      $scope.view  = view;

      // Change to the board when the column view dropdown changes
      $scope.$watch('view.column.current', function() {
        view.tab.current = 'board';
      });

      // Scroll to top whenever the tab changes
      $scope.$watch('view.tab.current', function() { $anchorScroll(); });

      // Clean up when our scope dies
      $scope.$on('$destroy', function() {
        board.locks.forEach(function(cardId) {
          api.cardUnlock(board.id, cardId);
        });
        board.unload();
      });

      $scope.getColumnViewState = function(columnId, columnPosition, columnViewSelected) {
        // hide trash from all columns view
        if (view.column.current.id === 0 && columnPosition === 0) return false;

        return (view.column.current.id === 0 || view.column.current.id === columnId);
      };

      $scope.createCard = function(column) {
        api.cardCreate(board.id, column.id, {});
      };

      // --- BEGIN xeditable stuff

      $scope.checkColumnTitle = function(title, id) {
        if (!title.match(config.regex.columnTitle)) return 'Invalid title';
        api.columnUpdate(board.id, {id: id, title: title});
        // the false returned will close the editor and not update the model.
        // (model update will happen when the event is pushed from the server)
        return false;
      };

      // --- BEGIN drag-drop stuff

      $scope.moveSlot = function($event, $data, cardSlots, destColumnId, position) {

        if ($data.pile) {

          api.boardMovePile(board.id, {
            sourceColumnId: $data.sourceColumnId,
            sourcePosition: $data.sourcePosition,
            destColumnId:   destColumnId,
            destPosition:   position
          });

        } else {  // we're just moving a single card

          var extra = 0;

          if (
            $data.column === destColumnId &&             // same source & destination columns
            position > $data.position     &&             // source occurs higher than destination
            cardSlots[$data.position - 1].length === 1)  // source was not a [multi-card] pile
          {
            extra = 1;
          }

          api.boardMoveCard(board.id, {
            cardId:       $data.id,
            destColumnId: destColumnId,
            destPosition: position - extra
          });
        }
      };

      $scope.moveColumn = function(column, position) {
        api.columnMove(board.id, column.id, position);
      };

    }]);
})();
