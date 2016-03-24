module.exports.connections = {
  mysql: {
    module:   'sails-mysql',
    host:     'localhost',
    port:     3306,
    user: 'lucidboard',
    password: 'coeudoecudocudcoud',
    database: 'lucidboard_dev',
    charset:  'utf8'
  },
  redis: {
    adapter: 'sails-redis',
    port: 6379,
    host: 'localhost',
    password: null,
    database: null,
    options: {
      // low-level configuration
      // (redis driver options)
      // parser: 'hiredis',
      // return_buffers: false,
      // detect_buffers: false,
      // socket_nodelay: true,
      // no_ready_check: false,
      // enable_offline_queue: true
    }
  }
};
