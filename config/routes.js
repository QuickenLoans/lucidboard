/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes map URLs to views and controllers.
 *
 * If Sails receives a URL that doesn't match any of the routes below,
 * it will check for matching files (images, scripts, stylesheets, etc.)
 * in your assets directory.  e.g. `http://localhost:1337/images/foo.jpg`
 * might match an image file: `/assets/images/foo.jpg`
 *
 * Finally, if those don't match either, the default 404 handler is triggered.
 * See `api/responses/notFound.js` to adjust your app's 404 logic.
 *
 * Note: Sails doesn't ACTUALLY serve stuff from `assets`-- the default Gruntfile in Sails copies
 * flat files from `assets` to `.tmp/public`.  This allows you to do things like compile LESS or
 * CoffeeScript for the front-end.
 *
 * For more information on configuring custom routes, check out:
 * http://sailsjs.org/#/documentation/concepts/Routes/RouteTargetSyntax.html
 */

var jsapp = { view: 'main' };

module.exports.routes = {

  /***************************************************************************
  *                                                                          *
  * Make the view located at `views/homepage.ejs` (or `views/homepage.jade`, *
  * etc. depending on your default view engine) your home page.              *
  *                                                                          *
  * (Alternatively, remove this and add an `index.html` file in your         *
  * `assets` directory)                                                      *
  *                                                                          *
  ***************************************************************************/

  // Sign in
  'POST /api/signin': {
    controller: 'UserController',
    action:     'signin'
  },

  // Sign in with token
  'POST /api/refresh-token': {
    controller: 'UserController',
    action:     'refreshToken'
  },

  'POST /api/subscribe': {
    controller: 'UserController',
    action:     'subscribe'
  },

  'POST /api/unsubscribe': {
    controller: 'UserController',
    action:     'unsubscribe'
  },

  // Board list get
  'GET /api/boards': {
    controller: 'BoardController',
    action:     'getList'
  },

  // Board Get (Full!)
  'GET /api/boards/:shortid': {
    controller: 'BoardController',
    action:     'findByShortid'
  },

  // Board Create
  'POST /api/boards': {
    controller: 'BoardController',
    action:     'create'
  },

  // Board Update
  'POST /api/boards/:id': {
    controller: 'BoardController',
    action:     'update'
  },

  // Board: Move card
  'POST /api/boards/:id/move-card': {
    controller: 'BoardController',
    action:     'moveCard'
  },

  // Board: Combine cards
  'POST /api/boards/:id/combine-cards': {
    controller: 'BoardController',
    action:     'combineCards'
  },

  // Board: Combine piles
  'POST /api/boards/:id/combine-piles': {
    controller: 'BoardController',
    action:     'combinePiles'
  },

  // Board: Move pile
  'POST /api/boards/:id/move-pile': {
    controller: 'BoardController',
    action:     'movePile'
  },

  // Board: Card flip (new card on top of pile)
  'POST /api/boards/:id/card-flip': {
    controller: 'BoardController',
    action:     'cardFlip'
  },

  // Board: Start timer
  'POST /api/boards/:id/timer-start': {
    controller: 'BoardController',
    action:     'timerStart'
  },

  // Board: Sort by Votes
  'POST /api/boards/:id/sort-by-votes': {
    controller: 'BoardController',
    action:     'sortByVotes'
  },

  // Board: Obliterate all the cards
  'POST /api/boards/:id/obliterate-cards': {
    controller: 'BoardController',
    action:     'obliterateCards'
  },

  // Board: Pause timer
  'POST /api/boards/:id/timer-pause': {
    controller: 'BoardController',
    action:     'timerPause'
  },

  // Board: Lock a card
  'POST /api/boards/:id/lock-card': {
    controller: 'CardController',
    action:     'lock'
  },

  // Board: Unlock a card
  'POST /api/boards/:id/unlock-card': {
    controller: 'CardController',
    action:     'unlock'
  },

  // Board: Vaporize a card
  'POST /api/boards/:id/vaporize-card': {
    controller: 'CardController',
    action:     'vaporize'
  },

  // Board: Delete
  'DELETE /api/boards/:id': {
    controller: 'BoardController',
    action:     'delete'
  },

  // Column Create
  'POST /api/boards/:boardId/columns': {
    controller: 'ColumnController',
    action:     'create'
  },

  // Column Update
  'POST /api/boards/:boardId/columns/:columnId': {
    controller: 'ColumnController',
    action:     'update'
  },

  // Column Move
  'POST /api/boards/:boardId/columns/:columnId/move': {
    controller: 'ColumnController',
    action:     'move'
  },

  // Column Delete
  'DELETE /api/boards/:boardId/columns/:columnId': {
    controller: 'ColumnController',
    action:     'delete'
  },

  // Card Create
  'POST /api/boards/:boardId/columns/:columnId/cards': {
    controller: 'CardController',
    action:     'create'
  },

  // Card Update
  'POST /api/boards/:boardId/columns/:columnId/cards/:cardId': {
    controller: 'CardController',
    action:     'update'
  },

  // Card Upvote
  'POST /api/boards/:shortid/columns/:columnId/cards/:cardId/upvote': {
    controller: 'CardController',
    action:     'upvote'
  },

  // Card Unupvote
  'POST /api/boards/:boardId/columns/:columnId/cards/:cardId/unupvote': {
    controller: 'CardController',
    action:     'unupvote'
  },

  // Card Colorize
  'POST /api/boards/:boardId/columns/:columnId/cards/:cardId/color': {
    controller: 'CardController',
    action:     'color'
  },

  // Get the config
  'GET /api/config': {
    controller: 'BoardController',
    action:     'config'
  },

  // Delegate an admin
  'POST /api/delegate-admin': {
    controller: 'UserController',
    action:     'delegateAdmin'
  },

  // Board Export (CSV)
  'GET /boards/:shortid/export/csv': {
    controller: 'ExportController',
    action:     'csv'
  },


  'GET /':                   jsapp,
  'GET /signin':             jsapp,
  'GET /boards':             jsapp,
  'GET /archived-boards':    jsapp,
  'GET /boards/:shortid':    jsapp,
  'GET /boards/where/:type': jsapp,
  'GET /admin-delegation':   jsapp
};
