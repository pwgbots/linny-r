/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This NodeJS script (post-install.js) checks whether the Linny-R directory
contains a launch script for Linny-R. For macOS, the script file is
`linny-r.command`, for Windows `linny-r.bat`.
If such a file already exists, this script will try to rename it, adding
the prefix `OLD-` to the name. Doing this will make that the the Linny-R
server script will create the newest version of the launch script the
first time it is run.

The launch script has two intended functions:
(1) to facilitate start-up: the user can type `linny-r` at the command
    line prompt,and (more importantly) create a clickable icon as desktop
    shortcut.
(2) to facilitate automatic software updates: when (after lauch in a browser)
    Linny-R detects a newer version, it will prompt the user whether this
    update should be installed. When the user confirms, the server script
    is terminated, and then launch script executes the commands to update
    and then restart the Linny-R server.

The README.md file explains how the script file can be used for single-click
launch of Linny-R, and how the "workspace" parameter can be used in a
multi-user network environment to provide individual workspaces for users.
*/
/*
Copyright (c) 2020-2024 Delft University of Technology

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

const
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    PLATFORM = os.platform(),
    mod_dir = path.join('node_modules', 'linny-r'),
    // NOTE: working directory for this script is the *module* directory,
    // which is two levels deeper than the actual working directory
    WORKING_DIRECTORY = process.cwd().replace(path.sep + mod_dir, ''),
    ext = (PLATFORM.startsWith('win') ? 'bat' : 'command'),
    sp = path.join(WORKING_DIRECTORY, 'linny-r.' + ext);

// NOTE: Function `createLaunchScript` is a copy of this function as
// defined in script file `server.js`.

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

// First rename the existing script (if any) as this may have been changed
// by the user, and the idea of the changes would be lost by overwriting it.
try {
  fs.accessSync(sp);
  try {
    // Only rename the script content if the file it does not yet exist
    console.log('Renaming existing launch script:', sp);
    fs.renameSync(sp, path.join(WORKING_DIRECTORY, 'OLD-linny-r.' + ext));
  } catch(err) {
    console.log('WARNING: Failed to rename existing launch script');
  }
} catch(err) {
  // No existing script => action needed.
}

// Then create new launch script. This way, after update or clean install,
// the user can
createLaunchScript();

