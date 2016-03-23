/**
 * User
 *
 * @module      :: Model
 * @description :: A user
 * @docs		    :: http://sailsjs.org/#!documentation/models
 */

var
  md5           = require('MD5'),
  // crypto        = require('crypto'),
  usernameRegex = /^[a-zA-Z0-9_]{2,20}$/;

module.exports = {
  connection: 'mysql',

  schema: true,

  usernameRegex: usernameRegex,

  attributes: {
    name: {
      type: 'string',
      regex: usernameRegex,
      unique: true
    },

    email: {
      type: 'string',
      unique: true,
      required: true
    },

    admin: {
      type: 'boolean',
      defaultsTo: false
    },

    // gravatarHash: {
    //   type: 'string'
    // },
    // password: {
    //   type: 'string',
    //   required: true
    // },

    boards: {
      collection: 'board',
      via:        'creator'
    },

    cards: {
      collection: 'card',
      via:        'creator'
    },

    toJSON: function() {
      return {
        id:    this.id,
        name:  this.name,
        token: this.buildToken(),
        admin: this.admin
      };
    },

    buildToken: function() {
      switch (sails.config.app.signin) {
        case 'dumb':
          return this.id;
        case 'ldap':
          return this.id + '.' + md5(this.id, sails.config.crypto.key);
        default:
          throw 'Invalid signin setting in app configuration.';
      }
    },

    verifyToken: function(token) {
      return token === this.buildToken();
    }
  },

  findByToken: function(token, cb) {
    var bits = String(token).split(/\./);

    if (!bits[0].match(/^\d+$/)) return false;

    this.findOneById(bits[0]).exec(function(err, user) {
      if (err)                      return cb(err);
      if (!user)                    return cb();
      if (!user.verifyToken(token)) return cb();

      cb(null, user);
    });
  }

  // beforeCreate: function (attrs, next) {
  //   var bcrypt = require('bcrypt');
  //
  //   bcrypt.genSalt(10, function(err, salt) {
  //     if (err) return next(err);
  //
  //     bcrypt.hash(attrs.password, salt, function(err, hash) {
  //       if (err) return next(err);
  //
  //       attrs.password     = hash;
  //       attrs.gravatarHash = crypto.createHash('md5').update(
  //         attrs.email.toLowerCase()
  //       ).digest('hex');
  //
  //       next();
  //     });
  //   });
  // }

};
