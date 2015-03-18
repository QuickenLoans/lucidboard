(function() {
  'use strict';

  angular.module('hansei.ui')
    .directive('boardSettings', [function() {
      return {
        restrict: 'E',
        templateUrl: '/templates/_boardSettings.html',
        scope: {
          board: '='
        },
        controller: ['$scope', '$state', 'api', 'config', function($scope, $state, api, config) {

          $scope.colsets = config.colsets();

          if ($scope.board) {
            $scope.b = {
              id:             $scope.board.id(),
              title:          $scope.board.title(),
              votesPerUser:   $scope.board.votesPerUser(),
              p_seeVotes:     $scope.board.p_seeVotes(),
              p_seeContent:   $scope.board.p_seeContent(),
              p_combineCards: $scope.board.p_combineCards(),
              p_lock:         $scope.board.p_lock(),
	      location:       window.location.origin
            };
          } else {
            $scope.b = {
              id:             null,
              title:          '',
              colsetId:       '1',
              votesPerUser:   '0',
              p_seeVotes:     true,
              p_seeContent:   true,
              p_combineCards: true,
              p_lock:         false
            };
          }

          $scope.submit = function(data) {

            if (!$scope.b.title) return alert('You must enter a title.');
            if (!String($scope.b.votesPerUser).match(/^\d+$/)) return alert('Invalid max votes.');

            var bits = {
              title:          $scope.b.title,
              colsetId:       $scope.b.colsetId,
              votesPerUser:   $scope.b.votesPerUser,
              p_seeVotes:     !!$scope.b.p_seeVotes,
              p_seeContent:   !!$scope.b.p_seeContent,
              p_combineCards: !!$scope.b.p_combineCards,
              p_lock:         !!$scope.b.p_lock,
            };

            if ($scope.board) {
              api.boardUpdate($scope.board.id(), bits);
            } else {
              api.boardCreate(bits, function(board) {
                $state.go('board', {boardId: board.id});
              });
            }

          };

        }],
      };
    }])

})();
