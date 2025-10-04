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

// Locate the Downloads directory (appears to be standard across platforms).
const DOWNLOADS_DIRECTORY = path.join(os.homedir(), 'Downloads');

// Output some configuration information to the console.
console.log('Node.js version:', process.version);
console.log('Platform:', PLATFORM, '(' + os.type() + ')');
console.log('Module directory:', MODULE_DIRECTORY);
console.log('Working directory:', WORKING_DIRECTORY);
console.log('Downloads directory:', DOWNLOADS_DIRECTORY);

let USER_NAME = '';    
try {
  USER_NAME = os.userInfo().username;  
  console.log('User name:', USER_NAME);
} catch(err) {
  console.log('WARNING: Failed to get user name');
}

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


function launchGUI() {
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
<p>Then retype <code>./linny-r.command</code> to launch Linny-R.</p>`),
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

// Auxiliary function used by several routines below.

function validModelXML(mxml) {
  // Check whether string passed is valid XML and most likely to be
  // a Linny-R model.
  try {
    const
        parser = new DOMParser(),
        doc = parser.parseFromString(mxml, 'text/xml');
        root = doc.documentElement;
    // Linny-R models have a model element as root.
    if(root.nodeName !== 'model') throw 'XML document has no model element';
    // No error? Then the XML passed the test.
    return true;
  } catch(err) {
    // Otherwise, log the error on the console.
    console.log(err);
  }
  // Fall-through: the XML failed the test.
  return false;
}

function asFileName(s) {
  // Return string `s` in lower case with whitespace converted to a single
  // dash, special characters converted to underscores, and leading and
  // trailing dashes and underscores removed.
  return s.normalize('NFKD').trim()
      .replace(/[\s\-]+/g, '-')
      .replace(/[^A-Za-z0-9_\-]/g, '_')
      .replace(/^[\-\_]+|[\-\_]+$/g, '');
}

function pluralS(n, s) {
  // Return string with noun `s` in singular only if `n` = 1.
  return (n === 0 ? 'No ' : n + ' ') + s + (n === 1 ? '' : 's');
}

// File browser functionality
// ==========================
// For loading and saving models via the File browser, Linny-R communicates
// with the server via function calls like fetch('browse/', x) where x is a
// JSON object with at least the key `action`, which can have one of the
// following values:
//  roots   Return dir info for each of the four root locations.
//  dir     Return list with objects that specify the name of directories
//          and Linny-R model files in the specified location, plus additional
//          information, such as size and time last modified.
//  load    Return the content of the specified file.
//  delete  Delete the specified file from the specified location.
//  store   Write XML content to the specified file in the specified location.
//  purge   Delete all expired autosaved model files.

// Linny-R has a models repository on GitHub:
const
    GITHUB_REPO = 'pwgbots/linny-r-models',
    GITHUB_ROOT_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents`,
    GITHUB_LOAD_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/master/`;

// Only three root directories are accepted:
const
    ROOT_DIRS = {
      home: WORKSPACE.models,
      download: DOWNLOADS_DIRECTORY,
      autosave: WORKSPACE.autosave
    },
    // NOTE: GitHUb root directory is added only when found, and then
    // it will have its full name.
    ROOT_NAMES = {
        home: 'Models in your workspace',
        download: 'Downloaded models',
        autosave: 'Autosaved models' 
      };

//
// Auxiliary functions for browsing the local file system.
//

function countModels(dir) {
  // Traverse tree of directory content objects to compute for each the
  // *total* number of models it contains (including its sub-directories).
  dir.sdcount = dir.subdirs.length;
  dir.mcount = dir.models.length;
  for(const sd of dir.subdirs) {
    countModels(sd);
    dir.mcount += sd.mcount;
    dir.sdcount += sd.sdcount;
  }
  return dir.mcount;
}

function getDirectoryContents(root, rel_path='') {
  // Return sub-directories and model files in as "content object".
  const lookup = {'':
      {
        root: root,
        path: '',
        name: ROOT_NAMES[root],
        subdirs: [],
        models: [],
      }
    };
  try {
    const
        dpl = ROOT_DIRS[root].length + 1,
        entries = fs.readdirSync(ROOT_DIRS[root],
            {withFileTypes: true, recursive: true});
    for(const e of entries) {
      // Get parent path of entry relative to `rel_path`.
      const rpp = e.parentPath.slice(dpl);
      if(e.isFile() && e.name.endsWith('.lnr')) {
        let c = lookup[rpp];
        if(!c) {
          // Find the immediate parent content object.
          const parts = rpp.split(path.sep);
          let pp = '';
          while(lookup[path.join(pp, parts[0])]) {
            pp = path.join(pp, parts.shift());
          }
          c = lookup[pp];
          // Create sub-directory content objects for the remaining parts. 
          for(const p of parts) {
            pp = path.join(pp, p);
            lookup[pp] = {root: root, path: pp, name: p, subdirs: [], models: []};
            c.subdirs.push(lookup[pp]);
            c = lookup[pp];
          }
          // Now `c` should be the "container" for the model file.
        }
        // Get model file size and time last modified.
        const
            stat = fs.statSync(path.join(ROOT_DIRS[root], c.path, e.name)),
            data = {
                name: e.name.slice(0, -4),
                size: stat.size,
                time: stat.mtime
              };
        // Add model file descriptor to the model list.
        c.models.push(data);
      }
    }
  } catch(err) {
    console.log('ERROR: Failed to get root directory contents', err);
  }
  // NOTE: After deleting a model from the directory specified by `rel_path`,
  // there may be no more models left => lookup will be undefined.
  if(lookup[rel_path]) {
    // Set the `mcount` property of all content objects.
    const mc = pluralS(countModels(lookup[rel_path]), 'model');
    console.log(`${mc} in ${ROOT_DIRS[root]}${path.sep}${rel_path}`);
    // Trim leading separators from relative path.
    // while(rel_path.startsWith(path.sep)) rel_path = rel_path.substring(1);
    return lookup[rel_path];
  }
  console.log(`WARNING: Directory ${rel_path} contains no models`);
  return {
      root: root,
      path: rel_path,
      name: rel_path.split(path.sep).pop(),
      subdirs: [],
      models: [],
    };
}

function purgeAutoSaveDir(res, period) {
  // Delete all expired Linny-R model files from the autosave directory.
  const now = new Date();
  period = (period ? parseInt(period) : 24) * 3600000;
  let msg = '';
  try {
    let fail_count = 0;
    const flist = fs.readdirSync(WORKSPACE.autosave);
    for(const fn of flist) {
      // NOTE: Only consider Linny-R model files (extension .lnr).
      if(fn.endsWith('.lnr')) {
        const
            fp = path.join(WORKSPACE.autosave, fn),
            fstat = fs.statSync(fp);
        // Delete if file has expired.
        if(now - fstat.mtimeMs > period) {
          try {
            fs.unlinkSync(fp);
          } catch(err) {
            console.log('WARNING: Failed to delete', fp);
            console.log(err);
            fail_count++;
          }
        }
      }
    }
    if(fail_count) {
      msg = 'WARNING: Failed to delete ' +
          pluralS(fail_count, 'auto-saved model');
    }
  } catch(err) {
    msg = 'WARNING: Failed to purge auto-saved models';
    console.log(msg);
    console.log(err);
  }
  // Empty message indicates success.
  servePlainText(res, msg);
}

//
// Auxiliary functions for browsing GitHub.
//

function fetchGitHubText(response) {
  // Standard first THEN function for FETCH calls.
  if(response.ok) return response.text();
  console.log(`ERROR ${response.status}: ${response.statusText}`);
  return '';
}
  
function parseGitHubDirContents(json) {
  // Parse JSON string and extract names of sub-directories and models.
  const dc = {subdirs: [], models: []};
  try {
    json = JSON.parse(json);
    for(const entry of json) {
      if(entry.type === 'dir') {
        dc.subdirs.push(entry.name);
      } else if(entry.type === 'file' && entry.name.endsWith('.lnr')) {
        // NOTE: GitHub does not pass "time last modified".
        dc.models.push({
            name: entry.name.slice(0, -4),
            size: entry.size,
            time: ''
          });
      }
    }
  } catch(err) {
    console.log('ERROR: Failed to parse GitHub repository contents', err);
  }
  return dc;
}

function fetchGitHubRoot(res) {
  // Get only the top-level directory of the Linny-R models on GitHub.
  fetch(GITHUB_ROOT_URL)
    .then(fetchGitHubText)
    .then((json) => {
        // NOTE: Do not parse empty string; just ignore it.
        if(json) {
          // Parsing will set `subdirs` (as name list) and `models`.
          const dir = parseGitHubDirContents(json);
          // Add the other properties.
          dir.root = 'github';
          dir.path = '';
          dir.name = 'Models on GitHub';
          if(dir.subdirs.length) {
            // Set the parent and get the sub-dirs.
            dir.parent = null;
            fetchGitHubDirs(res, dir);
          } else {
            // Serve the root dir "as is".
            serveJSON(res, dir);
          }
        }
      })
    .catch((err) => {
        console.log('NOTE: No connection with GitHub', err);
      });
}

function stripParents(dir) {
  // Traverse tree of directory content objects to delete the parent pointers.
  for(const sd of dir.subdirs) stripParents(sd);
  delete dir.parent;
}

function fetchGitHubDirs(res, dir) {
  // For each sub-directory specified by `dir` that has not yet been read,
  // fetch its contents as a directory content object.
  let sub_name = '';
  // See if any sub-directory still needs fetching.
  dir_path = dir.path;
  for(const sd of dir.subdirs) {
    if(typeof sd === 'string') {
      sub_name = sd;
      break;
    }
  }
  if(!sub_name) {
    // All sub-directories have been fetched.
    if(!dir.parent) {
      // Serve the complete directory tree.
      stripParents(dir);
      serveJSON(res, dir);
    } else {
      // Continue with the parent directory.
      fetchGitHubDirs(res, dir.parent);
    }
    return;
  }
  // Sub-directory with name `sub_name` needs fetching.
  const sub_path = dir.path + '/' + sub_name;
  fetch(GITHUB_ROOT_URL + sub_path)
    .then(fetchGitHubText)
    .then((json) => {
        // NOTE: Do not parse empty string; just ignore it.
        if(json) {
          // Parsing will set subdirs (as name list) and models.
          const sub_dir = parseGitHubDirContents(json);
          // Add the other properties.
          sub_dir.root = 'github';
          sub_dir.path = sub_path;
          sub_dir.name = sub_name;
          sub_dir.parent = dir;
          // Replace sub-directory name by its directory contents object.
          const sdi = dir.subdirs.indexOf(sub_name);
          if(sdi >= 0) dir.subdirs[sdi] = sub_dir;
          if(sub_dir.subdirs.length) {
            // Depth-first tree traversal: get the sub-dirs of the sub-dir.
            fetchGitHubDirs(res, sub_dir);
          } else {
            // Continue with this directory.
            fetchGitHubDirs(res, dir);
          }
        }
      })
    .catch((err) => {
        console.log('NOTE: No connection with GitHub', err);
      });
}

//
// Main function that carries out File browser actions.
//

function browse(res, sp) {
  // Process any one of the file browser commands.
  const action = sp.get('action').trim();
  if(action === 'roots') {
    logAction('Get file browser root directories');
    // Return object with dir info for all four root locations. 
    const roots = {};
    for(const key of ['home', 'download', 'autosave']) {
      roots[key] = getDirectoryContents(key);
    }
    serveJSON(res, roots);
    return;
  }
  if(action === 'purge') {
    // Delete all expired files from auto-save directory.
    logAction('Purge auto-saved files');
    purgeAutoSaveDir(res, sp.get('period'));
    return;
  }
  if(action === 'github') {
    // Serve the GitHub directory tree as JSON.
    logAction('Get directory tree from GitHub');
    fetchGitHubRoot(res);
    return;
  }
  // All other actions require root and path.
  const
      root = sp.get('root'),
      rel_path = sp.get('path');
  let file_name = sp.get('model') || '';
  if(file_name && !file_name.endsWith('.lnr')) file_name += '.lnr';
  logAction(`File browser: ${action}  ${root}  ${rel_path}  ${file_name}`);
  let msg = '',
      full_path = '';
  if(root === 'github') {
    if(action === 'load') {
      // Serve the GitHub file contents as plain text.
      fetch(GITHUB_LOAD_URL + rel_path + '/' + file_name)
        .then(fetchGitHubText)
        .then((data) => servePlainText(res, data))
        .catch(() => {
            console.log('NOTE: No connection with GitHub');
            // Serve "empty text" if no connection.
            servePlainText(res, '');
          });
      return;
    } else {
      msg = 'ERROR: Linny-R repository on GitHub is read-only';
    }
  } else if(!ROOT_DIRS.hasOwnProperty(root)) {
    msg = `ERROR: Invalid root: "${root}"`;
  }
  if(!msg) {
    // Action on local host.
    let dir_path = path.join(ROOT_DIRS[root], rel_path);
    full_path = path.join(dir_path, file_name);
    // NOTE: When storing, the file name may be a path. In that case,
    // sub-directories may need to be created.
    if(action === 'store') {
      // When storing, the relative path must exist...
      if(!fs.existsSync(dir_path)) {
        msg = `ERROR: Path "${dir_path}" not found`;
      } else {
        // ... and the file name may specify sub-directories.
        const parts = file_name.split(path.sep);
        while(parts.length > 1) {
          try{
            dir_path = path.join(dir_path, parts.shift());
            if(!fs.existsSync(dir_path)) fs.mkdirSync(dir_path);
          } catch(err) {
            msg = `ERROR: Failed to create sub-directory "${dir_path}"`;
            console.log(err);
            break;
          }
        }
      }
    } else if(!fs.existsSync(full_path)) {
      // For other actions, full path must be an existing file or directory.
      msg = `ERROR: Path "${full_path}" not found`;
    }
  }
  if(msg) {
    // Report error and exit.
    console.log(msg);
    servePlainText(res, msg);
    return;
  }
  // Action and path have been validated => proceed.
  if(action === 'dir') {
    const rdc = getDirectoryContents(root, rel_path);
    serveJSON(res, rdc);
    return;
  }
  let error = null;
  if(action === 'load') {
    try {
      let data = fs.readFileSync(full_path, 'utf8');
      // Serve file contents and exit.
      servePlainText(res, data);
      return;
    } catch(err) {
      msg = `ERROR: Failed to read file "${full_path}"`;
      error = err;
    }
  } else if(action === 'delete') {
    try {
      fs.unlinkSync(full_path);
      servePlainText(res, `Deleted file <tt>${full_path}</tt>`);
      return;
    } catch(err) {
      msg = `WARNING: Failed to delete "${full_path}"`;
      error = err;          
    }
  } else if(action === 'store') {
    try {
      const in_over = (fs.existsSync(full_path) ? 'by overwriting' : 'in');
      fs.writeFileSync(full_path, sp.get('xml'));
      servePlainText(res, `Model saved ${in_over} <tt>${full_path}</tt>`);
      return;
    } catch(err) {
      msg = `WARNING: Failed to write to file "${full_path}"`;
      error = err;          
    }
  } else {
    msg = `ERROR: Invalid file browser action: "${action}"`;
  }
  // Report error (if any).
  if(msg) {
    console.log(msg);
    if(error) console.log(error);
  }
  // Empty message indicates success.
  servePlainText(res, msg);
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
  // Passed parameter is the URL or full path.
  logAction('Load data from ' + url);
  if(!url) servePlainText(res, 'ERROR: No URL or path');
  if(url.toLowerCase().startsWith('http')) {
    // URL => validate it, and then try to download its content as text.
    try {
      new URL(url); // Will throw an error if URL is not valid.
      getTextFromURL(url,
          (data, res) => servePlainText(res, data),
          (error, res) => servePlainText(res,
              `WARNING: Failed to get data from <tt>${url}</tt>`),
          res);
    } catch(err) {
      console.log(err);
      servePlainText(res, `ERROR: Invalid URL <tt>${url}</tt>`);
    }
  } else {
    let fp = anyOSpath(url);
    if(!(fp.startsWith('/') || fp.startsWith('\\') || fp.indexOf(':\\') > 0)) {
      // Relative path => add path to user/data directory.
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
//  listen    - Look for file "command.json" in the channel directory, read it,
//              delete it (to prevent executing it again), and execute it.
//  abort     - Write message to file "abort.txt" in the channel directory.
//  report    - Write data and statistics on all chart variables as two text
//              files: "data.txt" and "stats.txt".
//  call-back - Read an OS command line from file "call-back.txt" in the channel
//              directory, and execute it.

function receiver(res, sp) {
  // This function processes all receiver actions.
  // NOTE: If no channel name, the Receiver is not listening, but used by the
  // Virtual Machine and the Experiment manager to report outcomes.
  let rpath = '';
  const
      channel_name = asFileName(sp.get('channel') || ''),
      action = sp.get('action');
  if(action === 'channel-list') {
    // Serve a list of Linny-R model files in the models directory
    // of the user workspace.
    rcvrChannelList(res);
    return;
  } else if(channel_name) {
    // Path relative to the channel directory of the user workspace.
    rpath = path.join(WORKSPACE.channel, channel_name);
  } else if(action === 'report') {
    // Path is the reports directory of the user workspace.
    rpath = WORKSPACE.reports;
  } else {
    servePlainText(res, `ERROR: No channel name`);
    return;
  }
  // Verify that the receiver path exists.
  try {
    const dir = fs.opendirSync(rpath);
    dir.close();
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Receiver cannot find path "${rpath}"`);
    return;
  }
  logAction(`Receiver action: ${action} ${rpath}`);
  if(action === 'listen') {
    rcvrListen(res, rpath);
  } else if(action === 'abort') {
    rcvrAbort(res, rpath, sp.get('log') || 'NO EVENT LOG');
  } else if(action === 'report') {
    let run = sp.get('run');
    // Zero-pad run number to permit sorting run report file names in sequence.
    run = (run ? '-' + run.padStart(3, '0') : '');
    const
        file = sp.get('file') || '',
        data = sp.get('data') || '',
        stats = sp.get('stats') || '',
        log = sp.get('log') || 'NO EVENT LOG';
    rcvrReport(res, rpath, file, run, data, stats, log);
  } else if(action === 'call-back') {  
    rcvrCallBack(res, rpath);
  } else {
    servePlainText(res, `ERROR: Invalid action "${action}"`);
  }
}

function rcvrChannelList(res) {
  // Serve a JSON list of channel objects {name: string, callback: Boolean}
  // where callback is TRUE only if the channel directory contains a file
  // "call-back.py". 
  try {
    const
        channels = [],
        clist = fs.readdirSync(WORKSPACE.channel, {withFileTypes: true})
            .filter(de => de.isDirectory())
            .map(de => de.name);
    for(const cn of clist) {
      const cb = fs.existsSync(path.join(WORKSPACE.channel, cn, 'call-back.py'));
      channels.push({name: cn, callback: cb});
    }
    serveJSON(res, channels);
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Failed to get channel list`);
  }
}


function rcvrListen(res, rpath) {
  // "Listen" at the channel means: look in the channel directory for a Linny-R
  // command file. This file is typically placed there by a (Python) script.
  const cpath = path.join(rpath, 'command.json');
  if(!fs.existsSync(cpath)) {
    // If no command file is found, return a "don't stop listening" command.
    serveJSON(res, {stop: false});
    return;
  }
  // Read the command file.
  try {
    json = fs.readFileSync(cpath, 'utf8').trim();
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Failed to read <tt>${cpath}</tt>`);
    return;
  }
  // Check that it contains a valid JSON string.
  try {
    json = JSON.parse(json);
  } catch(err) {
    console.log(err);
    servePlainText(res, `WARNING: JSON syntax error in <tt>${cpath}</tt>`);
    return;
  }
  // Delete the JSON command file (to prevent that it is executed twice).
  logAction(`Deleting file: ${cpath}`);
  try {
    fs.unlinkSync(cpath);
  } catch(err) {
    console.log(err);
    servePlainText(res, `ERROR: Failed to delete <tt>${cpath}</tt>`);
    return;
  }
  // Check that the channel name specified by the JSON command file corresponds
  // with the channel that is listened to.
  if(!(json.channel && rpath.endsWith(path.sep + json.channel))) {
    servePlainText(res, `ERROR: Command channel mismatch (${json.channel})`);
    return;    
  }
  
  // The object obtained by parsing the JSON string can have these properties:
  // - model:      Name of a .lnr file to be found in either the channel directory
  //               or in user/models/.
  // - csv:        Name of a CSV file with dataset data to be found either in the
  //               channel directory or in user/data/.
  // - run:        Boolean indicating whether the current model should be run.
  // - stop:       Boolean indicating whether to stop listening (i.e., deactivate
  //               the Receiver)
  
  // NOTE: When `stop` property is set, ignore all other properties.
  if(json.stop) {
    serveJSON(res, {stop: true});
  } else {
    // The server only checks whether the files exist, and then passes on their
    // contents to the receiver as additional properties of the `json` object.
    if(json.csv) {
      try {
        // JSON may specify the name of a CSV file with dataset data.
        try {
          // This file must exist either in the channel directory...
          json.datasets = fs.readFileSync(path.join(cpath, json.csv),
              'utf8').trim();
        } catch(err) {
          // ... or in the data directory in the user workspace.
          json.datasets = fs.readFileSync(path.join(WORKSPACE.data, json.csv),
              'utf8').trim();
        }
      } catch(err) {
        // Report error if CSV file not found in either location.
        console.log(err);
        servePlainText(res, `ERROR: Failed to read data file <tt>${json.csv}</tt>`);
        return;
      }
    }
    if(json.model) {
      // If JSON has property `model`, this should be the name of a .lnr file.
      const fp = path.parse(json.model);
      // Add the default Linny-R extension if no extension specified.
      if(!fp.ext) json.model += '.lnr';
      let model_xml = '';
      try {
        try {
          // This .lnr file must exist either in the channel directory...
          model_xml = fs.readFileSync(path.join(cpath, json.model),
              'utf8').trim();
        } catch(err) {
          // ... or in the models directory in the user workspace...
          model_xml = fs.readFileSync(path.join(WORKSPACE.models, json.model),
              'utf8').trim();
        }
      } catch(err) {
        // Report error if .lnr file not found in either location.
        console.log(err);
        servePlainText(res, `ERROR: Failed to read model file <tt>${json.model}</tt>`);
        return;
      }
      // Validate model XML.
      if(validModelXML(model_xml)) {
        json.xml = model_xml;
        serveJSON(res, json);
      } else {
        servePlainText(res,
            `ERROR: File <tt>${json.model}</tt> is not a Linny-R model`);
      }
      return;
    }
  }
}

function rcvrAbort(res, rpath, log) {
  // Write log to text file in channel and respond with notification.
console.log('HERE abort: path run', rpath, run);
  const log_path = path.join(rpath, 'log.txt');
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
  console.log('HERE report: path file run', rpath, rfile, run);
  // Always purge reports older than 24 hours from the user workspace.
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
          // Delete text file.
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
  if(rfile.indexOf('@') < 0) {
    rfile += run;
  } else {
    rfile = rfile.replace('@', run);  
  }
  let fp,
      base = path.join(rpath, rfile);
  // NOTE: Join with empty string does not add a directory separator.
  if(base === rfile) base += path.sep;
  try {
    fp = path.join(base + 'data.txt');
    fs.writeFileSync(fp, data);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write data to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(base + 'stats.txt');
    fs.writeFileSync(fp, stats);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write statistics to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(base + 'log.txt');
    fs.writeFileSync(fp, log);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write event log to file <tt>${fp}</tt>`);
  }
  servePlainText(res, 'Data and statistics reported' +
      (rfile ? ` for <tt>${rfile}</tt>` : ''));
}

function rcvrCallBack(res, rpath) {
  // NOTE: For now, the only permitted call-back application is a Python
  // script "call-back.py". This may be expanded to permit other executable
  // applications to perform the call-back function.
  try {
    cmd = 'python ' + path.join(rpath, 'call-back.py');
    logAction(`Executing call-back script: ${cmd}`);
    child_process.exec(cmd, (error, stdout, stderr) => {
        console.log(stdout);
        if(error) {
          console.log(error);
          console.log(stderr);
          servePlainText(res,
              `ERROR: Failed to execute script <tt>${cmd}</tt>`);
        } else {
          servePlainText(res, `Call-back script executed`);
        }
      });
  } catch(err) {
    console.log(err);
    servePlainText(res, 'ERROR: Receiver call-back failed');
  }
}

// Default model properties functionality
// ======================================
// The default model properties are specified in file "linny-r-config.js".
// To permit the modeler to customize these values without having to change
// JavaScript files, a subset of model properties can be stored as a JSON file
// "defaults.json" in the user workspace.

function readDefaultsFile() {
  // Return object parsed from JSON string in defaults file if it exists,
  // or error message string when exception occurs.
  const dpath = path.join(SETTINGS.user_dir, 'defaults.json');
  if(fs.existsSync(dpath)) {
    try {
      json = fs.readFileSync(dpath);
      try {
        return JSON.parse(json);
      } catch(err) {
        console.log(err);
        return 'ERROR: Invalid contents of defaults file';
      }
    } catch(err) {
      console.log(err);
      return 'ERROR: Failed to read from defaults file';
    }
  }
  // Empty string denotes: no JSON, no exception.
  return '';
}

function defaults(res, sp) {
  // Handle the defaults request. When the 'change' parameter is set, then
  // this should be the JSON string to be writen to the defaults file.
  // If not set, then the JSON string is read from the file (if any).
  const
      dpath = path.join(SETTINGS.user_dir, 'defaults.json'),
      change = sp.get('change');
  let msg = '';
  if(change) {
    logAction('Change default model properties');
    // NOTE: No validation of properties; any JSON string is accepted.
    let json = '';
    try {
      json = JSON.parse(change);
      try {
        fs.writeFileSync(dpath, change);
        serveJSON(res, json);
        // Exit if successful.
        return;
      } catch(err) {
        console.log(err);
        msg = 'ERROR: Failed to write to defaults file';
      }
    } catch(err) {
      console.log(err);
      msg = 'ERROR: Invalid default values';
    }
    if(msg) {
      console.log(msg);
      servePlainText(res, msg);
    }
  } else {
    logAction('Read default model properties');
    // NOTE: Reader will return parsed JSON as object, or error message
    // as string.
    json = readDefaultsFile();
    if(typeof json === 'object') {
      serveJSON(res, json);
      return;
    }
    msg = json;
  }
  // Fall-through: `msg` will be ignored when empty.
  servePlainText(res, msg);
}

// Auto-save settings
// ==================
// NOTE: Auto-save settings are read when Linny-R is started in a browser,
// in response to the logon request. They can be updated via the 'autosave'
// request. The function below processes this request.

function storeAutoSaveSettings(res, sp) {
  logAction('Store auto-save settings');
  const
      aspath = path.join(SETTINGS.user_dir, 'auto-save.json'),
      m = sp.get('minutes'),
      h = sp.get('hours');
  let msg = '';
  if(!m || !h) {
    msg = 'Invalid auto-save settings';
  } else {
    const ass = {minutes: parseInt(m), hours: parseInt(h)};
    if(isNaN(ass.minutes) || isNaN(ass.hours)) {
      msg = 'Invalid auto-save settings';
    } else {
      try {
        fs.writeFileSync(aspath, JSON.stringify(ass));
        // Exit on success.
        servePlainText(res, 'Auto-save settings have been changed');
        return;
      } catch(err) {
        console.log(err);
        msg = 'Failed to write to auto-save settings file';
      }
    }
  }
  // Fall-through indicates error.
  servePlainText(res, 'ERROR: ' + msg);
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
  // Make correct response to request.
  // NOTE: `data` is a string of form field1=value1&field2=value2& ... etc.
  // regardless of the request method (GET or POST).
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
      // solvers, and some more server-dependent properties.
      const json = {
          token: 'local host',
          server: 'local host',
          solver: SOLVER.id,
          solver_list: Object.keys(SOLVER.solver_list),
          // The Linny-R directory.
          path: WORKING_DIRECTORY,
          // The directory separator (backslash for Windows, otherwise slash).
          separator: path.sep,
          // The user name on this machine.
          user_name: USER_NAME,
          // Default auto-save settings.
          // NOTE: Servers that do not support auto-saving should not set
          // this property, or set it to NULL.
          autosave: {minutes: 10, hours: 24}
        };
      // Get default model properties from JSON file in user directory
      // (if it exists).
      const defaults = readDefaultsFile();
      if(typeof defaults === 'object') {
        json.defaults = defaults;
      }
      // Get custom auto-save settings from JSON file in user directory
      // (if it exists).
      const as_path = path.join(SETTINGS.user_dir, 'auto-save.json');
      if(fs.existsSync(as_path)) {
        try {
          let as = fs.readFileSync(as_path);
          try {
            as = JSON.parse(as);
            json.autosave = as;
          } catch(err) {
            console.log('WARNING: Invalid auto-save settings', err);
          }
        } catch(err) {
          console.log('WARNING: Failed to read auto-save settings', err);
        }
      }
      serveJSON(res, json);
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
  } else if(cmd === 'browse') {
    browse(res, new URLSearchParams(data));
  } else if(cmd === 'load-data') {
    loadData(res, (new URLSearchParams(data)).get('url'));
  } else if(cmd === 'receiver') {
    receiver(res, new URLSearchParams(data));
  } else if(cmd === 'defaults') {
    defaults(res, new URLSearchParams(data));
  } else if(cmd === 'autosave') {
    storeAutoSaveSettings(res, new URLSearchParams(data));
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
      data: path.join(SETTINGS.user_dir, 'data'),
      models: path.join(SETTINGS.user_dir, 'models'),
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