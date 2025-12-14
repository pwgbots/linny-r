/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (console.js) implements the console version of
Linny-R that can be run in Node.js without a web browser. It defines
console versions of the classes FileManager, Monitor, and
RepositoryBrowser, and takes care of the interaction between the
Virtual Machine and the solver.

NOTE: For browser-based Linny-R, this file should NOT be loaded, as it
      requires Node.js modules.
*/

/*
Copyright (c) 2017-2026 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Set global flag to indicate that this is a Node.js application.
// This will make the "module" files linny-r-xxx.js export their properties.
global.NODE = true;

const
    WORKING_DIRECTORY = process.cwd(),
    path = require('path'),
    MODULE_DIRECTORY = path.join(WORKING_DIRECTORY, 'node_modules', 'linny-r'),
    // Load the required Node.js modules.
    child_process = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    readline = require('readline'),
    // Get the platform name (win32, macOS, linux) of the user's computer.
    PLATFORM = os.platform(),
    // Get version of the installed Linny-R package.
    VERSION_INFO = getVersionInfo();
    
function getVersionInfo() {
  // Read version info from `package.json`.
  const info = {
      current: 0,
      current_time: 0,
      latest: '0',
      latest_time: 0,
      up_to_date: false
    };
  try {
    info.current = require('./package.json').version;
  } catch(err) {
    console.log('ERROR: Failed to read package.json');
    console.log(err);
    console.log('This indicates that Linny-R is not installed properly.');
    process.exit();    
  }
  // NOTE: Unlike the Linny-R server, the console does not routinely
  // check whether version is up-to-date is optional because this is
  // a time-consuming action that would reduce multi-run performance.
  // See command line options (much further down).
  console.log('\nLinny-R Console version', info.current);
  return info;
}

// Output some configuration information to the console
console.log('Node.js version:', process.version);
console.log('Platform:', PLATFORM, '(' + os.type() + ')');
console.log('Module directory:', MODULE_DIRECTORY);
console.log('Working directory:', WORKING_DIRECTORY);

// Currently, these external solvers are supported:
const SUPPORTED_SOLVERS = ['gurobi', 'cplex', 'scip', 'lp_solve'];

const
    // Load the MILP solver (dependent on Node.js: `fs`, `os` and `path`)
    MILPSolver = require('./static/scripts/linny-r-milp.js'),
    // Load the browser-compatible Linny-R scripts
    config = require('./static/scripts/linny-r-config.js'),
    utils = require('./static/scripts/linny-r-utils.js'),
    vm = require('./static/scripts/linny-r-vm.js'),
    model = require('./static/scripts/linny-r-model.js'),
    ctrl = require('./static/scripts/linny-r-ctrl.js');
    
// NOTE: The variables, functions and classes defined in these scripts
// must still be "imported" into the global scope of this Node.js script.
for(let k in config) if(config.hasOwnProperty(k)) global[k] = config[k];
for(let k in utils) if(utils.hasOwnProperty(k)) global[k] = utils[k];
for(let k in vm) if(vm.hasOwnProperty(k)) global[k] = vm[k];
for(let k in model) if(model.hasOwnProperty(k)) global[k] = model[k];
for(let k in ctrl) if(ctrl.hasOwnProperty(k)) global[k] = ctrl[k];

// Default settings are used unless these are overruled by arguments on
// the command .
const usage = `
Usage:  node console [options]

Possible options are:
  channel=[identifier]  will start listening at the specified channel
                        (FUTURE OPTION)
  check                 will report whether current version is up-to-date
  data-dir=[path]       will look for series data files in [path] instead of
                        (Linny-R)/user/data
  model=[path]          will load model file specified by [path]
                        (relative paths are searched for in (Linny-R)/user/models)
  report=[name]         will write run results to [name]-series.txt and
                        [name]-stats.txt in (workspace)/reports
  run                   will run the loaded model
  solver=[name]         will select solver [name], or warn if not found
                        (name choices: Gurobi, CPLEX, MOSEK, SCIP or LP_solve)
  user=[identifier]     user ID will be used to log onto remote servers
  verbose               will output solver messages to the console
  workspace=[path]      will create workspace in [path] instead of (Linny-R)/user
  xrun=[title#list]     will perform experiment runs in given range
                        (list is comma-separated sequence of run numbers)
`;

const SETTINGS = commandLineSettings();
    
// The workspace defines the paths to directories where Linny-R can write files
const WORKSPACE = createWorkspace();
    
// Only then require the Node.js modules that are not "built-in"
// NOTE: the function serves to catch the error in case the module has
// not been installed with `npm`.
const { DOMParser } = checkNodeModule('@xmldom/xmldom');

function checkNodeModule(name) {
  // Catches the error if Node.js module `name` is not available
  try {
    return require(name);
  } catch(err) {
    console.log(`ERROR: Node.js module "${name}" needs to be installed first`);
    process.exit();
  }
}

// Add the XML parser to the global scope so it can be referenced by the
// XML-related functions defined in `linny-r-utils.js`.
global.XML_PARSER = new DOMParser();

// Set the current version number.
global.LINNY_R_VERSION = VERSION_INFO.current;

///////////////////////////////////////////////////////////////////////////////
//     Class definitions must precede instatiation of Linny-R components     //
///////////////////////////////////////////////////////////////////////////////

// CLASS ConsoleMonitor provides the UI for the Virtual Machine, including the
// connection with the solver, directly via the file system and sub-process
// functions of Node.js
class ConsoleMonitor {
  constructor() {
    this.console = true;
    this.visible = false;
    // The "show log" flag indicates whether log messages should be output
    // to the console (will be ignored by the GUIMonitor).
    this.show_log = false;
    this.block_number = 0;
  }
  
  logMessage(block, msg) {
    // Output a solver message to the console if logging is activated.
    let new_block = false;
    if(block > this.block_number) {
      this.block_number = block;
      new_block = true;
    }
    if(this.show_log) {
      // Mark advance to nex block with a blank line.
      if(new_block) console.log('\nBlock #', block);
      console.log(msg);
    }
    // Always log solver message to receiver report.
    if(new_block) RECEIVER.log('Block #' + block, true);
    RECEIVER.log(msg, true);
  }

  logOnToServer() {
    VM.solver_user = '';
    VM.solver_token = 'local host';
    VM.solver_id = SOLVER.id;
  }

  connectToServer() {
    // Console always uses local server => no logon prompt.
    this.logOnToServer();
    return true;
  }

  submitBlockToSolver() {
    let top = MODEL.timeout_period;
    if(VM.max_solver_time && top > VM.max_solver_time) {
      top = VM.max_solver_time;
      UI.notify('Solver time limit for this server is ' +
          VM.max_solver_time + ' seconds');
    }
    try {
      const data = SOLVER.solveBlock(
          new URLSearchParams({
            action: 'solve',
            user: VM.solver_user,
            token: VM.solver_token,
            block: VM.block_count,
            round: VM.round_sequence[VM.current_round],
            columns: VM.columnsInBlock,
            data: VM.lines,
            solver: MODEL.preferred_solver,
            timeout: top,
            inttol: MODEL.integer_tolerance,
            mipgap: MODEL.MIP_gap
          }));
      VM.processServerResponse(data);
      const msg =
          `Solving block #${VM.blockWithRound} took ${VM.elapsedTime} seconds.`;
      VM.logMessage(VM.block_count, msg);
      console.log(msg);
      // Solve next block (if any).
      // NOTE: Use setTimeout so that this calling function returns
      // and hence frees its local variables.
      setTimeout(() => VM.solveBlocks(), 1);
    } catch(err) {
      console.log(err);
      const msg = 'SOLVER ERROR: ' + ellipsedText(err.toString());
      VM.logMessage(this.block_count, msg);
      UI.alert(msg);
      VM.stopSolving();
    }
  }
  
  // Dummy methods called by VM, but meaningful only for the GUI monitor
  reset() {}
  updateMonitorTime() {}
  updateBlockNumber() {}
  addProgressBlock() {}
  showBlock() {}
  updateDialog() {}
  updateContent() {}
  showCallStack() {}
  hideCallStack() {}
  setRunMessages() {}

} // END of class ConsoleMonitor


// CLASS ConsoleFileManager allows loading and saving models and diagrams, and
// handles the interaction with the MILP solver via `exec` calls and files
// stored on the modeler's computer
class ConsoleFileManager {

  anyOSpath(p) {
    // Helper function that converts any path notation to platform notation
    // based on the predominant separator.
    const
       s_parts = p.split('/'),
       bs_parts = p.split('\\'),
       parts = (s_parts.length > bs_parts.length ? s_parts : bs_parts);
    // On macOS machines, paths start with a slash, so first substring is empty.
    if(parts[0].endsWith(':') && path.sep === '\\') {
      // On Windows machines, add a backslash after the disk (if specified).
      parts[0] += path.sep;
    }
    // Reassemble path for the OS of this machine.
    return path.join(...parts);
  }
  
  asFilePath(s, no_sep=false) {
    // Return string `s` with whitespace converted to a single dash, and
    // special characters (also periods!) converted to underscores.
    // NOTE: Permit functional use of directory separator unless `no_sep`
    // is FALSE.
    const sanitize = (str) => str.trim()
        // Consider dashes, commas and (semi)colons as whitespace, and
        // condense all such "whitespace" into a single dash.
        .replace(/[\s\-\,\;\:]+/g, '-')
        // Condense special characters into a single underscore.
        .replace(/[^A-Za-z0-9_\-]+/g, '_')
        // No leading or trailing dashes or underscores.
        .replace(/^[\-\_]+|[\-\_]+$/g, '');
    s = s.trim().normalize('NFKD');
    if(no_sep) return sanitize(s);
    // When path is acceptable, split at both '/' and '\', because
    // names may be constructed on different OS platforms.
    return s.trim().split(/\/|\\/)
        .map((p) => sanitize(p))
        // Remove empty strings.
        .filter((p) => p)
        // Use the OS platform separator to reconstruct the path.
        .join(path.sep);
  }

  getRemoteData(dataset, url) {
    // Gets data from a URL, or from a file on the local host 
    if(url === '') return;
    // NOTE: add this dataset to the "loading" list...
    addDistinct(dataset, MODEL.loading_datasets);
    // ... and allow for 3 more seconds (6 times 500 ms) to complete.
    MODEL.max_time_to_load += 6;
    // Passed parameter is the URL or full path.
    console.log('Load data from', url);
    if(!url) {
      console.log('ERROR: No URL or path');
      return;
    }
    if(url.toLowerCase().startsWith('http')) {
      // URL => validate it, and then try to download its content as text.
      try {
        new URL(url); // Will throw an error if URL is not .
        getTextFromURL(url,
            (data) => FILE_MANAGER.setData(dataset, data),
            (error) => {
                console.log(error);
                console.log('ERROR: Failed to get data from', url);
              }
          );
      } catch(err) {
        console.log(err);
        console.log('ERROR: Invalid URL', url);
      }
    } else {
      let fp = this.anyOSpath(url);
      if(!(fp.startsWith('/') || fp.startsWith('\\') || fp.indexOf(':\\') > 0)) {
        // Relative path => add path to specified data path or to the
        // default location user/data.
        fp = path.join(SETTINGS.data_path || WORKSPACE.data, fp);
        console.log('Full path: ', fp);
      }
      fs.readFile(fp, 'utf8', (err, data) => {
          if(err) {
            console.log(err);
            return `ERROR: Could not read file <tt>${fp}</tt>`;
          } else {
            FILE_MANAGER.setData(dataset, data);
          }
        });
    }
  }

  setData(dataset, data) {
    if(data !== '' && UI.postResponseOK(data)) {
      // Server must return either semicolon-separated or
      // newline-separated string of numbers.
      if(data.indexOf(';') < 0) {
        // If no semicolon found, replace newlines by semicolons.
        data = data.trim().split('\n').join(';');
      }
      // Remove all white space.
      data = data.replace(/\s+/g, '');
      dataset.unpackDataString(data);
      // NOTE: Remove dataset from the "loading" list.
      const i = MODEL.loading_datasets.indexOf(dataset);
      if(i >= 0) MODEL.loading_datasets.splice(i, 1);
    }
  }

  decryptIfNeeded(data, callback) {
    // Check whether XML is encrypted; if not, processes data "as is",
    // otherwise decrypt using password specified in command line.
    if(data.indexOf('model latch="') < 0) {
      setTimeout(callback, 0, data);
      return;
    }
    const xml = XML_PARSER.parseFromString(data, 'text/xml');
    const de = xml.documentElement;
    // Linny-R model must contain a model node.
    if(de.nodeName !== 'model') throw 'XML document has no model element';
    const encr_msg = {
          encryption: nodeContentByTag(de, 'content'),
          latch: nodeParameterValue(de, 'latch')
        };
    console.log('Decrypting...');
    // NOTE: Function `tryToDecrypt` is defined in linny-r-utils.js.
    setTimeout((msg, pwd, ok, err) => tryToDecrypt(msg, pwd, ok, err), 5,
        encr_msg, SETTINGS.password,
        // The on_ok function.
        (data) => {
            if(data) callback(data);
          },
        // The on_error function.
        (err) => {
            console.log(err);
            console.log('Failed to load encrypted model');
          });
  }
  
  loadModel(fp, callback) {
    // Get the XML of the file specified via the command line.
    fs.readFile(fp, 'utf8', (err, data) => {
        if(err) {
          console.log(err);
          console.log('ERROR: Could not read file '+ fp);
        } else {
          FILE_MANAGER.decryptIfNeeded(data,
              (data) => { if(MODEL.parseXML(data)) callback(MODEL); });
        }
      });
  }

  writeStringToFile(s, fp) {
    // Write string `s` to path `fp`.
    try {
      fs.writeFileSync(fp, s);
      console.log(pluralS(s.length, 'character') + ' written to file ' + fp);
    } catch(err) {
      console.log(err);
      console.log('ERROR: Failed to write data to file ' +  fp);
    }
  }

} // END of class ConsoleFileManager

// CLASS ConsoleReceiver defines a listener/interpreter for channel commands.
class ConsoleReceiver {
  constructor() {
    // NOTE: Each receiver instance listens to a "channel", being the
    // directory on the local host specified by the modeler.
    this.channel = '';
    // The file name is the name of the first Linny-R model file or
    // command file that was found in the channel directory.
    this.file_name = '';
    // The name of the experiment to be run can be specified in a
    // command file.
    this.experiment = '';
    // The call-back script is the path to file with a shell command.
    this.call_back_script = '';
    this.active = false;
    this.solving = false;
    this.interval = 1000;
    this.error = '';
    this.log_lines = [];
  }
  
  setError(msg) {
    // Record and display error message, and immediately stop listening.
    this.error = msg;
    UI.warn(this.error);
    this.deactivate();
  }
  
  log(msg, running=false) {
    // Log a UI message so it will appear in the log file.
    if(this.active || running) {
      if(!(msg.startsWith('[') || running)) {
        const
            d = new Date(),
            now = d.getHours() + ':' +
                d.getMinutes().toString().padStart(2, '0') + ':' +
                d.getSeconds().toString().padStart(2, '0');
        msg = `[${now}] ${msg}`;
      }
      this.log_lines.push(msg);
    }
  }
  
  get logReport() {
    // Return log lines as a single string, and clear the log.
    const report = this.log_lines.join('\n');
    this.log_lines.length = 0;
    return report;
  }

  activate() {
    // Set channel path and (optional) call-back script.
    this.channel = SETTINGS.channel;
    this.call_back_script = SETTINGS.callback;
    // Clear experiment, error message and log.
    this.experiment = '';
    this.error = '';
    this.log_lines.length = 0;
    this.active = true;
    this.listen();
    UI.notify('Started listening at', this.channel);
  }

  listen() {
    // If active, check whether there is a new command in the channel
    // directory.
    if(!this.active) return;
    const jsr = rcvrListen(this.channel);
    if(jsr.error) {
      console.log('Receiver error:', jsr.error);
    } else if(jsr.stop) {
      console.log('Receiver deactivated by script');
      this.deactivate();
    } else if(jsr.file === '') {
      // Nothing to do => check again after the set time interval.
      setTimeout(() => RECEIVER.listen(), this.interval);
    } else if(jsr.file && jsr.model) {
      // NOTE: Model will NOT be encrypted, so it can be parsed.
      this.file_name = jsr.file;
      let msg = '';
        if(!MODEL.parseXML(jsr.model)) {
        msg = 'ERROR: Received model is not valid';
      } else if(jsr.experiment) {
        EXPERIMENT_MANAGER.selectExperiment(jsr.experiment);
        if(!EXPERIMENT_MANAGER.selected_experiment) {
          msg = `ERROR: Unknown experiment "${jsr.experiment}"`;
        } else {
          this.experiment = jsr.experiment;
        }
      }
      if(msg) {
        this.setError(msg);
        rcvrReport(this.channel, this.file_name);
        // Keep listening, so check again after the time interval.
        setTimeout(() => RECEIVER.listen(), this.interval);
      } else {
        this.log('Executing: ' + this.file_name);
        // NOTE: Virtual Machine will trigger the receiver's reporting
        // action each time the model has been solved.
        if(this.experiment) {
          this.log('Starting experiment: ' + this.experiment);
          EXPERIMENT_MANAGER.startExperiment();
        } else {
          VM.solveModel();
        }
      }
    }
  }

  report() {
    // Save the run results in the channel, or signal an error.
    let run = '',
        rpath = this.channel,
        file = this.file_name;
    // NOTE: Always set `solving` to FALSE.
    this.solving = false;
    // NOTE: When reporting while the receiver is not active, report the
    // results of the running experiment.
    if(this.experiment || !this.active) {
      if(MODEL.running_experiment) {
        run = MODEL.running_experiment.active_combination_index;
        this.log(`Reporting: ${file} (run #${run})`);
      }
    }
    // NOTE: If receiver is not active, path and file must be set.
    if(!this.active) {
      rpath = 'user/reports';
      // Zero-pad the run number.
      file = REPOSITORY_BROWSER.asFileName(MODEL.name || 'model') +
          (run === '' ? '' : '-' + run.toString().padStart(3, '0')) +
          `-${compactClockTime()}`;
    }
    if(MODEL.solved && !VM.halted) {
      // Normal execution termination => report results.
      const data = MODEL.outputData;
      rcvrReport(rpath, file, run, data[0], data[1]);
      // If execution completed, perform the call-back action.
      // NOTE: For experiments, call-back is performed upon completion by
      // the Experiment Manager.
      if(!this.experiment) this.callBack();
    } else {
      if(!VM.halted && !this.error) {
        // No apparent cause => log this irregularity.
        this.setError('ERROR: Unknown solver problem');
        rcvrAbort();
      }
    }
  }

  callBack() {
    // Run the call-back script (if specified) only when the receiver is
    // active (so not when its reporting function is called by the VM).
    if(this.active) rcvrCallBack(this.call_back_script);
  }

} // END of class ConsoleReceiver

// Receiver helper functions.
// NOTE: These functions are adapted versions of those having the same
// name in file `server.js`; the main difference is that those functions
// respond to HTTP requests, whereas now they return objects.

function rcvrListen(rpath) {
  // "Listen" at the channel, i.e., look for work to do.
  let mdl = '',
      cmd = '';
  try {
    // Look for a model file and/or a command file in the channel directory.
    const flist = fs.readdirSync(rpath);
    // NOTE: `flist` contains file names relative to the channel path.
    for(let i = 0; i < flist.length; i++) {
      const f = path.parse(flist[i]);
      if(f.ext === '.lnr' && !mdl) mdl = flist[i];
      if(f.ext === '.lnrc' && !cmd) cmd = flist[i];
    }
  } catch(err) {
    console.log(err);
    return {error: `Failed to get file list from ${rpath}`};
  }
  // Model files take precedence over command files.
  if(mdl) {
    try {
      const data = fs.readFileSync(path.join(rpath, mdl), 'utf8');
      return {file: path.parse(mdl).name, model: data};
    } catch(err) {
      console.log(err);
      return {error: `Failed to read model ${mdl}`};
    }
  }
  if(cmd) {
    try {
      cmd = fs.readFileSync(path.join(rpath, cmd), 'utf8').trim();
    } catch(err) {
      console.log(err);
      return {error: `Failed to read command file ${cmd}`};
    }
    // Special command to deactivate the receiver.
    if(cmd === 'STOP LISTENING') {
      return {stop: 1};
    } else {
      // For now, command can only be
      // "[experiment name|]module name[@repository name]"
      let m = '',
          r = '',
          x = '';
      const m_r = cmd.split('@');
      // Repository `r` is local host unless specified.
      if(m_r.length === 2) {
        r = m_r[1];
      } else if(m_r.length === 1) {
        r = 'local host';
      } else {
        // Multiple occurrences of @ are not allowed.
        return {error: `Invalid command "${cmd}"`};
      }
      m = m_r[0];
      // Module `m` can be prefixed by an experiment title.
      const x_m = m.split('|');
      if(x_m.length === 2) {
        x = x_m[0];
        m = x_m[1];
      }
      // Call the repository helper function `repoLoad` with its callback
      // function to get the model XML.
      return {
          file: path.parse(cmd).name,
          model: repoLoad(r.trim(), m.trim()),
          experiment: x.trim()
        };
    }
  } else {
    // Empty fields will be interpreted as "nothing to do".
    return {file: '', model: '', experiment: ''};
  }
}

function rcvrAbort() {
  // Log that receiver actions have been aborted.
  const log_path = path.join(RECEIVER.channel, RECEIVER.file_name + '-log.txt');
  fs.writeFile(log_path, RECEIVER.logReport, (err) => {
      if(err) {
        console.log(err);
        console.log('ERROR: Failed to write event log to file', log_path);
      } else {
        console.log('Remote run aborted');            
      }
    });
}

function rcvrReport(rpath, file, run='', data='no data', stats='no statistics') {
  // Write series data, statistics and log to files.
  try {
    let fp = path.join(rpath, file + run + '-data.txt');
    fs.writeFileSync(fp, data);
  } catch(err) {
    console.log(err);
    console.log('ERROR: Failed to write data to file', fp);
    return;
  }
  try {
    fp = path.join(rpath, file + run + '-stats.txt');
    fs.writeFileSync(fp, stats);
  } catch(err) {
    console.log(err);
    console.log('ERROR: Failed to write statistics to file', fp);
    return;
  }
  try {
    fp = path.join(rpath, file + run + '-log.txt');
    fs.writeFileSync(fp, RECEIVER.logReport);
  } catch(err) {
    console.log(err);
    console.log('ERROR: Failed to write event log to file',  fp);
  }
  console.log('Data and statistics reported for', file);
}

function rcvrCallBack(script) {
  // Delete the file in the channel directory (to prevent executing it
  // again) and activate the call-back script on the local server.
  let file_type = '',
      cpath = path.join(RECEIVER.channel, RECEIVER.file_name + '.lnr');
  try {
    fs.accessSync(cpath);
    file_type = 'model';
  } catch(err) {
    cpath = path.join(RECEIVER.channel, RECEIVER.file_name + '.lnrc');
    try {
      fs.accessSync(cpath);
      file_type = 'command';
    } catch(err) {
      cpath = '';
    }
  }
  if(cpath) {
    console.log('Deleting',  file_type, ' file:', cpath);
    try {
      fs.unlinkSync(cpath);
    } catch(err) {
      console.log(err);
      console.log(`ERROR: Failed to delete ${file_type} file ${rfile}`);
      return;
    }
  }
  if(!script) {
    console.log('No call-back script to execute');
    return;
  }
  try {
    cmd = fs.readFileSync(path.join(WORKSPACE.callback, script), 'utf8');
    console.log(`Executing callback command "${cmd}"`);
    child_process.exec(cmd, (error, stdout, stderr) => {
        console.log(stdout);
        if(error) {
          console.log(error);
          console.log(stderr);
          console.log(`ERROR: Failed to execute script "${script}"`);
        } else {
          console.log(`Call-back script "${script}" executed`);
        }
      });
  } catch(err) {
    console.log(err);
    console.log(`WARNING: Call-back script "${script}" not found`);
  }
}


//
// Console functions
//

function commandLineSettings() {
  // Set default settings, and then check the command line arguments.
  const settings = {
      cli_name: (PLATFORM.startsWith('win') ? 'Command Prompt' : 'Terminal'),
      check: false,
      data_path: '',
      preferred_solver: '',
      report: '',
      run: false,
      x_title: '',
      x_list: false,
      solver: '',
      solver_path: '',
      user_dir: path.join(WORKING_DIRECTORY, 'user'),
      verbose: false
    };
  let show_usage = process.argv.length < 3;
  for(let i = 2; i < process.argv.length; i++) {
    const lca = process.argv[i].toLowerCase();
    if(lca === 'help' || lca === '?' || lca.startsWith('-')) {
      show_usage = true;
    } else if(lca === 'check') {
      settings.check = true;
    } else if(lca === 'run') {
      settings.run = true;
    } else if(lca === 'verbose') {
      settings.verbose = true;
    } else {
      const av = lca.split('=');
      if(av.length === 1) av.push('');
      if(av[0] === 'solver') {
        if(SUPPORTED_SOLVERS.indexOf(av[1]) < 0) {
          console.log(`WARNING: Unknown solver "${av[1]}"`);
        } else {
          settings.preferred_solver = av[1];
        }
      } else if(av[0] === 'workspace') {
        // User directory must be READ/WRITE-accessible
        try {
          fs.accessSync(av[1], fs.constants.R_OK | fs.constants.W_O);
        } catch(err) {
          console.log(`ERROR: No access to directory "${av[1]}"`);
          process.exit();
        }
        settings.user_dir = av[1];
      } else if(av[0] === 'user') {
        // User identifier (mail adress)
        settings.user_mail = av[1];
      } else if(av[0] === 'password') {
        // Decryption password -- not the user's password!
        settings.password = av[1];
      } else if(av[0] === 'model') {
        // Validate model path
        try {
          // Add default extension if no extension specified
          if(av[1].indexOf('.') < 0) av[1] += '.lnr';
          mp = path.parse(av[1]);
          if(mp.ext !== '.lnr') {
            console.log('WARNING: Model file should have extension .lnr');
          }
          try {
            fs.accessSync(av[1], fs.constants.R_OK);
          } catch(err) {
            if(!mp.root && !mp.dir.startsWith('.')) {
              av[1] = path.join(settings.user_dir, 'models', av[1]);
            }
            fs.accessSync(av[1], fs.constants.R_OK);
          }
          settings.model_path = av[1];
        } catch(err) {
          console.log(`ERROR: File "${av[1]}" not found`);
          process.exit();
        }
      } else if(av[0] === 'data-dir') {
        // Set path (if valid) to override default data directory
        const dp = av[1];
        try {
          // See whether the directory already exists
          try {
            fs.accessSync(dp, fs.constants.R_OK | fs.constants.W_O);
          } catch(err) {
            // If not, try to create it
            fs.mkdirSync(dp);
            console.log('Created data directory:', dp);
          }
          settings.data_path = dp;
        } catch(err) {
          console.log(err.message);
          console.log('ERROR: Failed to create data directory:', dp);
        }
      } else if(av[0] === 'report') {
        // Set report file name (if valid).
        // NOTE: No sub-directories for report files, so path separators
        // are ignored.
        const rfn = FILE_MANAGER.asFilePath(av[1], true);
        if(/^[A-Za-z0-9]+/.test(rfn)) {
          settings.report = path.join(settings.user_dir, 'reports', rfn);
        } else {
          console.log(`WARNING: Invalid report file name "{$rfn}"`);
        }
      } else if(av[0] === 'xrun') {
        if(!av[1].trim()) {
          // NOTE: `x_title` = TRUE indicates: list available experiments.
          settings.x_title = true;
        } else {
          // NOTE: use original argument to preserve upper/lower case
          const x = process.argv[i].split('=')[1].split('#');
          settings.x_title = x[0].trim();
          if(!settings.x_title) settings.x_title = true;
          settings.x_runs = [];
          x.splice(0, 1);
          // In case of multiple #, interpret them as commas.
          const r = (x.length > 0 ? x.join(',').split(',') : []);
          for(let i = 0; i < r.length; i++) {
            if(/^\d+$/.test(r[i])) {
              settings.x_runs.push(parseInt(r[i]));
            } else {
              console.log(`WARNING: Invalid run number "${r[i]}"`);
            }
          }
          // If only invalid numbers, do not run the experiment at all.
          if(r.length > 0 && settings.x_runs.length === 0) {
            settings.x_runs = false;
          }
        }
      } else {
        // Terminate script
        console.log(
            `ERROR: Invalid command line argument "${process.argv[i]}"`);
        show_usage = true;
      }
    }
  }
  // If help is asked for, or command is invalid, show usage and then quit.
  if(show_usage) {
    console.log(usage);
    process.exit();
  }
  // Perform version check only if asked for.
  if(settings.check) checkForUpdates();
  return settings;
}

function createWorkspace() {
  // Verifies that Linny-R has write access to the user workspace, defines
  // paths to sub-directories, and creates them if necessary
  try {
    // See whether the user directory already exists
    try {
      fs.accessSync(SETTINGS.user_dir, fs.constants.R_OK | fs.constants.W_O);
    } catch(err) {
      // If not, try to create it
      fs.mkdirSync(SETTINGS.user_dir);
      console.log('Created user directory:', SETTINGS.user_dir);
    }
  } catch(err) {
    console.log(err.message);
    console.log('FATAL ERROR: Failed to create user workspace in',
        SETTINGS.user_dir);
    process.exit();
  }
  // Define the sub-directory paths
  const ws = {
      autosave: path.join(SETTINGS.user_dir, 'autosave'),
      channel: path.join(SETTINGS.user_dir, 'channel'),
      callback: path.join(SETTINGS.user_dir, 'callback'),
      data: path.join(SETTINGS.user_dir, 'data'),
      diagrams: path.join(SETTINGS.user_dir, 'diagrams'),
      models: path.join(SETTINGS.user_dir, 'models'),
      modules: path.join(SETTINGS.user_dir, 'modules'),
      reports: path.join(SETTINGS.user_dir, 'reports'),
      solver_output: path.join(SETTINGS.user_dir, 'solver'),
    };
  // Create these sub-directories if not aready there
  try {
    for(let p in ws) if(ws.hasOwnProperty(p)) {
      try {
        fs.accessSync(ws[p]);
      } catch(e) {
        fs.mkdirSync(ws[p]);
        console.log('Created workspace sub-directory:', ws[p]);
      }
    }
  } catch(err) {
    console.log(err.message);
    console.log('WARNING: No access to workspace directory');
  }
  // The file containing name, URL and access token for remote repositories
  ws.repositories = path.join(SETTINGS.user_dir, 'repositories.cfg');
  // For completeness, add path to Linny-R directory.
  ws.working_directory = WORKING_DIRECTORY;
  // Return the updated workspace object
  return ws;
}

function checkForUpdates() {
  // Check for newer version of the Node.js package `linny-r`
  // NOTE: use `info` as shorthand for the global constant
  const info = VERSION_INFO;
  try {
    const
        json = child_process.execSync('npm show linny-r time version --json'),
        obj = JSON.parse(json);
    info.latest = obj.version;
    info.latest_time = new Date(Date.parse(obj.time[info.latest]));
    info.current_time = new Date(Date.parse(obj.time[info.current]));
    info.up_to_date = info.current === info.latest;
  } catch(err) {
    // `latest` = 0 indicates that version check failed
    info.latest = 0;
  }
  if(!info.latest) {
    console.log('WARNING: Could not check for updates');
  } else if(!info.up_to_date) {
    console.log('UPDATE: Version ' + info.latest + ' was released on ' +
        info.latest_time.toString());
  } else {
    console.log('Version ' + info.latest + ' is up-to-date (released on ' +
        info.latest_time.toString() + ')');    
  }
  // Return TRUE if current version is the latest one
  return info.up_to_date;
}

// Initialize the solver
const SOLVER = new MILPSolver(SETTINGS.preferred_solver, WORKSPACE);
/*
// Initialize the dialog for interaction with the user
const PROMPTER = readline.createInterface(
    {input: process.stdin, output: process.stdout});
PROMPTER._writeToOutput = function _writeToOutput(str) {
  if (PROMPTER.stdoutMuted && !PROMPTER.questionPrompt(str)) {
    PROMPTER.output.write("*");
  } else {
    PROMPTER.output.write(str);
  }
};
PROMPTER.prompt_phrases = {
  access_code: 'Access code: ',
  password: 'Password: '
};
PROMPTER.questionPrompt = (str) => {
  const pp = PROMPTER.prompt_phrases;
  for(let k in pp) if (pp.hasOwnProperty(k)) {
    if(str === pp[k]) return true;
  }
  return false;
};
// NOTE: for password prompts, mute the output like so:
//PROMPTER.stdoutMuted = true;
*/

// Initialize the Linny-R console components as global variables.
global.UI = new Controller();
global.VM = new VirtualMachine();
global.POWER_GRID_MANAGER = new PowerGridManager();
global.FILE_MANAGER = new ConsoleFileManager();
global.DATASET_MANAGER = new DatasetManager();
global.CHART_MANAGER = new ChartManager();
global.SENSITIVITY_ANALYSIS = new SensitivityAnalysis();
global.EXPERIMENT_MANAGER = new ExperimentManager();
global.MONITOR = new ConsoleMonitor();
global.RECEIVER = new ConsoleReceiver();
global.IO_CONTEXT = null;
global.MODEL = new LinnyRModel();
// Connect the virtual machine (may prompt for password).
MONITOR.connectToServer();
// Load the model if specified.
if(SETTINGS.model_path) {
  FILE_MANAGER.loadModel(SETTINGS.model_path, (model) => {
      // Command `run` takes precedence over `xrun`.
      if(SETTINGS.run) {
        MONITOR.show_log = SETTINGS.verbose;
        // Callback hook "tells" VM where to return after solving.
        VM.callback = () => {
            const od = model.outputData;
            // Output data is two-string list [time series, statistics].
            if(SETTINGS.report) {
              // Output time series.
              FILE_MANAGER.writeStringToFile(od[0],
                  SETTINGS.report + '-series.txt');
              // Output statistics.
              FILE_MANAGER.writeStringToFile(od[1],
                  SETTINGS.report + '-stats.txt');
            } else if(!MODEL.report_results) {
              // Output strings to console.
              console.log(od[0]);
              console.log(od[1]);
            }
            // Clear callback hook (to be neat).
            VM.callback = null;
        };
        // NOTE: Solver preference in model overrides default solver.
        const mps = MODEL.preferred_solver;
        if(mps && SOLVER.solver_list.hasOwnProperty(mps)) {
          VM.solver_id = mps;
          SOLVER.id = mps;
          console.log(`Using solver ${SOLVER.name} (model preference)`);
        }
        VM.solveModel();
      } else if(SETTINGS.x_title) {
        if(SETTINGS.x_title === true) {
          // List titles of experiments in model.
          if(MODEL.experiments.length === 0) {
            console.log('NOTE: Model defines no experiments');
          } else {
            console.log('No experiment specified. Options are:');
            for(let i = 0; i < MODEL.experiments.length; i++) {
              console.log(`${i+1}. ${MODEL.experiments[i].title}`);
            }
          }
        } else {
          // Check whether experiment exists.
          let xi = MODEL.indexOfExperiment(SETTINGS.x_title);
          // NOTE: Experiments can also be specified by their index number.
          if(xi < 0) {
            xi = safeStrToInt(SETTINGS.x_title, 0) - 1;
            if(xi >= MODEL.experiments.length) xi = -1;
            if(xi >= 0) SETTINGS.x_title = MODEL.experiments[xi].title;
          }
          if(xi < 0) {
            console.log(`WARNING: Unknown experiment "${SETTINGS.x_title}"`);
          } else {
            console.log('Experiment:', SETTINGS.x_title);
            EXPERIMENT_MANAGER.selectExperiment(SETTINGS.x_title);
            const x = EXPERIMENT_MANAGER.selected_experiment;
            if(!x) {
              console.log('ERROR: Experiment not found');
              return;
            }
            // NOTE: Only set callback when model does not auto-report runs.
            if(!MODEL.report_results) EXPERIMENT_MANAGER.callback = () => {
                const od = model.outputData;
                console.log(od[0]);
                console.log(od[1]);
                VM.callback = null;
              };
            if(SETTINGS.x_runs.length === 0) {
              // Perform complete experiment.
              EXPERIMENT_MANAGER.startExperiment();
            } else {
              // Announce, and then perform, only the selected runs.
              console.log('Runs:', SETTINGS.x_runs);
              for(let i = SETTINGS.x_runs.length - 1; i >= 0; i--) {
                const rc = x.combinations[SETTINGS.x_runs[i]];
                if(!rc) {
                  console.log(
                      'WARNING: For this experiment, run number range is ' +
                      `[0 - ${x.combinations.length - 1}]`);
                  return;
                }
              }
              SETTINGS.run_index = 0;
              EXPERIMENT_MANAGER.callback = () => {
                  SETTINGS.run_index++;
                  if(SETTINGS.run_index < SETTINGS.x_runs.length) {
                    EXPERIMENT_MANAGER.startExperiment(
                        SETTINGS.x_runs[SETTINGS.run_index]);
                  } else {
                    VM.callback = null;
                  }
                };
              EXPERIMENT_MANAGER.startExperiment(SETTINGS.x_runs[0]);
            }
          }
        }
      }
  });
}

/*
console.log('Prompting');
PROMPTER.question(PROMPTER.access_code, (code) => {
    SETTINGS.code = code;
    PROMPTER.close();
  });
*/
