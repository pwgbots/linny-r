/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This NodeJS script (server.js) provides a minimalist local host web server
(URL http://127.0.0.1:5050) that will serve the Linny-R GUI (HTML, CSS,
and JavaScript files, and images), process the requests from the browser
that pass the MILP equation model to the solver, and then return the solution
to the Linny-R "virtual machine" that is running in the browser.
*/
/*
Copyright (c) 2020-2025 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

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

///////////////////////////////////////////////////////////////////////////////
//   Please do not modify code unless you *really* know what you are doing   //
///////////////////////////////////////////////////////////////////////////////

const
    // The current working directory (from where Node.js was started) is
    // assumed to be the main directory.
    path = require('path'),
    WORKING_DIRECTORY = process.cwd(),
    MODULE_DIRECTORY = path.join(WORKING_DIRECTORY, 'node_modules', 'linny-r'),
    
    // Get the required built-in Node.js modules.
    child_process = require('child_process'),
    fs = require('fs'),
    http = require('http'),
    os = require('os'),

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
  console.log('\nNode.js server for Linny-R version', info.current);
  console.log('Looking for newer version on https://npmjs.com');
  try {
    const
        json = child_process.execSync( 
            'npm show linny-r time version --json', {timeout: 5000}),
        obj = JSON.parse(json);
    info.latest = obj.version;
    info.latest_time = new Date(Date.parse(obj.time[info.latest]));
    info.current_time = new Date(Date.parse(obj.time[info.current]));
    info.up_to_date = info.current === info.latest;
    info.major = info.latest.split('.').shift();
    info.upgrade = !info.current.startsWith(info.major + '.');
  } catch(err) {
    // `latest` = 0 indicates that version check failed.
    info.latest = 0;
  }
  clearNewerVersion();
  if(!info.latest) {
    console.log('WARNING: Could not connect to https://registry.npmjs.org/');
  } else if(!info.up_to_date) {
    console.log('UPDATE: Version ' + info.latest + ' was released on ' +
        info.latest_time.toString());
    if(info.upgrade) {
      console.log('NOTE: Major version change requires manual installation');
    }
  } else {
    console.log('Linny-R software is up-to-date');
  }
  return info;
}

// Output some configuration information to the console
console.log('Node.js version:', process.version);
console.log('Platform:', PLATFORM, '(' + os.type() + ')');
console.log('Module directory:', MODULE_DIRECTORY);
console.log('Working directory:', WORKING_DIRECTORY);

// Only now require the Node.js modules that are not "built-in"

const
    { DOMParser } = checkNodeModule('@xmldom/xmldom');

function checkNodeModule(name) {
  // Catches the error if Node.js module `name` is not available
  try {
    return require(name);
  } catch(err) {
    console.log(`ERROR: Node.js module "${name}" needs to be installed first`);
    process.exit();
  }
}

// Currently, these external solvers are supported:
const SUPPORTED_SOLVERS = ['gurobi', 'mosek', 'cplex', 'scip', 'lp_solve'];

// Load class MILPSolver
const MILPSolver = require('./static/scripts/linny-r-milp.js');


// Default settings are used unless these are overruled by arguments on the
// command line. Possible arguments are:
//  - port=[number]     will make the server listen at port [number]
//  - solver=[name]     will select solver [name], or warn if not found
//  - workspace=[path]  will create workspace in [path] instead of (main)/user
const SETTINGS = commandLineSettings();
    
// The workspace defines the paths to directories where Linny-R can write files.
const WORKSPACE = createWorkspace();
    
// Initialize the solver.
const SOLVER = new MILPSolver(SETTINGS.preferred_solver, WORKSPACE);

// Create launch script.
createLaunchScript();

// Create the HTTP server.
const SERVER = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:' + SETTINGS.port);
    // When POST, first get all the full body.
    if(req.method === 'POST') {
      let body = '';
      // @@TO DO: For big data requests, string may become too long.
      req.on('data', (data) => body += data);
      req.on('end', () => processRequest(req, res, u.pathname, body));
    } else if(req.method === 'GET') {
      processRequest(req, res, u.pathname, u.search);
    }
  });

// Prepare for error on start-up.
SERVER.on('error', (err) => {
    if(err.code === 'EADDRINUSE') {
      success = false;
      console.log('ERROR: Port', SETTINGS.port, 'is already in use.');    
      console.log('Some Linny-R server may be in another CLI box -- Please check.');
    } else {
      throw err;
    }
  });

// Start listening at the specified port number.
const options = {
    port: SETTINGS.port,
    exclusive: true
  };
SERVER.listen(options, launchGUI);


function launchGUI(err) {
  if(SERVER.listening) {
    console.log('Listening at: http://127.0.0.1:' + SETTINGS.port);
  }
  // Launch the GUI if this command line argument is set.
  if(SETTINGS.launch) {
    console.log('Launching Linny-R in the default browser'); 
    const cmd = (PLATFORM.startsWith('win') ? 'start' : 'open');
    child_process.exec(cmd + ' http://127.0.0.1:' + SETTINGS.port,
        (error, stdout, stderr) => {
            if(error) {
              console.log('NOTICE: Failed to launch GUI in browser');
              console.log(error);
              console.log(stdout);
              console.log(stderr);
            }
          });
  }
}


// Server action logging functionality
// ===================================
// Only actions are logged to the console as with date and time;
// error messages are not prefixed, so these are logged directly.

function logAction(msg) {
  // Log request processing to console with time-zone-aware date and time
  const
      t = new Date(),
      tzt = new Date(t.getTime() - t.getTimezoneOffset()*60000),
      dts = tzt.toISOString().substring(0, 19).replace('T', ' ');
  console.log(`[${dts}] ${msg}`);
}

// Version check functionality
// ===========================
// This section of code implements server responses to the request made
// by the browser immediately after loading the GUI page (`index.html`)

function autoCheck(res) {
  // Serves a string with the current version number plus info on a
  // newer release if this is available.
  let check = VERSION_INFO.current + '|';
  if(VERSION_INFO.up_to_date) {
    check += 'up-to-date';
  } else {
    check += VERSION_INFO.latest + '|' + VERSION_INFO.latest_time;
  }
  servePlainText(res, check);
}

function setNewerVersion() {
  // Creates the file "newer_version" in the working directory, so that
  // when the server is run from the standard batch script it will detect
  // that an update is required.
  const nvf = path.join(WORKING_DIRECTORY, 'newer_version');
  try {
    fs.writeFileSync(nvf, VERSION_INFO.latest);
  } catch(err) {
    console.log('WARNING: Failed to create file:', nvf);
    console.log(err);
  }
}

function clearNewerVersion() {
  // Forestalls auto-update by deleting the file "newer_version" that may
  // have been created at start-up from the working directory.
  try {
    fs.unlink(path.join(WORKING_DIRECTORY, 'newer_version'));
  } catch(err) {
    // No action, as error is nogt fatal.
  }
}

// HTML page to show when the server is shut down by the user.
// Parts of the text are platform-specific.
const
    macOS = (PLATFORM === 'darwin'),
    close = (macOS ?
        `<p>You can now close the <em>Terminal</em> window that shows
         <tt>[Process Terminated]</tt> at the bottom.</p>` :
        `<p>The <em>Command Prompt</em> window where the server was
         running will be closed automatically.</p>`),
    cli = (macOS ? 'Terminal' : 'Command Prompt'),
    launch = (macOS ? './linny-r.command' : 'linny-r'),
    chmod = (!macOS ? '' : `
<p>If launch fails, you may still need to make the script executable.</p>
<p>
  You can do this by typing <code>chmod +x linny-r.command</code>
  at the command prompt.
</p>
<p>Then retype <code>linny-r.command</code> to launch Linny-R.</p>`),
    upgrade = (!VERSION_INFO.upgrade ? '<p>and then type:</p>' : `
<p>
  <strong>NOTE:</strong> This is a <em>major</em> version change.
  To upgrade to version <strong>${VERSION_INFO.latest}</strong>, type:
</p>
<p><code>npm install linny-r@${VERSION_INFO.latest.split('.').shift()}</code></p>
<p>
  This should perform the upgrade. If successful, you can then launch Linny-R
  as usual by typing:
</p>`),
    SHUTDOWN_MESSAGE = `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8">
  <title>Linny-R server shutdown</title>
  <link rel="shortcut icon" type="image/png" href="../images/icon-gray.png">
  <style>
    body {
      font-family: sans-serif;
      font-size: 15px;
    }
    code {
      background-color: black;
      color: white;
      padding: 2px;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <h3>Linny-R server (127.0.0.1) is shutting down</h3>${close}
  <p>
    To restart Linny-R, you may need to open <em>${cli}</em> again,
    and then change to your Linny-R directory by typing:
  </p>
  <p><code>cd ${WORKING_DIRECTORY}</code></p>${upgrade}
  <p><code>${launch}</code></p>
  <p>
    This should launch Linny-R in a new browser window or tab, so you
    can close this one.
  </p>${chmod}
</body>
</html>`;

// Auto-save & restore model functionality
// =======================================
// For auto-save services, the Linny-R JavaScript application communicates with
// the server via calls to the server like fetch('autosave/', x) where x is a JSON
// object with at least the entry `action`, which can be one of the following:
//  purge  remove all model files older than the set auto-save period
//  store  write the property x.xml to the file with name x.name
//  load   return the XML contents of the specified model file
// Each action returns a JSON string that represents the actualized auto-save
// settings (interval and perdiod) and list of auto-saved model data objects.
// For each model: {name, file_name, size, time_saved}

function asFileName(s) {
  // Returns string `s` in lower case with whitespace converted to a single
  // dash, special characters converted to underscores, and leading and
  // trailing dashes and underscores removed
  return s.normalize('NFKD').trim()
      .replace(/[\s\-]+/g, '-')
      .replace(/[^A-Za-z0-9_\-]/g, '_')
      .replace(/^[\-\_]+|[\-\_]+$/g, '');
}

function autoSave(res, sp) {
  // Process all auto-save & restore commands.
  // NOTE: To prevent duplicate code, this routine is also called when
  // the modeler SHIFT-clicks on the "Save model" button. This option
  // has been added to permit saving files larger than the 25 MB that
  // some browsers impose as limit for saving a string to disk.
  const
      action = sp.get('action').trim(),
      saving = (sp.get('wsd') === 'true' ? 'Save' : 'Auto-save');
    logAction(saving + ' action: ' + action);
  if(['purge', 'load', 'store'].indexOf(action) < 0) {
    // Invalid action => report error.
    return servePlainText(res, `ERROR: Invalid auto-save action: "${action}"`);
  }
  // Always purge the auto-save files before further action; this returns
  // the list with model data objects.
  const data = autoSavePurge(res, sp);
  // NOTE: If string instead of array, this string is an error message.
  if(typeof data === 'string') return servePlainText(res, data);
  // Perform load or store actions if requested.
  if(action === 'load') return autoSaveLoad(res, sp);
  if(action === 'store') return autoSaveStore(res, sp);
  // Otherwise, action was 'purge' => return the auto-saved model list.
  serveJSON(res, data);
}

function autoSavePurge(res, sp) {
  // Delete specified file(s) (if any) as well as all expired files,
  // and return list with data on remaining files as JSON string.
  const
      now = new Date(),
      p = sp.get('period'),
      period = (p ? parseInt(p) : 24) * 3600000,
      df = sp.get('to_delete'),
      all = df === '/*ALL*/';
  
  // Get list of data on Linny-R models in `autosave` directory.
  data = [];
  try {
    const flist = fs.readdirSync(WORKSPACE.autosave);
    for(let i = 0; i < flist.length; i++) {
      const
          pp = path.parse(flist[i]),
          md = {name: pp.name},
          fp = path.join(WORKSPACE.autosave, flist[i]);
      // NOTE: Only consider Linny-R model files (extension .lnr).
      if(pp.ext === '.lnr') {
        let dodel = all || pp.name === df;
        if(!dodel) {
          // Get file properties
          const fstat = fs.statSync(fp);
          md.size = fstat.size;
          md.date = fstat.mtime;
          // Also delete if file has expired.
          dodel = now - fstat.mtimeMs > period;
        }
        if(dodel) {
          // Delete model file.
          try {
            fs.unlinkSync(fp);
          } catch(err) {
            console.log('WARNING: Failed to delete', fp);
            console.log(err);
          }
        } else {
          // Add model data to the list.
          data.push(md);
        }
      }
    }
  } catch(err) {
    console.log(err);
    return 'ERROR: Auto-save failed -- ' + err.message;
  }
  return data;
}

function autoSaveLoad(res, sp) {
  // Return XML content of specified file".
  const fn = sp.get('file');
  if(fn) {
    const fp = path.join(WORKSPACE.autosave, fn + '.lnr');
    try {
      data = fs.readFileSync(fp, 'utf8');
    } catch(err) {
      console.log(err);
      data = 'WARNING: Failed to load auto-saved file: ' + err.message;
    }
  } else {
    data = 'ERROR: No auto-saved file name';
  }
  servePlainText(res, data);
}

function autoSaveStore(res, sp) {
  // Store XML data under specified file name in the auto-save directory,
  // or in the models directory if the "Save model button was SHIFT-clicked.
  let data = 'OK';
  const
      fn = sp.get('file'),
      // NOTE: Booleans are passed as strings.
      wsd = sp.get('wsd') === 'true',
      ws = (wsd ? WORKSPACE.models : WORKSPACE.autosave),
      msg = (wsd ? 'save to user workspace' : 'auto-save'),
      exists = (path) => {
          try {
            fs.accessSync(path);
            return true;
          } catch(err) {
            return false;
          }
        };
  if(!fn) {
    data = 'WARNING: No name for file to ' + msg;
  } else {
    const xml = sp.get('xml');
    // Validate XML as a Linny-R model
    try {
      const
          parser = new DOMParser(),
          doc = parser.parseFromString(xml, 'text/xml');
          root = doc.documentElement;
      // Linny-R models have a model element as root
      if(root.nodeName !== 'model') throw 'XML document has no model element';
      let fp = path.join(ws, fn + '.lnr');
      if(wsd) {
        // Append a version number to the file name if named file exists.
        const re = /\(\d+\).lnr$/;
        if(exists(fp)) {
          const m = fp.match(re);
          let n = 1;
          if(m) {
            // Replace version number (n) by (n+1).
            n = parseInt(m[0].substring(1, m[0].length - 1)) + 1;
            fp = fp.replace(re, `(${n}).lnr`);
          } else {
            // Add (1) as version number.
            fp = fp.substring(0, fp.length - 4) + ' (1).lnr';
          }
          while(exists(fp)) {
            // Iterate to find the first available version number.
            n++;
            fp = fp.replace(re, `(${n}).lnr`);
          }
        }
      }
      try {
        fs.writeFileSync(fp, xml);
        const d = `Model ${ws ? '' : 'auto-'}saved as ${fp}`;
        console.log(d);
        // No message (other than OK) when auto-saving.
        if(ws) data = d;
      } catch(err) {
        console.log(err);
        data = `ERROR: Failed to ${msg} to ${fp}`;
      }
    } catch(err) {
      console.log(err);
      data = 'ERROR: Not a Linny-R model to ' + msg;
    }
  }
  servePlainText(res, data);
}

// Repository functionality
// ========================
// For repository services, the Linny-R JavaScript application communicates with
// the server via calls to the server like fetch('repo/', x) where x is a JSON
// object with at least the entry `action`, which can be one of the following:
//  id      return the repository URL (for this script: 'local host')
//  list    return list with names of repositories available on the server
//  add     add repository (name + url) to the repository list (if allowed)
//  remove  remove repository (by name) from the repository list (if allowed)
//  dir     return list with names of modules in the named repository
//  load    return the specified file content from the named repository
//  access  obtain write access for the named repository (requires valid token)
//  store   write XML content to the specified file in the named repository
//  delete  delete the specified module file from the named repository

function repo(res, sp) {
  // Processes all repository commands
  const action = sp.get('action').trim();
  logAction('Repository action: ' + action);
  if(action === 'id') return repoID(res);
  if(action === 'list') return repoList(res);
  if(action === 'add') return repoAdd(res, sp);
  const repo = sp.get('repo').trim();
  if(action === 'remove') return repoRemove(res, repo);
  if(action === 'dir') return repoDir(res, repo);
  if(action === 'access') return repoAccess(res, repo, sp.get('token'));
  const file = sp.get('file').trim();
  if(action === 'info') return repoInfo(res, repo, file);
  if(action === 'load') return repoLoad(res, repo, file);
  if(action === 'store') return repoStore(res, repo, file, sp.get('xml'));
  if(action === 'delete') return repoDelete(res, repo, file);
  // Fall-through: report error
  servePlainText(res, `ERROR: Invalid repository action: "${action}"`);
}

function repositoryByName(name) {
  // Returns array [name, url, token] if `name` found in file `repository.cfg`
  repo_list = fs.readFileSync(WORKSPACE.repositories, 'utf8').split('\n');
  for(let i = 0; i < repo_list.length; i++) {
    rbn = repo_list[i].trim().split('|');
    while(rbn.length < 2) rbn.push('');
    if(rbn[0] === name) return rbn;
  }
  console.log(`ERROR: Repository "${name}" not registered on this computer`);
  return false;
}

function repoId(res) {
  // Returns the URL of this repository server
  // NOTE: this local WSGI server should return 'local host'
  servePlainText(res, 'local host');
}

function repoList(res) {
  // Returns name list of registered repositories
  // NOTE: on a local Linny-R server, the first name is always 'local host'
  let repo_list = 'local host';
  try {
    if(!fs.existsSync(WORKSPACE.repositories)) {
      fs.writeFileSync(WORKSPACE.repositories, repo_list);
    }
    repo_list = fs.readFileSync(WORKSPACE.repositories, 'utf8').split('\n');
    // Return only the names!
    for(let i = 0; i < repo_list.length; i++) {
      const r = repo_list[i].trim().split('|');
      repo_list[i] = r[0];
      // Add a + to indicate that storing is permitted
      if(r[0] === 'local host' || (r.length > 2 && r[2])) repo_list[i] += '+';
    }
    repo_list = repo_list.join('\n');
  } catch(err) {
    console.log('ERROR: Failed to access repository -- ' + err.message);
  }
  servePlainText(res, repo_list);
}

function repoAdd(res, sp) {
  // Registers a remote repository on this local Linny-R server
  let rname = sp.get('repo');
  if(rname) rname = rname.trim();
  if(!rname) return servePlainText(res, 'WARNING: Invalid name');
  // Get URL without trailing slashes 
  let url = sp.get('url');
  url = 'https://' + (url ? url.trim() : '');
  let i = url.length - 1;
  while(url[i] === '/') i--;
  url = url.substring(0, i+1);
  try {
    test = new URL(url);
  } catch(err) {
    return servePlainText(res, 'WARNING: Invalid URL');
  }
  // Error callback function is used twice, so define it here
  const noConnection = (error, res) => {
        console.log(error);
        servePlainText(res, connectionErrorText('Failed to connect to ' + url));
      };
  // Verify that the URL points to a Linny-R repository
  postRequest(url, {action: 'id'},
      // The `on_ok` function
      (data, res) => {
          data = data.toString();
          // Response should be the URL of the repository
          if(data !== url) {
            servePlainText(res, 'WARNING: Not a Linny-R repository');
            return;
          }
          // If so, append name|url|token to the configuration file
          // NOTE: token is optional
          let token = sp.get('token');
          if(token) token = token.trim();
          if(token) {
            postRequest(url, {action: 'access', repo: rname, token: token},
                // The `on_ok` function
                (data, res) => {
                    data = data.toString();
                    if(data !== 'Authenticated') {
                      servePlainText(res, data);
                      return;
                    }
                    list = fs.readFileSync(
                        WORKSPACE.repositories, 'utf8').split('\n');
                    for(let i = 0; i < list.length; i++) {
                      const nu = list[i].trim().split('|');
                      if(nu[0] !== 'local host') {
                        if(nu[0] == rname) {
                          servePlainText(res,
                              `WARNING: Repository name "${rname}" already in use`);
                          return;
                        }
                        if(nu[1] === url) {
                          servePlainText(res,
                              `WARNING: Repository already registered as "${nu[0]}"`);
                          return;
                        }
                      }
                    }
                    list.push([rname, url, token].join('|'));
                    fs.writeFileSync(WORKSPACE.repositories, list.join('\n'));
                    servePlainText(res, rname);
                  },
                // The `on_error` function and the response object
                noConnection, res);
          }
        },
      // The `on_error` function and the response object
      noConnection, res);
}
        
function repoRemove(res, rname) {
  // Removes a registered repository from the repository configuration file
  if(rname === 'local host') {
    servePlainText(res, 'ERROR: Cannot remove local host');
    return;
  }
  try {
    // Read list of repositories registered on this local host server
    list = fs.readFileSync(WORKSPACE.repositories, 'utf8').split('\n');
    // Look for a repository called `rname`
    let index = -1;
    for(let i = 0; i < list.length; i++) {
      const nu = list[i].trim().split('|');
      if(nu[0] === rname) {
        index = i;
        break;
      }
    }
    if(index < 0) {
      // Not found => cannot remove
      servePlainText(res, `ERROR: Repository "${rname}" not found`);
    } else {
      // Remove from list and save it to file `repository.cfg`
      list.splice(index, 1);
      fs.writeFileSync(WORKSPACE.repositories, list.join('\n'));
      // Return the name to indicate "successfully removed"
      servePlainText(res, rname);
    }
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Failed to remove "${rname}"`);
  }
}
        
function repoDir(res, rname) {
  // Returns a newline-separated list of names of the modules stored in the
  // specified repository
  const mlist = [];
  if(rname === 'local host') {
    // Return list of base filenames of Linny-R models in `modules` directory
    const flist = fs.readdirSync(WORKSPACE.modules);
    for(let i = 0; i < flist.length; i++) {
      const pp = path.parse(flist[i]);
      // Only add Linny-R model files (.lnr) without this extension
      if(pp.ext === '.lnr') mlist.push(pp.name);
    }
    servePlainText(res, mlist.join('\n'));
  } else {
    // Get list from remote server
    const r = repositoryByName(rname);
    if(r) {
      postRequest(r[1], {action: 'dir', repo: r[0]},
          // The `on_ok` function
          (data, res) => servePlainText(res, data),
          // The `on_error` function
          (error, res) => {
              console.log(error);
              servePlainText(res, connectionErrorText(
                  `Failed to access remote repository "${rname}"`));
          },
          res);
    } else {
      servePlainText(res, `ERROR: Repository "${rname}" not registered`);
    }
  }
}

function repoInfo(res, rname, mname) {
  // Returns the documentation (<notes> in XML) of the requested model file
  // if found in the specified repository
  // NOTE: the function `serveNotes` is called when the XML text has been
  // retrieved either from a local file or from a remote repository URL
  const serveNotes = (res, xml) => {
        // Parse XML string
        try {
          const parser = new DOMParser();
          xml = parser.parseFromString(xml, 'text/xml');
          const de = xml.documentElement;
          // Linny-R model must contain a model node
          if(de.nodeName !== 'model') throw 'XML document has no model element';
          let notes = '';
          // The XML will contain many "notes" elements; only consider child
          // nodes of the "model" element
          for(let i = 0; i < de.childNodes.length; i++) {
            const ce = de.childNodes[i];
            // NOTE: node text content is stored as a child node
            if(ce.nodeName === 'notes' && ce.childNodes.length > 0) {
              notes = ce.childNodes[0].nodeValue;
              break;
            }
          }
          servePlainText(res, notes);
        } catch(err) {
          console.log(err);
          console.log('XML', xml);
          servePlainText(res, 'ERROR: Failed to parse XML of Linny-R model');
        }
      };
  // See where to obtain the XML
  if(rname === 'local host') {
    // NOTE: file name includes version number but not the extension
    fs.readFile(path.join(WORKSPACE.modules, mname + '.lnr'), 'utf8',
        (err, data) => {
          if(err) {
              console.log(err);
              servePlainText(res, 'ERROR: Failed to read model file');
          } else {
            serveNotes(res, data);
          }
        });
  } else {
    // Get file from remote server
    r = repositoryByName(rname);
    if(r) {
      postRequest(r[1], {action: 'load', repo: r[0], file: mname},
          // The `on_ok` function
          (data, res) => serveNotes(res, data.toString()),
          // The `on_error` function
          (error, res) => {
              console.log(error);
              servePlainText(res, 'ERROR: Failed to download model file');
            },
          res);
    } else {
      servePlainText(res, `ERROR: Repository "${rname}" not registered`);
    }
  }
}

function repoLoad(res, rname, mname, pipe=null) {
  // Returns the requested model file if found in the specified repository
  // The optional function pipe(res, xml) allows pass ingon the loaded XML
  if(rname === 'local host') {
    // NOTE: file name includes version number but not the extension
    fs.readFile(path.join(WORKSPACE.modules, mname + '.lnr'), 'utf8',
        (err, data) => {
            if(err) {
              console.log(err);
              servePlainText(res, 'ERROR: Failed to read model file');
            } else if(pipe) {
              pipe(res, data);
            } else {
              servePlainText(res, data);
            }
        });
  } else {
    // Get file from remote server
    r = repositoryByName(rname);
    if(r) {
      postRequest(r[1], {action: 'load', repo: r[0], file: mname},
          // The `on_ok` function
          (data, res) => {
              if(pipe) {
                pipe(res, data.toString());
              } else {
                servePlainText(res, data.toString());
              }
            },
          // The `on_error` function
          (error, res) => {
              console.log(error);
              servePlainText(res, 'ERROR: Failed to download model file');
            },
          res);
    } else {
      servePlainText(res, `ERROR: Repository "${rname}" not registered`);
    }
  }
}

function repoAccess(res, rname, rtoken) {
  // Requests write access for a remote repository
  r = repositoryByName(rname);
  if(!r) {
    servePlainText(`ERROR: Repository "${rname}" not registered`);
    return;
  }
  postRequest(r[1], {action: 'access', repo: r[0], token: rtoken},
      // The `on_ok` function
      (data, res) => {
          if(data !== 'Authenticated') {
            servePlainText(res, data);
          } else {
            try {
              // Read the list of repositories from the repository config file
              const
                  list = fs.readFileSync(
                      WORKSPACE.repositories, 'utf8').split('\n'),
                  new_list = [];
              for(let i = 0; i < list.length; i++) {
                const nu = list[i].trim().split('|');
                if(nu[0] === rname) {
                  // Add or replace the token
                  if(nu.length === 2) {
                    nu.push(rtoken);
                  } else if(nu.length === 3) {
                    nu[2] = rtoken;
                  }
                }
                new_list.push(nu.join('|'));
              }
              fs.writeFileSync(new_list.join('\n'));
              servePlainText(res, `Authenticated for <b>${rname}</b>`);
            } catch(err) {
              console.log(err);
              servePlainText(res, `ERROR: Failed to set token for "${rname}"`);
            }
          }
        },
      // The `on_error` function
      (error, res) => {
          console.log(error);
          servePlainText(res, connectionErrorText('Failed to connect to' + r[1]));
        },
      res);
}

function repoStore(res, rname, mname, mxml) {
  // Stores the posted model in the specified repository
  // NOTE: file name must not contain spaces or special characters
  mname = asFileName(mname);
  // Validate XML as a Linny-R model
  let valid = false;
  try {
    const
        parser = new DOMParser(),
        doc = parser.parseFromString(mxml, 'text/xml');
        root = doc.documentElement;
    // Linny-R models have a model element as root
    if(root.nodeName !== 'model') throw 'XML document has no model element';
    valid = true;
  } catch(err) {
    console.log(err);
    servePlainText(res, 'ERROR: Not a Linny-R model');
    return;
  }
  if(rname === 'local host') {
    // Always allow storing on local host
    try {
      // NOTE: first find latest version (if any)
      const re = new RegExp('^' + mname + '-(\\d+).lnr');
      // NOTE: Version numbers start at 1
      let version = 0;
      const list = fs.readdirSync(WORKSPACE.modules);
      for(let i = 0; i < list.length; i++) {
        const match = list[i].match(re);
        if(match && match.length > 1) {
          // File name equal to model name plus version number => get the number
          version = Math.max(version, parseInt(match[1]));
        }
      }
      mname += `-${version + 1}.lnr`;
      fs.writeFileSync(path.join(WORKSPACE.modules, mname), mxml);
      servePlainText(res, `Model stored as <tt>${mname}</tt>`);
    } catch(err) {
      console.log(err);
      servePlainText(res, 'ERROR: Failed to write file');
    }
  } else {
      // Otherwise, post file with token
      r = repositoryByName(rname);
      if(r) {
        postRequest(r[1],
            {action: 'store', repo: rname, file: mname, xml: mxml, token: r[2]},
            // The `on_ok` function: serve the data sent by the remote server
            (data, res) => servePlainText(res, data),
            // The `on_error` function
            (error, res) => {
                console.log(error);
                servePlainText(res, connectionErrorText('Failed to connect to' + r[1]));
              },
            res);
      } else {
        servePlainText(res, `ERROR: Repository "${rname}" not registered`);
      }
  }
}

function repoDelete(res, name, file) {
  // Deletes the specified module from the specified repository
  // NOTE: this works only on the "local host" repository on this server
  if(name === 'local host') {
    // Delete specified model file
    // NOTE: file name includes version number but not the extension
    try {
      fs.unlinkSync(path.join(WORKSPACE.modules, file + '.lnr'));
      servePlainText(res,
          `Module <tt>${file}</tt> removed from <strong>${name}</strong>`);
    } catch(err) {
      console.log(err);
      servePlainText(resp, 'ERROR: Failed to delete file');
    }
  } else {
    servePlainText(res, 'Cannot delete modules from a remote repository');
  }
}

// Remote dataset functionality
// ============================
// This code section implements the retrieval of time series data from the URL
// or file path (on local host) when such a URL or path is specified in the
// Dataset dialog

function anyOSpath(p) {
  // Helper function that converts any path notation to platform notation
  // based on the predominant separator
  const
     s_parts = p.split('/'),
     bs_parts = p.split('\\'),
     parts = (s_parts.length > bs_parts.length ? s_parts : bs_parts);
  // On macOS machines, paths start with a slash, so first substring is empty
  if(parts[0].endsWith(':') && path.sep === '\\') {
    // On Windows machines, add a backslash after the disk (if specified)
    parts[0] += path.sep;
  }
  // Reassemble path for the OS of this machine
  return path.join(...parts);
}

function loadData(res, url) {
  // Passed parameter is the URL or full path
  logAction('Load data from ' + url);
  if(!url) servePlainText(res, 'ERROR: No URL or path');
  if(url.toLowerCase().startsWith('http')) {
    // URL => validate it, and then try to download its content as text
    try {
      new URL(url); // Will throw an error if URL is not valid
      getTextFromURL(url,
          (data, res) => servePlainText(res, data),
          (error, res) => servePlainText(res,
              connectionErrorText(`Failed to get data from <tt>${url}</tt>`)),
          res);
    } catch(err) {
      console.log(err);
      servePlainText(res, `ERROR: Invalid URL <tt>${url}</tt>`);
    }
  } else {
    let fp = anyOSpath(url);
    if(!(fp.startsWith('/') || fp.startsWith('\\') || fp.indexOf(':\\') > 0)) {
      // Relative path => add path to user/data directory
      fp = path.join(WORKSPACE.data, fp);
    }
    fs.readFile(fp, 'utf8', (err, data) => {
        if(err) {
          console.log(err);
          servePlainText(res, `ERROR: Could not read file <tt>${fp}</tt>`);
        } else {
          servePlainText(res, data);
        }
      });
  }
}

// Receiver functionality
// ======================
// Respond to Linny-R receiver actions:
//  listen    - look for a Linny-r model file in the channel directory, and run it
//  abort     - write message to file <original model file name>-abort.txt
//  report    - write data and statistics on all chart variables as two text files
//              having names <original model file name>-data.txt and -stats.txt,
//              respectively
//  call-back - delete model file (to prevent running it again), and then execute
//              the call-back Python script specified for the channel

function receiver(res, sp) {
  // This function processes all receiver actions.
  let
      rpath = anyOSpath(sp.get('path') || ''),
      rfile = anyOSpath(sp.get('file') || '');
  // Assume that path is relative to working directory unless it starts
  // with a (back)slash or specifies drive or volume.
  if(!(rpath.startsWith(path.sep) || rpath.indexOf(':') >= 0 ||
      rpath.startsWith(WORKING_DIRECTORY))) {
    rpath = path.join(WORKING_DIRECTORY, rpath);
  }
  // Verify that the channel path exists
  try {
    fs.opendirSync(rpath);
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: No channel path (${rpath})`);
    return;
  }
  // Get the action from the search parameters
  const action = sp.get('action');
  logAction(`Receiver action:  ${action} ${rpath} ${rfile}`);
  if(action === 'listen') {
    rcvrListen(res, rpath);
  } else if(action === 'abort') {
    rcvrAbort(res, rpath, rfile, sp.get('log') || 'NO EVENT LOG');
  } else if(action === 'report') {
    let run = sp.get('run');
    // Zero-pad run number to permit sorting run report file names in sequence.
    run = (run ? '-' + run.padStart(3, '0') : '');
    let data = sp.get('data') || '',
        stats = sp.get('stats') || '',
        log = sp.get('log') || 'NO EVENT LOG';
    rcvrReport(res, rpath, rfile, run, data, stats, log);
  } else if(action === 'call-back') {  
    rcvrCallBack(res, rpath, rfile, sp.get('script') || '');
  } else {
    servePlainText(res, `ERROR: Invalid action: "${action}"`);
  }
}

function rcvrListen(res, rpath) {
  // "Listens" at the channel, i.e., looks for work to do
  let mdl = '',
      cmd = '';
  try {
    // Look for a model file and/or a command file in the channel directory
    const flist = fs.readdirSync(rpath);
    // NOTE: `flist` contains file names relative to `rpath`
    for(let i = 0; i < flist.length; i++) {
      const f = path.parse(flist[i]);
      if(f.ext === '.lnr' && !mdl) mdl = flist[i];
      if(f.ext === '.lnrc' && !cmd) cmd = flist[i];
    }
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Failed to get file list from <tt>${rpath}</tt>`);
    return;
  }
  // Model files take precedence over command files
  if(mdl) {
    fs.readFile(path.join(rpath, mdl), 'utf8', (err, data) => {
        if(err) {
          console.log(err);
          servePlainText(res, `ERROR: Failed to read model <tt>${mdl}</tt>`);
        } else {
          serveJSON(res, {file: path.parse(mdl).name, model: data});
        }
      });
    return;
  }
  if(cmd) {
    try {
      cmd = fs.readFileSync(path.join(rpath, cmd), 'utf8').trim();
    } catch(err) {
      console.log(err);
      servePlainText(res, `ERROR: Failed to read command file <tt>${cmd}</tt>`);
    }
    // Special command to deactivate the receiver
    if(cmd === 'STOP LISTENING') {
      serveJSON(res, {stop: 1});
    } else {
      // For now, command can only be
      // "[experiment name|]module name[@repository name]"
      let m = '',
          r = '',
          x = '';
      const m_r = cmd.split('@');
      // Repository `r` is local host unless specified
      if(m_r.length === 2) {
        r = m_r[1];
      } else if(m_r.length === 1) {
        r = 'local host';
      } else {
        // Multiple occurrences of @
        servePlainText(res, `ERROR: Invalid command <tt>${cmd}</tt>`);
        return;
      }
      m = m_r[0];
      // Module `m` can be prefixed by an experiment title
      const x_m = m.split('|');
      if(x_m.length === 2) {
        x = x_m[0];
        m = x_m[1];
      }
      // Call repoLoad with its callback function to get the model XML
      repoLoad(res, r.trim(), m.trim(), (res, xml) => serveJSON(res,
          {file: path.parse(cmd).name, model: xml, experiment: x.trim()}));
    }
  } else {
    // Empty fields will be interpreted as "nothing to do"
    serveJSON(res, {file: '', model: '', experiment: ''});
  }
}

function rcvrAbort(res, rpath, rfile, log) {
  const log_path = path.join(rpath, rfile + '-log.txt');
  fs.writeFile(log_path, log, (err) => {
      if(err) {
        console.log(err);
        servePlainText(res,
            `ERROR: Failed to write event log to file <tt>${log_path}</tt>`);
      } else {
        servePlainText(res, 'Remote run aborted');            
      }
    });
}

function rcvrReport(res, rpath, rfile, run, data, stats, log) {
  // Purge reports older than 24 hours.
  try {
    const
      now = new Date(),
      flist = fs.readdirSync(WORKSPACE.reports);
    let n = 0;
    for(let i = 0; i < flist.length; i++) {
      const
          pp = path.parse(flist[i]),
          fp = path.join(WORKSPACE.reports, flist[i]);
      // NOTE: Only consider text files (extension .txt)
      if(pp.ext === '.txt') {
        // Delete only if file is older than 24 hours.
        const fstat = fs.statSync(fp);
        if(now - fstat.mtimeMs > 24 * 3600000) {
          // Delete text file
          try {
            fs.unlinkSync(fp);
            n++;
          } catch(err) {
            console.log('WARNING: Failed to delete', fp);
            console.log(err);
          }
        }
      }
    }
    if(n) console.log(n + ' report file' + (n > 1 ? 's' : '') + ' purged');
  } catch(err) {
    // Log error, but do not abort.
    console.log(err);
  }
  // Now save the reports.
  // NOTE: The optional @ indicates where the run number must be inserted.
  // If not specified, append run number to the base report file name.
  if(rfile.indexOf('@') < 0) {
    rfile += run;
  } else {
    rfile = rfile.replace('@', run);  
  }
  const base = path.join(rpath, rfile);
  let fp;
  try {
    fp = path.join(base + '-data.txt');
    fs.writeFileSync(fp, data);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write data to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(base + '-stats.txt');
    fs.writeFileSync(fp, stats);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write statistics to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(base + '-log.txt');
    fs.writeFileSync(fp, log);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write event log to file <tt>${fp}</tt>`);
  }
  servePlainText(res, `Data and statistics reported for <tt>${rfile}</tt>`);
}

function rcvrCallBack(res, rpath, rfile, script) {
  let file_type = '',
      cpath = path.join(rpath, rfile + '.lnr');
  try {
    fs.accessSync(cpath);
    file_type = 'model';
  } catch(err) {
    cpath = path.join(rpath, rfile + '.lnrc');
    try {
      fs.accessSync(cpath);
      file_type = 'command';
    } catch(err) {
      cpath = '';
    }
  }
  if(cpath) {
    logAction(`Deleting ${file_type} file: ${cpath}`);
    try {
      fs.unlinkSync(cpath);
    } catch(err) {
      console.log(err);
      servePlainText(res,
          `ERROR: Failed to delete ${file_type} file <tt>${rfile}</tt>`);
      return;
    }
  }
  if(!script) {
    servePlainText(res, 'No call-back script to execute');
    return;
  }
  try {
    cmd = fs.readFileSync(path.join(WORKSPACE.callback, script), 'utf8');
    logAction(`Executing callback command "${cmd}"`);
    child_process.exec(cmd, (error, stdout, stderr) => {
        console.log(stdout);
        if(error) {
          console.log(error);
          console.log(stderr);
          servePlainText(res,
              `ERROR: Failed to execute script <tt>${script}</tt>`);
        } else {
          servePlainText(res, `Call-back script <tt>${script}</tt> executed`);
        }
      });
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `WARNING: Call-back script <tt>${script}</tt> not found`);
  }
}

// Basic server functionality
// ===========================
//
// To provide some minimum of security, the files that will be served
// from the (main)/static directory are restricted to specific MIME
// types, files, and sub-directories of (main)/static
const STATIC_FILES = {
    // MIME types of files that can be served
    extensions: {
        js: 'application/javascript',
        xml: 'application/xml',
        wav: 'audio/x-wav',
        ttc: 'font/collection',
        otf: 'font/otf',
        ttf: 'font/ttf',
        icns: 'image/icns',
        png: 'image/png',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        css: 'text/css',
        html: 'text/html',
        txt: 'text/plain'
      },
    // Subdirectories of (main)/static/ directory from which files with
    // accepted MIME types can be served
    directories: {
        '/scripts': ['js'],
        '/images': ['icns', 'ico', 'png', 'svg'],
        '/fonts': ['otf', 'ttc', 'ttf'],
        '/sounds': ['wav']
      },
    // Files that can be served from the (main)/static/ directory itself
    files: [
        '/index.html',
        '/show-png.html',
        '/show-diff.html',
        '/linny-r.css',
        '/favicon.ico',
      ]
  };

function processRequest(req, res, cmd, data) {
  // Make correct response to request
  // NOTE: `data` is a string of form field1=value1&field2=value2& ... etc.
  // regardless of the request method (GET or POST)
  if(permittedFile(cmd)) {
    // Path contains valid MIME file type extension => serve if allowed.
    serveStaticFile(res, cmd);
    return;
  }
  // Be permissive w.r.t. leading and trailing slashes.
  cmd = cmd.replace(/^\/+/, '').replace(/\/+$/, '');
  if(cmd === 'solver') {
    const
        sp = new URLSearchParams(data),
        action = sp.get('action');
    // NOTE: On remote servers, solver actions require authentication.
    if(action === 'logon') {
      // No authentication -- simply return the passed token, "local host"
      // as server name, the name of the solver, the list of installed
      // solvers, and the Linny-R directory.
      serveJSON(res, {
          token: 'local host',
          server: 'local host',
          solver: SOLVER.id,
          solver_list: Object.keys(SOLVER.solver_list),
          path: WORKING_DIRECTORY
        });
    } else if(action === 'png') {
      convertSVGtoPNG(req, res, sp);
    } else if(action === 'change') {
      const sid = sp.get('solver');
      if(SOLVER.changeDefault(sid)) {
        servePlainText(res, 'Default solver set to ' + SOLVER.name);
      } else {
        servePlainText(res, 'WARNING: Failed to change solver to ' + sid);
      }
    } else if(action === 'solve') {
      serveJSON(res, SOLVER.solveBlock(sp));
    } else {
      // Invalid action => return JSON with error message
      const msg = `Invalid action: "${action}"`;
      console.log(msg);
      serveJSON(res, {error: msg});
    }
  } else if(cmd === 'shutdown') {
    // Shut down this server WITHOUT updating, and show page with
    // "shut down" message and restart button.
    clearNewerVersion();
    serveHTML(res, SHUTDOWN_MESSAGE);
    SERVER.close();
  } else if(cmd === 'version') {
    servePlainText(res, 'Current version is ' + VERSION_INFO.current);
  } else if(cmd === 'update') {
    // Shut down this server silently. When the server was started from
    // a batch script, this will update via npm, and then restart.
    // NOTE: Self-protect against overwriting development scripts.
    if(WORKING_DIRECTORY.indexOf('LTR3') >= 0) {
      servePlainText(res, 'No version update in development environment');
    } else {
      setNewerVersion();
      servePlainText(res, 'Installing Linny-R version ' + VERSION_INFO.latest);
      SERVER.close();
    }
  } else if(cmd === 'no-update') {
    // Remove file "newer_version" so no update will take place when
    // server is shut down.
    clearNewerVersion();
    servePlainText(res, 'No update to version ' + VERSION_INFO.latest);
  } else if(cmd === 'auto-check') {
    autoCheck(res);
  } else if(cmd === 'autosave') {
    autoSave(res, new URLSearchParams(data));
  } else if(cmd === 'repo') {
    repo(res, new URLSearchParams(data));
  } else if(cmd === 'load-data') {
    loadData(res, (new URLSearchParams(data)).get('url'));
  } else if(cmd === 'receiver') {
    receiver(res, new URLSearchParams(data));
  } else {
    serveJSON(res, {error: `Unknown Linny-R request: "${cmd}"`});
  }
}

function servePlainText(res, msg) {
  // Serve string `msg` as plain text.
  res.setHeader('Content-Type', 'text/plain');
  res.writeHead(200);
  res.end(msg);
}

function serveHTML(res, html) {
  // Serve HTML string `html`
  res.setHeader('Content-Type', 'text/html');
  res.writeHead(200);
  res.end(html);
}

function serveJSON(res, obj) {
  // Serve object `obj` as JSON string
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify(obj));
}

function permittedFile(path) {
  // Returns TRUE when file specified by `path` may be served
  if(path === '/' || path === '') path = '/index.html';
  if(STATIC_FILES.files.indexOf(path) >= 0) return true;
  const
      parts = path.split('/'),
      file = parts.pop(),
      dir = STATIC_FILES.directories[parts.join('/')],
      ext = file.split('.').pop();
  if(dir && dir.indexOf(ext) >= 0) return true;
  return false;
}

function serveStaticFile(res, path) {
  // Serve the specified path (if permitted: only static files)
  if(path === '/' || path === '') path = '/index.html';
  // Serve files from the (main)/static/ subdirectory
  logAction('Static file: ' + path);
  path = MODULE_DIRECTORY + '/static' + path;
  fs.readFile(path, (err, data) => {
      if(err) {
        console.log(err);
        res.writeHead(404);
        res.end(JSON.stringify(err));
        return;
      }
      const ct = STATIC_FILES.extensions[path.split('.').pop()];
      res.setHeader('Content-Type', ct);
      res.writeHead(200);
      res.end(data);
    });
}

// Convenience functions to fetch data from external URL
// NOTE: the parameters `on_ok` and `on_error` must be functions with two
// parameters:
//  - `result`: either a string with the text obtained from the URL, or an error
//  - `response`: a response object (if any) passed by the function that is
//    calling `getTextFromURL` so that it may be completed and then passed
//    to the browser by the `on_ok` or `on_error` functions

function getTextFromURL(url, on_ok, on_error, response=null) {
  // Gets a text string (plain, HTML, or other) from the specified URL,
  // and then calls `on_ok`, or `on_error` if the request failed
  https.get(url, (res) => {
    // Any 2xx status code signals a successful response, but be strict
    if (res.statusCode !== 200) {
      // Consume response data to free up memory
      res.resume();
      return on_error(new Error('Get text request failed -- Status code: ' +
          res.statusCode), response);
    }
    // Fetch the complete data string
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => on_ok(data, response));
  }).on('error', (e) => on_error(e, response));
}

function postRequest(url, obj, on_ok, on_error, response=null) {
  // Submits `obj` as "POST form" to the remote server specified by `url`
  // NOTE: A trailing slash is crucial here, as otherwise the server will
  // redirect it as a GET !!!
  if(!url.endsWith('/')) url += '/';
  const
      post_data = formData(obj),
      options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(post_data)
            }
        },
      req = https.request(url, options, (res) => {
          if (res.statusCode !== 200) {
            // Consume response data to free up memory
            res.resume();
            return on_error(new Error(`POST request (${url}) failed -- ` +
                `Status code: ${res.statusCode}`), response);
          }
          // Fetch the complete data buffer
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => on_ok(Buffer.concat(chunks), response));
        });
  req.on('error', (e) => on_error(e, response));
  // Add the object as form data to the request body
  req.write(post_data);
  req.end();
}

function formData(obj) {
  // Encodes `obj` as a form that can be POSTed
  const fields = [];
  for(let k in obj) if(obj.hasOwnProperty(k)) {
    fields.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
  }
  return fields.join('&');
}

function connectionErrorText(msg) {
  return 'WARNING: ' + msg + ' - Please check your internet connection';
}

//
// Functions used during initialization
//

function commandLineSettings() {
  // Sets default settings, and then checks the command line arguments.
  const settings = {
      cli_name: (PLATFORM.startsWith('win') ? 'Command Prompt' : 'Terminal'),
      launch: false,
      port: 5050,
      preferred_solver: '',
      user_dir: path.join(WORKING_DIRECTORY, 'user')
    };
  const
      cmd = process.argv[0],
      app = (cmd.endsWith('node.exe') ? 'node' : 'linny-r'),
      usage = `Usage:  ${app} server [options]

Possible options are:
  help               will display these command line options
  launch             will open the Linny-R GUI in a browser window
  port=[number]      will listen at the specified port number
                     (default is 5050; number must be unique for each server)
  solver=[name]      will select solver [name], or warn if not found
                     (name choices: Gurobi, MOSEK, CPLEX, SCIP or LP_solve)
  verbose            will output solver messages to the console
  workspace=[path]   will create workspace in [path] instead of (Linny-R)/user
`;
  for(let i = 2; i < process.argv.length; i++) {
    const lca = process.argv[i].toLowerCase();
    if(lca === 'launch') {
      settings.launch = true;
    } else {
      const av = lca.split('=');
      if(av.length === 1) av.push('');
      if(av[0] === 'port') {
        // Accept any number greater than or equal to 1024.
        const n = parseInt(av[1]);
        if(isNaN(n) || n < 1024) {
          console.log(`WARNING: Invalid port number ${av[1]}`);
        } else {
          settings.port = n;
        }
      } else if(av[0] === 'solver') {
        if(SUPPORTED_SOLVERS.indexOf(av[1]) < 0) {
          console.log(`WARNING: Unknown solver "${av[1]}"`);
        } else {
          settings.preferred_solver = av[1];
        }
      } else if(av[0] === 'workspace') {
        // User directory must be READ/WRITE-accessible.
        try {
          fs.accessSync(av[1], fs.constants.R_OK | fs.constants.W_O);
        } catch(err) {
          console.log(`ERROR: No access to directory "${av[1]}"`);
          process.exit();
        }
        settings.user_dir = av[1];
      } else if(av[0] === 'help') {
        // Print command line options.
        console.log(usage);
        process.exit();
      } else {
        // Terminate script.
        console.log(
            `ERROR: Invalid command line argument "${process.argv[i]}"\n`);
        console.log(usage);
        process.exit();
      }
    }
  }
  return settings;
}

function createWorkspace() {
  // Verify that Linny-R has write access to the user workspace, define
  // paths to sub-directories, and create them if necessary.
  try {
    // See whether the user directory already exists.
    try {
      fs.accessSync(SETTINGS.user_dir, fs.constants.R_OK | fs.constants.W_O);
    } catch(err) {
      // If not, try to create it.
      fs.mkdirSync(SETTINGS.user_dir);
      console.log('Created user directory:', SETTINGS.user_dir);
    }
  } catch(err) {
    console.log(err.message);
    console.log('FATAL ERROR: Failed to create user workspace in',
        SETTINGS.user_dir);
    process.exit();
  }
  // Define the sub-directory paths.
  const ws = {
      autosave: path.join(SETTINGS.user_dir, 'autosave'),
      channel: path.join(SETTINGS.user_dir, 'channel'),
      callback: path.join(SETTINGS.user_dir, 'callback'),
      data: path.join(SETTINGS.user_dir, 'data'),
      models: path.join(SETTINGS.user_dir, 'models'),
      modules: path.join(SETTINGS.user_dir, 'modules'),
      reports: path.join(SETTINGS.user_dir, 'reports'),
      solver_output: path.join(SETTINGS.user_dir, 'solver')
    };
  // Create these sub-directories if not aready there.
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
  // The file containing name, URL and access token for remote repositories.
  ws.repositories = path.join(SETTINGS.user_dir, 'repositories.cfg');
  // For completeness, add path to Linny-R directory.
  ws.working_directory = WORKING_DIRECTORY;
  // Return the updated workspace object.
  return ws;
}

function createLaunchScript() {
  // Creates platform-specific script with Linny-R start-up command
  const
      lines = [
        '# The first line (without the comment symbol #) should be like this:',
        '',
        'cd ' + WORKING_DIRECTORY,
        '# Then this command to launch the Linny-R server should work:',
        '',
        '# After shut-down, check whether new version should be installed:'
      ],
    windows = PLATFORM.startsWith('win'),
    sp = path.join(WORKING_DIRECTORY, 'linny-r.' + (windows ? 'bat' : 'command'));
  if(windows) {
    lines.push(
      ':loop',
      'if exist newer_version (',
      '    del newer_version',
      '    npm update linny-r',
      '    node node_modules\\linny-r\\server',
      '    goto loop',
      ')');
    lines[1] = '# cd C:\\path\\to\\main\\Linny-R\\directory';
    lines[4] = 'node node_modules\\linny-r\\server launch';
  } else {
    lines.push(
      'while test -f newer_version; do',
      '    unlink newer_version',
      '    npm update linny-r',
      '    node node_modules/linny-r/server',
      'done');
    lines[1] = '# cd /path/to/main/Linny-R/directory';
    lines[4] = 'node node_modules/linny-r/server launch';
  }
  try {
    let code = lines.join(os.EOL);
    if(windows) code = code.replaceAll('#', '::');
    try {
      fs.accessSync(sp);
      // Do not overwrite existing script, as it may have been customized
      // by the user. When istalling/updating Linny-R, the post-install
      // script should have renamed it, so typically it is created the
      // first time Linny-R is run after install/update.
    } catch(err) {
      console.log('Creating launch script:', sp);
      fs.writeFileSync(sp, code, 'utf8');
      // On macOS machines, try to make the script executable.
      if(!windows) try {
        fs.chmodSync(sp, '+x');
      } catch(err) {
        console.log('WARNING: Failed to make script executable -- please check');
      }
    }
  } catch(err) {
    console.log('WARNING: Failed to create launch script');
  }
}

/////////////////////////////////////////////////////////////////////////////
//                           Code ends here                                //
/////////////////////////////////////////////////////////////////////////////