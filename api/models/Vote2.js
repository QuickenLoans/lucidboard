/**
 * Vote
 *
 * @module      :: Model
 * @description :: A vote is a "+1" for a Card
 * @docs		    :: http://sailsjs.org/#!documentation/models
 */

module.exports = {
  connection: 'mysql',

  schema: true,

  attributes: {
    user: { model: 'user2' },
    card: { model: 'card2' },

    toJSON: function() {
      return {
        user: this.user,
        card: this.card
      };
    }
  }

};
