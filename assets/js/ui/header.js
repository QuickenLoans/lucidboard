(function() {
  'use strict';

  angular.module('hansei.ui')

  .controller('HeaderCtrl', ['$rootScope', '$scope', '$state', '$timeout', '$interval', 'api', 'board',
    function($rootScope, $scope, $state, $timeout, $interval, api, board) {

      if (!board.loaded()) return;  // No more logic things if there is no board.

      var timer;

      $scope.board             = board;
      // $scope.b                 = board.obj();
      $scope.timerMinutesInput = 5;
      $scope.timerLeft         = 0;
      $scope.showTimerForm     = false;

      var startTimer = function(bits) {
        var sound          = new Audio();
        sound.src          = '/sounds/ding.mp3';
        $scope.timerLeft   = bits.seconds;

        $interval.cancel(timer);

        timer = $interval(function() {
          $scope.timerLeft -= 1;
          if ($scope.timerLeft <= 0) {
            $scope.timerLeft = 0;
            sound.play();
            $interval.cancel(timer);
          }
        }, 1000);
      };

      if (board.timerLeft() > 0) {
        startTimer({seconds: board.timerLeft()});
      }

      $scope.timerStart = function(minutes) {
        $scope.showTimerForm = false;
        api.timerStart(board.id(), minutes * 60);
      };

    }]);
})();
