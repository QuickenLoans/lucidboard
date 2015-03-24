// Holds info related to the screen's state
(function() {
  'use strict';
  angular.module('hansei.services')
    .factory('view', [function() {

      var defaultColumn = {id: 0, label: 'View All'};

      return {
        init: function() {
          this.tab.current = 'board';
          this.column.options = [defaultColumn];
          this.column.current = defaultColumn;
        },

        cardDragging:   false,
        columnDragging: false,

        tab: {
          current: 'board',
          switch: function(tabName) {
            this.current = tabName;
          }
        },

        column: {
          options: [defaultColumn],
          current: defaultColumn,
          isAll: function() { return this.current && this.current.id === 0; },
          setOptions: function(opts) {
            this.options = [defaultColumn].concat(opts);
            this.current = this.options[0];
          }
        }
      };

    }])
})();
