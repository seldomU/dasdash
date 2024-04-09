'use strict';
const { Router } = require("express");
const path = require('path');
const util = require('util');
const fs = require('fs');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const commandUtil = require('../util/commandUtil.js');

module.exports = function (settings, state) {

  const router = new Router();
  let logger = settings.logger;

  // get content of file at given path
  router.post('/getfile', async (req, res) => {

    let filePath = req.body.path;
    if (!filePath) {
      res.status(400).send("File path is missing");
      return;
    }

    if (!path.isAbsolute(filePath)) {
      filePath = path.join(settings.contentPath, filePath);
    }

    let fileContent = "";
    try {
      fileContent = await readFile(filePath);
    }
    catch (err) {
      logger.error("getfile: failed to read file", {filePath} );
      res.status(400).send(`Failed to read file at path "${req.body.path}"`);
      return;
    }
    res.send(fileContent);
  })

  // write content to file at given path
  router.post('/file', async (req, res) => {

    if (!req.body.path) {
      res.sendStatus(500);
      return;
    }

    await writeFile(req.body.path, req.body.content);
    res.sendStatus(200);
  })

  // open the item at the given path or URL with the system's default handler
  router.post('/openitem', (req, res) => {
    commandUtil.openItem(req.body.itempath, logger);
    res.send("ok");
  })

  // execute command, ignore its output
  router.post('/runcmd', async (req, res) => {

    let cmd = req.body;
    if(!cmd.io || cmd.io == "terminal"){
      commandUtil.runTerminalCommand(cmd, logger);
    }
    else{
      let err = await commandUtil.runCommand(cmd, logger);
      if(err){
        res.status(400).send(err);
        return;
      }
    }
    res.send("ok");
  })

  // execute command and send its output back
  router.ws('/runfeedbackcmd', async (ws, req) => {
    commandUtil.runFeedbackCommand(ws, req, logger);
  })

  return router;
}