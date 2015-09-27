#! /usr/bin/env node

var fs           = require('fs')
var path         = require('path')
var msgs         = require('ssb-msgs')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var explain      = require('explain-error')
var ssbKeys      = require('ssb-keys')
var stringify    = require('pull-stringify')
var createHash   = require('multiblob/util').createHash
var parse        = require('mynosql-query')
var config       = require('ssb-config/inject')(process.env.ssb_appname)
var muxrpcli     = require('muxrpcli')
var cmdAliases   = require('./lib/cli-cmd-aliases')

var createSbot   = require('./')
  .use(require('./plugins/master'))
  .use(require('./plugins/gossip'))
  .use(require('./plugins/friends'))
  .use(require('./plugins/replicate'))
  .use(require('./plugins/blobs'))
  .use(require('./plugins/invite'))
  .use(require('./plugins/block'))
  .use(require('./plugins/local'))
  .use(require('./plugins/logging'))
  .use(require('./plugins/private'))
  //TODO fix plugins/local

var keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))

if(keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported,'+
                  'please delete' + path.join(config.path, 'secret'))

var manifestFile = path.join(config.path, 'manifest.json')

if (process.argv[2] == '--help') {
  console.log(
"sbot is a scuttlebutt server \n\
\n\
Commands:\n\
  server - starts the sbot server\n\
  whoami - see your current identity\n\
  publish - post a message\n\
  invite - create invites for a pub server. e.g. sbot invite.create 100\n\
  accept - manually input an invite\n\
\n\
see https://github.com/ssbc/docs for more details"
)
  return
}

// special server command
if (process.argv[2] == 'server') {
  config.keys = keys
  var server = createSbot(config)
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))
  return
}

// read manifest.json
var manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestFile))
} catch (err) {
  throw explain(err,
    'no manifest file'
    + '- should be generated first time server is run'
  )
}

// connect
createSbot.createClient({keys: keys})({port: config.port, host: config.host||'localhost', key: keys.id}, function (err, rpc) {
  if(err) throw err

  // add aliases
  for (var k in cmdAliases) {
    rpc[k] = rpc[cmdAliases[k]]
    manifest[k] = manifest[cmdAliases[k]]
  }

  // add some extra commands
  manifest.version = 'async'
  manifest.config = 'sync'
  rpc.version = function (cb) {
    console.log(require('./package.json').version)
    cb()
  }
  rpc.config = function (cb) {
    console.log(JSON.stringify(config, null, 2))
    cb()
  }

  // run commandline flow
  muxrpcli(process.argv.slice(2), manifest, rpc)
})
