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
Copyright (c) 2020-2022 Delft University of Technology

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
    // The version number of this Linny-R server in Node.js
    VERSION_NUMBER = '1.1.2',
    
    // The URL of the official Linny-R website (with the most recent release)
    PUBLIC_LINNY_R_URL = 'https://sysmod.tbm.tudelft.nl/linny-r',

    // The current working directory (from where Node.js was started) is
    // assumed to be the main directory
    path = require('path'),
    WORKING_DIRECTORY = process.cwd(),
    MAIN_DIRECTORY = path.join(WORKING_DIRECTORY, 'node_modules', 'linny-r'),
    
    // Get the required built-in Node.js modules
    child_process = require('child_process'),
    crypto = require('crypto'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    os = require('os'),

    // Get the platform name (win32, macOS, linux) of the user's computer
    PLATFORM = os.platform();    

// Immediately output some configuration information to the console
console.log('\nNode.js server for Linny-R version', VERSION_NUMBER);
console.log('Node.js version:', process.version);
console.log('Platform:', PLATFORM, '(' + os.type() + ')');
console.log('Main directory:', MAIN_DIRECTORY);
console.log('Working directory:', WORKING_DIRECTORY);

// Only then require the Node.js modules that are not "built-in"

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

// Load class MILPSolver
const MILPSolver = require('./static/scripts/linny-r-milp.js');

///////////////////////////////////////////////////////////////////////////////
//                Code executed at start-up continues here                   //
///////////////////////////////////////////////////////////////////////////////

// Default settings are used unless these are overruled by arguments on the
// command line. Possible arguments are:
//  - port=[number]     will make the server listen at port [number]
//  - solver=[name]     will select solver [name], or warn if not found
//  - workspace=[path]  will create workspace in [path] instead of (main)/user
const SETTINGS = commandLineSettings();
    
// The workspace defines the paths to directories where Linny-R can write files
const WORKSPACE = createWorkspace();
    
// Initialize the solver
const SOLVER = new MILPSolver(SETTINGS, WORKSPACE);

// Create launch script
createLaunchScript();

// Create the HTTP server
const SERVER = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:' + SETTINGS.port);
    // When POST, first get all the full body
    if(req.method === 'POST') {
      let body = '';
      req.on('data', (data) => body += data);
      req.on('end', () => processRequest(req, res, u.pathname, body));
    } else if(req.method === 'GET') {
      processRequest(req, res, u.pathname, u.search);
    }
  });

// Start listening at the specified port number
console.log('Listening at: http://127.0.0.1:' + SETTINGS.port);
SERVER.listen(SETTINGS.port);

// Finally, launch the GUI if this command line argument is set
if(SETTINGS.launch) {
  console.log('Launching Linny-R in the default browser'); 
  const cmd = (PLATFORM.startsWith('win') ? 'start' : 'open');
  child_process.exec(cmd + ' http://127.0.0.1:' + SETTINGS.port,
      (error, stdout, stderr) => {
          console.log('NOTICE: Failed to launch GUI in browser');
          console.log(stdout);
          console.log(stderr);
        });
}

// Version check & update functionality
// ====================================
// This section of code implements server responses to requests made by the
// browser immediately after loading the GUI page (`index.html`), or when the
// user clicks on the link "Version ..." below the Linny-R logo in the upper
// left corner of the GUI page.

const

VERSION_MESSAGE = `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8">
  <title>Linny-R version information</title>
  <link rel="shortcut icon" type="image/png" href="../images/icon.png">
  <style>
    body {
      font-family: sans-serif;
      font-size: 16px;
    }
    #linny-r-logo {
      height: 40px;
      margin-bottom: -10px;
    }
  </style>
</head>
<body>
  <img id="linny-r-logo" src="../images/logo.png">
  %1%
</body>
</html>`,

NO_INTERNET_MESSAGE = `
<h3>Version check failed</h3>
<p>
  No contact with the on-line Linny-R server --
  please check your internet connection.
</p>`,

UP_TO_DATE_MESSAGE = `
<h3>Version JS-%1% is up-to-date</h3>
<p>Released on %2%</p>`,

DOWNLOAD_MESSAGE = `
<h3>Latest version is %1%</h3>
<p>Released on %2%</p>`,

SHUTDOWN_MESSAGE = `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8">
  <title>Linny-R server shutdown</title>
  <link rel="shortcut icon" type="image/png" href="../images/icon.png">
  <style>
    body {
      font-family: sans-serif;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <h3>Linny-R server (127.0.0.1) is shutting down</h3>
  <p>To upgrade and/or restart Linny-R, please switch to your
      ${SETTINGS.cli_name} window and there at the prompt:
  <p>To upgrade to a newer version of Linny-R, first type:</p>
  <p>&nbsp;&nbsp;<tt>npm update linny-r</tt><p>
  <p>To restart the server, type:</p>
  <p>&nbsp;&nbsp;<tt>node server</tt></p>
  <p>
    Then switch back to this window, and click
    <button type="button"
      onclick="window.location.href = 'http://127.0.0.1:${SETTINGS.port}';">
      Restart
    </button>
  </p>
</body>
</html>`;


function compareVersions(v1, v2) {
  // Robust comparison of version numbers
  nrs1 = (v1 + '.0.0.0').split('.');
  nrs2 = (v2 + '.0.0.0').split('.');
  for(i = 0; i < 4; i++) {
    nrs1[i] = nrs1[i].padStart(6, '0');
    nrs2[i] = nrs2[i].padStart(6, '0');
  }
  v1 = nrs1.slice(0, 4).join('.');
  v2 = nrs2.slice(0, 4).join('.');
  if(v1 > v2) return 1;
  if(v1 < v2) return -1;
  return 0;
}

function checkVersion(res, version) {
  // Check whether current version is the most recent
  console.log('Check version:', version);
  if(!version) {
    serveHTML(res, '<h3>No version number specified</h3>');
    return;
  }
  version = version.split('-').pop();
  getTextFromURL(PUBLIC_LINNY_R_URL + '/check-version/?info',
      // The `on_ok` function
      (data, res) => {
          const
              info = data.split('|');
          // Should be [version, release date]
          if(info.length === 2) {
            if(compareVersions(version, info[0]) >= 0) {
              message = UP_TO_DATE_MESSAGE.replace(
                  '%1%', info[0]).replace('%2%', info[1]);
            } else {
              message = DOWNLOAD_MESSAGE.replace(
                  '%1%', info[0]).replace('%2%', info[1]);
            }
            serveHTML(res, VERSION_MESSAGE.replace('%1%', message));
          }
        },
      // The `on_error` function
      (error, res) => {
          console.log(error);
          serveHTML(res, NO_INTERNET_MESSAGE);
        },
      // The response object
      res);
}

function autoCheck(res) {
  // Compares the version number in the static file `index.html`
  // with the version number in the corresponding file on the official
  // Linny-R website, and serves a status string that indicates whether
  // a newer release is available
  const gpath = path.join(MAIN_DIRECTORY, 'static', 'index.html');
  // Read the globals script
  fs.readFile(gpath, 'utf8', (err, data) => {
      let v_match = null;
      if(err) {
        console.log('WARNING: Failed to read file', gpath);
      } else {
        // Extract the version number
        v_match = data.match(/LINNY_R_VERSION = '(.+?)'/);
        if(!v_match) console.log('WARNING: No version number found');
      }
      if(!v_match) {
        servePlainText(res,'no version');
        return;
      }
      let version = v_match[1];
      // Get the current `index.html` file from the official Linny-R server 
      getTextFromURL(PUBLIC_LINNY_R_URL + '/check-version/?info',
          // The `on_ok` function: compare versions and return status
          (data, res) => {
              let check = 'no match';
              const
                  info = data.split('|');
              // Should be [version, release date]
              if(info.length === 2) {
                if(compareVersions(version, info[0]) >= 0) {
                  check = 'up-to-date';
                } else {
                  check = info[0] + '|' + info[1];
                }
              }
              servePlainText(res, check);
            },
          // The `on_error` function
          (error, res) => {
              console.log(error);
              servePlainText(res, 'no match');
            },
          // The response object
          res);       
    });
}

// Repository functionality
// ========================
// For repository services, the Linny-R JavaScript application communicates with
// the server via calls to the server like $.post('repo', x) where x is a JSON
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
  console.log('Repository action:', action);
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
  servePlainText(res, `ERROR: Invalid action: "${action}"`);
}

function asFileName(s) {
  // Returns string `s` with whitespace converted to a single dash, and special
  // characters converted to underscores
  s = s.trim().replace(/[\s\-]+/g, '-');
  return s.replace(/[^A-Za-z0-9_\-]/g, '_');
}

function repositoryByName(name) {
  // Returns array [name, url, token] if `name` found in file `repository.cfg`
  repo_list = fs.readFileSync(WORKSPACE.repositories, 'utf8').split('\n');
  for(let i = 0; i < repo_list.length; i++) {
    rbn = repo_list[i].trim().split('|');
    while(rbn.length < 2) rbn.push('');
    if(rbn[0] === name) return rbn;
  }
  console.log(`ERROR: Repository "${name}" not found`);
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
  url = url.substring(0, i);
  try {
    test = new URL(url);
  } catch(err) {
    return servePlainText(res, 'WARNING: Invalid URL');
  }
  // Error callback function is used twice, so define it here
  const noConnection = (error, res) => {
        console.log(error);
        servePlainText(res, 'ERROR: Failed to connect to ' + url);
      };
  // Verify that the URL points to a Linny-R repository
  postRequest(url, {action: 'id'},
      // The `on_ok` function
      (data, res) => {
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
                    if(data !== 'Authenticated') {
                      servePlainText(res, data);
                      return;
                    }
                    list = fs.readFileSync(
                        WORKSPACE.repositories, 'utf8').split('\n');
                    for(let i = 0; i < list.length; i++) {
                      nu = entry.trim().split('|');
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
              servePlainText(res,
                  `ERROR: Failed to access remote repository "${rname}"`);
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
          servePlainText(res, 'ERROR: Failed to connect to' + r[1]);
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
    // Linny-R model have a model element as root
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
                servePlainText(res, 'ERROR: Failed to connect to' + r[1]);
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
  // Helper function that converts Unix path notation (with slashes) to
  // Windows notation if needed
  if(p.indexOf('/') < 0) return p;
  p = p.split('/');
  // On macOS machines, paths start with a slash, so first substring is empty
  if(p[0].length === 0) {
      // In that case, add the leading slash
    return '/' + path.join(...p);
  } else if(p[0].endsWith(':') && path.sep === '\\') {
    // On Windows machines, add a backslash after the disk (if specified)
    path[0] += path.sep;
  }
  // Reassemble path for the OS of this machine
  return path.join(...p);
}

function loadData(res, url) {
  // Passed parameter is the URL or full path
  console.log('Load data from', url);
  if(!url) servePlainText(res, 'ERROR: No URL or path');
  if(url.toLowerCase().startsWith('http')) {
    // URL => validate it, and then try to download its content as text
    try {
      new URL(url); // Will throw an error if URL is not valid
      getTextFromURL(url,
          (data, res) => servePlainText(res, data),
          (error, res) => servePlainText(res,
              `ERROR: Failed to get data from <tt>${url}</tt>`),
          res);
    } catch(err) {
      console.log(err);
      servePlainText(res, `ERROR: Invalid URL <tt>${url}</tt>`);
    }
  } else {
    const fp = anyOSpath(url);
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
  //This function processes all receiver actions
  let
      rpath = anyOSpath(sp.get('path') || ''),
      rfile = anyOSpath(sp.get('file') || '');
  // Assume that path is relative to channel directory unless it starts with
  // a (back)slash or specifiess drive or volume
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
  console.log('Receiver action:', action, rpath, rfile);
  if(action === 'listen') {
    rcvrListen(res, rpath);
  } else if(action === 'abort') {
    rcvrAbort(res, rpath, rfile, sp.get('log') || 'NO EVENT LOG');
  } else if(action === 'report') {
    let run = sp.get('run');
    // Zero-pad run number to permit sorting run report file names in sequence
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
  try {
    let fp = path.join(rpath, rfile + run + '-data.txt');
    fs.writeFileSync(fp, data);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write data to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(rpath, rfile + run + '-stats.txt');
    fs.writeFileSync(fp, stats);
  } catch(err) {
    console.log(err);
    servePlainText(res,
        `ERROR: Failed to write statistics to file <tt>${fp}</tt>`);
    return;
  }
  try {
    fp = path.join(rpath, rfile + run + '-log.txt');
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
    console.log('Deleting',  file_type, ' file:', cpath);
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
    console.log(`Executing callback command "${cmd}"`);
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
        '/sounds': ['wav'],
        // NOTE: diagrams will actually be served from (main)/user/diagrams/
        '/diagrams': ['png', 'svg']
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
    // Path contains valid MIME file type extension => serve if allowed
    serveStaticFile(res, cmd);
  } else if(cmd === '/solver/') {
    const
        sp = new URLSearchParams(data),
        action = sp.get('action');
    // NOTE: on remote servers, solver actions require authentication
    if(action === 'logon') {
      // No authentication -- simply return the passed token, "local host" as
      // server name, and the identifier of the solver
      serveJSON(res,
          {token: 'local host', server: 'local host', solver: SOLVER.id});
    } else if(action === 'png') {
      convertSVGtoPNG(req, res, sp);
    } else if(action === 'solve') {
      serveJSON(res, SOLVER.solveBlock(sp));
    } else {
      // Invalid action => return JSON with error message
      const msg = `Invalid action: "${action}"`;
      console.log(msg);
      serveJSON(res, {error: msg});
    }
  } else if(cmd === '/shutdown') {
    // Shut down this server
    serveHTML(res, SHUTDOWN_MESSAGE);
    SERVER.close();
  } else if(cmd === '/auto-check') {
    autoCheck(res);
  } else if(cmd === '/auto-update') {
    autoUpdate(res);
  } else if(cmd === '/check-version') {
    checkVersion(res, (new URLSearchParams(data)).get('v'));
  } else if(cmd === '/repo/') {
    repo(res, new URLSearchParams(data));
  } else if(cmd === '/load-data/') {
    loadData(res, (new URLSearchParams(data)).get('url'));
  } else if(cmd === '/receiver/') {
    receiver(res, new URLSearchParams(data));
  } else {
    serveJSON(res, {error: `Unknown Linny-R request: "${cmd}"`});
  }
}

function servePlainText(res, msg) {
  // Serve string `msg` as plain text
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
  // Serve the specified path (if permitted: only diagrams and static files)
  if(path === '/' || path === '') path = '/index.html';
  if(path.startsWith('/diagrams/')) {
    // Serve diagrams from the (main)/user/diagrams/ sub-directory 
    console.log('Diagram:', path);
    path = '/user' + path; 
  } else {
    // Other files from the (main)/static/ subdirectory
    console.log('Static file:', path);
    path = '/static' + path;
  }
  fs.readFile(MAIN_DIRECTORY + path, (err, data) => {
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

function convertSVGtoPNG(req, res, sp) {
  // Convert SVG data from browser to PNG image using Inkscape
  // NOTE: images can be huge, so send only the file name as response;
  // Linny-R will open a new browser window, load the file, and display it
  const
      svg = decodeURI(atob(sp.get('data'))),
      // Use current time as file name
      fn = 'diagram-' +
          (new Date()).toISOString().slice(0, 19).replace(/[\-\:]/g, ''),
      fp = path.join(WORKSPACE.diagrams, fn);
  // NOTE: use binary encoding for SVG file
  console.log('Saving SVG file:', fp);
  try {
    fs.writeFileSync(fp + '.svg', svg);
  } catch(error) {
    console.log('WARNING: Failed to save SVG --', error);
  }
  // Use Inkscape to convert SVG to the requested format
  if(SETTINGS.inkscape) {
    console.log('Rendering image');
    let
      cmd = SETTINGS.inkscape,
      svg = fp + '.svg';
    // Enclose paths in double quotes if they contain spaces
    if(cmd.indexOf(' ') >= 0) cmd = `"${cmd}"`;
    if(svg.indexOf(' ') >= 0) svg = `"${svg}"`;
    child_process.exec(cmd + ' --export-type=png --export-dpi=' +
        SETTINGS.dpi + ' ' + svg,
        (error, stdout, stderr) => {
            let ext = '.svg';
            console.log(stdout);
            if(error) {
              console.log('WARNING: Failed to run Inkscape --', error);
              console.log(stderr);
            } else {
              ext = '.png';
              // Delete the SVG
              try {
                fs.unlinkSync(fp + '.svg');
              } catch(error) {
                console.log(`NOTICE: Failed to delete SVG file "${fp}.svg"`);
              }
            }
            // Return the image file name (PNG if successful, otherwise SVG) 
            servePlainText(res, 'diagrams/' + fn + ext);
          }
      );
  } else {
    servePlainText(res, 'diagrams/' + fn + '.svg');
  }
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

//
// Functions used during initialization
//

function commandLineSettings() {
  // Sets default settings, and then checks the command line arguments
  const settings = {
      cli_name: (PLATFORM.startsWith('win') ? 'Command Prompt' : 'Terminal'),
      inkscape: '',
      dpi: 300,
      launch: false,
      port: 5050,
      preferred_solver: '',
      solver: '',
      solver_path: '',
      user_dir: path.join(WORKING_DIRECTORY, 'user')
    };
  for(let i = 2; i < process.argv.length; i++) {
    const lca = process.argv[i].toLowerCase();
    if(lca === 'launch') {
      settings.launch = true;
    } else {
      const av = lca.split('=');
      if(av.length === 1) av.push('');
      if(av[0] === 'port') {
        // Accept any number greater than or equal to 1024
        const n = parseInt(av[1]);
        if(isNaN(n) || n < 1024) {
          console.log(`WARNING: Invalid port number ${av[1]}`);
        } else {
          settings.port = n;
        }
      } else if(av[0] === 'solver') {
        if(av[1] !== 'gurobi' && av[1] !== 'lp_solve') {
          console.log(`WARNING: Unknown solver "${av[1]}"`);
        } else {
          settings.preferred_solver = av[1];
        }
      } else if(av[0] === 'dpi') {
        // Accept any number greater than or equal to 1024
        const n = parseInt(av[1]);
        if(isNaN(n) || n > 1200) {
          console.log(`WARNING: Invalid resolution ${av[1]} (max. 1200 dpi)`);
        } else {
          settings.dpi = n;
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
      } else {
        // Terminate script
        console.log(
            `ERROR: Invalid command line argument "${process.argv[i]}"`);
        process.exit();
      }
    }
  }
  // Check whether MILP solver(s) and Inkscape have been installed
  const path_list = process.env.PATH.split(path.delimiter);
  let gurobi_path = '',
      match,
      max_v = -1;
  for(let i = 0; i < path_list.length; i++) {
    match = path_list[i].match(/gurobi(\d+)/i);
    if(match && parseInt(match[1]) > max_v) {
      gurobi_path = path_list[i];
      max_v = parseInt(match[1]);
    }
    match = path_list[i].match(/inkscape/i);
    if(match) settings.inkscape = path_list[i];
  }
  if(!gurobi_path && !PLATFORM.startsWith('win')) {
    console.log('Looking for Gurobi in /usr/local/bin');
    try {
      // On macOS and Unix, Gurobi is in the user's local binaries
      const gp = '/usr/local/bin';
      fs.accessSync(gp + '/gurobi_cl');
      gurobi_path = gp;
    } catch(err) {
      // No real error, so no action needed
    }
  }
  if(gurobi_path) {
    console.log('Path to Gurobi:', gurobi_path);
    // Check if command line version is executable
    const sp = path.join(gurobi_path,
        'gurobi_cl' + (PLATFORM.startsWith('win') ? '.exe' : ''));
    try {
      fs.accessSync(sp, fs.constants.X_OK);
      if(settings.solver !== 'gurobi') 
      settings.solver = 'gurobi';
      settings.solver_path = sp;
    } catch(err) {
      console.log(err.message);
      console.log(
          'WARNING: Failed to access the Gurobi command line application');
    }
  }
  // Check if lp_solve(.exe) exists in working directory
  const
      sp = path.join(WORKING_DIRECTORY,
          'lp_solve' + (PLATFORM.startsWith('win') ? '.exe' : '')),
      need_lps = !settings.solver || settings.preferred_solver === 'lp_solve';
  try {
    fs.accessSync(sp, fs.constants.X_OK);
    console.log('Path to LP_solve:', sp);
    if(need_lps) {
      settings.solver = 'lp_solve';
      settings.solver_path = sp;
    }
  } catch(err) {
    // Only report error if LP_solve is needed
    if(need_lps) {
      console.log(err.message);
      console.log('WARNING: LP_solve application not found in', sp);
    }
  }
  // On macOS, Inkscape is not added to the PATH environment variable 
  if(!settings.inkscape && PLATFORM === 'darwin') {
    console.log('Looking for Inkscape in Applications...');
    try {
      // Look in the default directory
      const ip = '/Applications/Inkscape.app/Contents/MacOS';
      fs.accessSync(ip);
      settings.inkscape = ip;
    } catch(err) {
      // No real error, so no action needed
    }
  }
  // Verify that Inkscape is installed
  if(settings.inkscape) {
    // NOTE: on Windows, the command line version is a .com file
    const ip = path.join(settings.inkscape,
        'inkscape' + (PLATFORM.startsWith('win') ? '.com' : ''));
    try {
      fs.accessSync(ip, fs.constants.X_OK);
      console.log('Path to Inkscape:', settings.inkscape);
      settings.inkscape = ip;
      console.log(
          `SVG will be rendered with ${settings.dpi} dpi resolution`);
    } catch(err) {
      settings.inkscape = '';
      console.log(err.message);
      console.log(
          'WARNING: Failed to access the Inkscape command line application');
    }
  } else {
    console.log(
        'Inkscape not installed, so images will not be rendered as PNG');
  }
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
      channel: path.join(SETTINGS.user_dir, 'channel'),
      callback: path.join(SETTINGS.user_dir, 'callback'),
      diagrams: path.join(SETTINGS.user_dir, 'diagrams'),
      modules: path.join(SETTINGS.user_dir, 'modules'),
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
  // Return the updated workspace object
  return ws;
}

function createLaunchScript() {
  // Creates platform-specific script with Linny-R start-up command
  const lines = [
      '# The first line (without the comment symbol #) should be like this:',
      '# cd ',
      '',
      '# Then this command to launch the Linny-R server should work:',
      'node ' + path.join('node_modules', 'linny-r', 'server') + ' launch'
    ];
  let sp;
  if(PLATFORM.startsWith('win')) {
    sp = path.join(WORKING_DIRECTORY, 'linny-r.bat');
    lines[1] += 'C:\\path\\to\\main\\Linny-R\\directory';
  } else {
    sp = path.join(WORKING_DIRECTORY, 'linny-r.command'); 
    lines[1] += '/path/to/main/Linny-R/directory';
  }
  lines[2] = 'cd ' + WORKING_DIRECTORY;
  try {
    try {
      fs.accessSync(sp);
    } catch(err) {
      // Only write the script content if the file it does not yet exist
      console.log('Creating launch script:', sp);
      let code = lines.join(os.EOL);
      if(PLATFORM.startsWith('win')) code = code.replaceAll('#', '::');
      fs.writeFileSync(sp, code, 'utf8');
    }
  } catch(err) {
    console.log('WARNING: Failed to create launch script');
  }
}

/////////////////////////////////////////////////////////////////////////////
//                           Code ends here                                //
/////////////////////////////////////////////////////////////////////////////