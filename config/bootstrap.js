/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#/documentation/reference/sails.config/sails.config.bootstrap.html
 */

var shortid = require('shortid'),
    async   = require('async');

module.exports.bootstrap = function(cb) {

  // Load in some secret keys from .env
  require('dotenv').load();
  if (!process.env.SESSION_SECRET || !process.env.CRYPTO_KEY) {
    console.error("Crypto tokens were not found. Please generate them with\n\n" +
      "    gulp generateEnv\n");
    process.exit(1);
  }

  // Remove this later
  // Board.find({}).exec(function(err, boards) {
  //   if (err) throw err;
  //   boards.forEach(function(b) {
  //     if (b.private === true || b.private === false) return;
  //     Board.update({id: b.id}, {private: false}, function(err, gg) {
  //       // console.log('er', err);
  //       // console.log('gg', gg);
  //     });
  //   });
  // });
  //
  return cb();

  var date = new Date();
  // console.log('NOW: ' + date);
  // Remove this later
  // Add a shortid to all pages lacking one
  shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,.');
  Board.find({}).exec(function(err, boards) {
    if (err) throw err;
    // console.log(boards[0]);
    // process.exit();
    async.parallel(boards.reduce(function(memo, b) {
      var boardDate = new Date(b.createdAt);
      // console.log('kk', boardDate, date);
      if (boardDate < date) {
        memo.push(function(_cb) {
          console.log('trying..', _cb);
          Board.destroy({id: b.id}).exec(function(err, boards) {
            if (err) throw err;
            console.log('done');
            _cb();
          });
        });
        console.log("deleting " + b.id);
      }
      // memo.push(function(_cb) {
      //   console.log('.');
      //   Board.update({id: b.id}, {shortid: shortid.generate()}, _cb);
      // });
      return memo;
    }, []) || [], function(err) {
      if (err) throw err;
      cb();
    });
  });

  /*
  User.findOne({id:2}).exec(function(err, u) {
    console.log('ok', err, u);
    u.name = 'hahasrswtdoeuoed';
    u.boards = [];
    u.save(function(a,b) {
      console.log('er',a,b);
      console.log('u',u);
    });
  });
  */

  // It's very important to trigger this callback method when you are finished
  // with the bootstrap!  (otherwise your server will never lift, since it's waiting on the bootstrap)
  // cb();
};
