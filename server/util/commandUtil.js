'use strict';
const fs = require('fs-extra');
const psTree = require('ps-tree');
const open = require('open');

const debug = false;

// execa comes in ESM format
let execa;
(async () => {
    ({ execa } = await import("execa"))
})();

// find terminal
let terminalApp;
(async () => {
    if(process.platform != "linux"){
        return;
    }

    let possibleApps = [
        { path: '/usr/bin/gnome-terminal', arg: '--' },
        { path: '/usr/bin/konsole', arg: '-e' },
        { path: '/usr/bin/terminal', arg: '-e' },
        { path: '/usr/bin/xterm', arg: '-e' }
    ]

    terminalApp = possibleApps.find( 
        async (x) => {return await fs.pathExists(x)} 
    );
})()

const BashExit = `printf "\n\n"
read -p "Press any key to close" -n 1 
exit 1`;

// returns childprocess spawn options, created from command
function getProcessOptions(command) {
    return {
        cwd: command.cwd || process.cwd(),
        env: Object.assign({}, process.env, command.env || {})
    };
}

// logs a description of the command
function logProcessStart(command, processOptions, logger) {
    logger.info("executing command", {
        cmd: command.cmd, 
        cwd: processOptions.cwd, 
        env: JSON.stringify(command.env || {})
    });
}

async function runCommand(command, logger){

    let processOptions = getProcessOptions(command);
    if (debug) {
        logProcessStart(command, processOptions, logger);
    }

    // report errors only for short-lived processes
    let waitForErrors = 3000; // ms
    try{
        await Promise.race([
            spawnProcess(command.cmd, processOptions),
            new Promise(res => setTimeout(res, waitForErrors))
        ])
    }catch(err){
        logger.error(err);
        return err;
    }

    return;
}

async function runTerminalCommand(command, logger){
    let processOptions = getProcessOptions(command);
    if (debug) {
        logProcessStart(command, processOptions, logger);
    }

    processOptions.stdio = "ignore";
    // returns terminal process, wrapping around the actual process
    try{
        let terminalProcPromise = spawnTerminalProcess(command.cmd, processOptions);
        if(terminalProcPromise){
            terminalProcPromise.unref();
        }
        terminalProcPromise.catch(logger.error)
    }
    catch(err){
        logger.error(err);
    }
}


// creates a child process based a command received via
// websocket, sends the process output back over the socket
function runFeedbackCommand(ws, req, logger) {

    let command;    // command string, working directory, environment variables
    let cmdProcess;   // command child process

    ws.onclose = ev => {
        if (cmdProcess && !cmdProcess.exited) {
            logger.info("Killing proc. Client closed connection.", {
                pid: cmdProcess.pid,
                cmd: command.cmd
            });
            killProcess(cmdProcess);
        }
    }

    ws.onmessage = msgEV => {
        let msg;
        try {
            msg = JSON.parse(msgEV.data);
        }
        catch (err) {
            logger.error("failed to parse string: " + msgEV.data);
            logger.error("error: " + err.message);
            return;
        }

        switch (msg.type) {

            case "runcmd": {
                command = msg.command;
                let sendMessage = msg => ws.send(JSON.stringify(msg));
                cmdProcess = setupFeedbackProcess(command, sendMessage, logger);
                break;
            }

            case "kill": {
                if(cmdProcess){
                    logger.info("Killing proc on user request.", {
                        pid: cmdProcess.pid,
                        cmd: command.cmd
                    });
                    killProcess(cmdProcess);
                    cmdProcess = null;
                }
                break;
            }

            default: {
                logger.info("unhandled socket msg: ", msgEV.data);
            }
        }
    }
}

// creates child process for the given command and
// hooks the process event handlers to sendMessage 
function setupFeedbackProcess(command, sendMessage, logger) {

    let processOptions = getProcessOptions(command);
    logProcessStart(command, processOptions, logger);

    let proc;
    try{
        proc = spawnProcess(command.cmd, processOptions);
    }
    catch(err){
        logger.error(err);
        sendMessage({ error: JSON.stringify(err, null, '\t') });
        return null;
    }

    proc.stdout.on('data', stdout => { sendMessage({ stdout: stdout.toString() }) })

    proc.stderr.on('data', stderr => { sendMessage({ stderr: stderr.toString() }) })

    proc.on("exit", (code, signal) => {
        proc.exited = true;
        sendMessage({ exit: { code, signal } });
    });

    proc.on("error", err => {
        sendMessage({ error: JSON.stringify(err, null, '\t') });
    });

    return proc;
}

// opens the given file path or URL with the system's default application
let openItem = (item, logger) => {
    logger.info("opening item " + item);
    open(item);   // no need to await
}

// runs the given command in a bash
function spawnProcess(commandString, options) {
    options.shell = true;
    return execa(commandString, options);
}

// runs the given command in a bash inside a terminal
function spawnTerminalProcess(commandString, options, logger) {
    switch(process.platform){
        case "darwin":
            return execa( 'osascript', ['-e', `tell app "Terminal" to do script "${commandString}"`], options);

        case "win32":
            options.shell = true;
            //let printCmd = `echo running ${commandString.replace(/"/g, '\\\"')} && echo In path: ${options.cwd} && ${commandString} && echo. && echo.`;
            let cmd = `${commandString} && set /p userExitkey=Press any key to close`;
            return execa( 'start', ['cmd', '/c', `"${cmd}"`], options);

        case "linux":{
            //const boldStart = "\\033[1m", boldEnd = "\\033[0m";
            //const printCmd = `printf "Running cmd ${boldStart}${commandString.replace(/"/g, '\\\"')}${boldEnd}\nIn path: ${options.cwd}\n\n";`;
            let cmd = `${commandString}; ${BashExit}`;
            if(terminalApp){
                return execa(terminalApp.path, [terminalApp.arg, 'bash', '-c', `${cmd}`], options);
            }else{
                logger.error("No terminal app found.");
                return null;
            }            
        }
        default:
            logger.error("No terminal app defined for this platform.");
            return null;
    }
}

// ends the given process and its child processes
function killProcess(proc) {

    // proc.kill('SIGINT') doesn not include its child processes
    // which, when using a shell, would be the one process we intend to kill

    psTree(proc.pid, (err, children) => {
        execa('kill', children.map(p => p.PID));
    });
}

module.exports = { 
    runCommand, 
    runTerminalCommand, 
    runFeedbackCommand, 
    openItem 
}
