'use strict';
const express = require('express')
var expressWs = require('express-ws');
const path = require('path');

function startServer(settings, state) {

  const app = express();
  let logger = settings.logger;

  // support websocket routes
  // this allows the server to stream command results back to the client
  expressWs(app);

  // don't allow remote clients
  app.use((req, res, next) => {
    if (req.ip === "127.0.0.1" || req.ip === "::ffff:127.0.0.1" || req.ip === "::1") {
      next();
      return;
    }
    // it's a remote request. respond nothing.
  })

  // static files
  app.use('/', express.static(path.join(__dirname, "..", 'client')));
  app.use('/pages', express.static(settings.contentPath) );
  app.use('/extensions', express.static( path.join(settings.contentPath, "_clientextensions") ) );
  app.use('/assets', express.static( path.join(settings.contentPath, "_assets") ))

  // parse json body contents before route handlers run
  app.use(express.json());

  // API routes
  // load them after initializing expressWs,
  // because that adds the .ws() method to the Router prototype
  const getAPI1 = require('./api1.js');
  app.use('/api', getAPI1(settings, state));

  // mount API extensions
  for(let [routeName, filePath] of Object.entries(settings.apiExtensions) ){
    let apiExtensionPath = path.join(settings.contentPath, "_serverextensions", filePath );
    let router = new express.Router();
    // populate router
    require(apiExtensionPath)(router);
    app.use( '/apiext/' + routeName, router );
  }

  let server = app.listen(settings.serverPort);
  logger.info("server running", {
    folder: settings.contentPath, 
    url: "http://localhost:" + server.address().port
  });

  return server;
}

module.exports = startServer;