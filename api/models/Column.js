/**
 * Column
 *
 * @module      :: Model
 * @description :: A column is a set of cards under a board
 * @docs		    :: http://sailsjs.org/#!documentation/models
 */

var _ = require('underscore');

var titleRegex = /^.{1,25}$/;

module.exports = {
  connection: 'mysql',

  schema: true,

  titleRegex: titleRegex,

  attributes: {

    title: {
      type:  'string',
      regex: titleRegex
    },

    position: 'integer',

    board: { model: 'board' },

    cards: {
      collection: 'card',
      via:        'column'
    },

    toJSON: function() {
      return {
        id:       this.id,
        title:    this.title,
        position: this.position,
        board:    this.board,
        cards:    this.cards
      };
    },

  },

  beforeDestroy: function(criteria, cb) {
    if (!criteria.where) {
      return cb('Where criteria expected!');  // i don't know what i'm doing
    }

    Column.find(criteria.where).exec(function(err, columns) {
      if (err) return cb(err);
      Card.destroy({column: _.pluck(columns, 'id')}).exec(cb);
    })
  }

};
