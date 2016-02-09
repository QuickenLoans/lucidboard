(function() {
  'use strict';

  angular.module('hansei.ui')

  .controller('HeaderCtrl', ['$rootScope', '$scope', '$state', '$stateParams', '$location',
    'api', 'user', 'board', 'timer', 'view', 'config',
    function($rootScope, $scope, $state, $stateParams, $location, api, user, board, timer, view, config) {

      $scope.user    = user;
      $scope.board   = board;
      $scope.view    = view;
      $scope.signout = function(event) { $state.go('signin'); };
      $scope.current = $state.current;

      $scope.signout = function(event) {
        user.signout();
        $state.go('signin');
      };

      $scope.toggleTimerForm = function($event) {
        view.timer.toggleForm(undefined, $event);
        if (view.timer.showForm) view.timer.popTheClock();
      };

      $scope.sortByVotes = function() {
        api.boardSortByVotes(board.id);
      };

      $scope.wipeBoard = function() {
        if (confirm("This will drop all cards on the board and in the trash.\n\nAre you sure?")) {
          api.boardWipe(board.id);
        }
      };

      $scope.goFullScreen = function() {
        var element = document.documentElement;
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
          element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
          element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
          element.msRequestFullscreen();
        }
      }

      var updateBoardMeta = function() {
        $scope.mailtoSubject = config.appname + ': ' + board.title;
        $scope.mailtoBody = user.name + ' would like to share a link to a board: ' +
          $location.protocol() + '://' + $location.host() + '/boards/' + board.slug;
      };
      $scope.$watch('board.title', updateBoardMeta);

      $scope.checkBoardTitle = function(title) {
        api.boardUpdate(board.id, {title: title});
        // the false returned will close the editor and not update the model.
        // (model update will happen when the event is pushed from the server)
        return false;
      };

      function showBoardNav() {
        if ($stateParams.slug !== board.slug) {  // make sure they are actually at the right url
          $state.go('board', {slug: board.slug});
          return;
        }
        view.init(board);
        view.column.setOptionsByBoard(board);
        $scope.showBoardNav = true;
      }

      if ($state.current.name === 'board') {
        showBoardNav();
      }

      $rootScope.$on('$stateChangeSuccess', function(event, toState) {
        $scope.current = toState;
        if (toState.name === 'board') {
          showBoardNav();
        } else {
          $scope.showBoardNav = false;
        }
      });

      $rootScope.$on('ANGULAR_DRAG_START', function(event, channel, card) {
        $rootScope.$apply(function() {
          if (channel === 'card')   view.cardDragging = true;
          if (channel === 'column') view.columnDragging = true;
        })
      });

      $rootScope.$on('ANGULAR_DRAG_END', function(event, channel, card) {
        if (channel === 'card')   view.cardDragging = false;
        if (channel === 'column') view.columnDragging = false;
      });
    }]);
})();
